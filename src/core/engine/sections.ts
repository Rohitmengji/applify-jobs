import type { Profile, Experience, Education } from '../profile.schema';
import { setReactInputValue, setCheckbox, setCustomDropdown, setNativeSelect, sleep } from './fill';
import { extractSignals } from './signals';
import { isSensitiveLabel } from './learn';

// IMPLEMENTATION.md §14 — repeatable sections (Work Experience, Education).
//
// These are the most time-consuming part of any application and the highest-value thing to
// automate. They're also the most dangerous to automate: the "Add another" interaction is a
// loop over DOM the extension mutates, so a naive implementation can add rows forever or
// hang waiting for a row that never renders. This module is built defensively around that.
//
// SAFETY INVARIANTS (do not weaken):
//   1. The fill loop is bounded by BOTH the profile row count AND a hard cap.
//   2. We add a row only when we need more than already exist (idempotent re-runs).
//   3. After clicking "Add", we poll for a NEW row of THIS section's specific selector,
//      with a hard timeout. If it doesn't appear, we stop. A wrong/blind "Add" click can
//      therefore never hang — it just fails to grow our count and the loop exits.
//   4. Per-row filling is best-effort: a throw in one field/row never aborts the rest and
//      never propagates to the caller (the page is left usable).
//   5. We never click delete/remove controls.

const HARD_ROW_CAP = 8; // never create more than this many rows, whatever the profile says
const ADD_WAIT_MS = 3500; // max time to wait for a newly-added row to render
const POLL_MS = 150;

// Data shapes the fillers consume (a narrow view of the profile rows).
export interface ExpData {
  title: string;
  company: string;
  location?: string;
  startDate: string; // YYYY | YYYY-MM | YYYY-MM-DD
  endDate?: string;
  current: boolean;
  description?: string;
}
export interface EduData {
  school: string;
  degree: string;
  field?: string;
  startDate?: string;
  endDate?: string;
  gpa?: string;
}

// A spec describes how to drive ONE repeatable section on ONE ATS. Adapters supply the
// selectors; the driver below supplies the safe, bounded control flow.
interface SectionSpec<T> {
  // Current row/panel elements in document order.
  rows(doc: Document): HTMLElement[];
  // The "Add another" button for THIS section, or null if none is available.
  addButton(doc: Document): HTMLElement | null;
  // Fill one row's fields from a data object. Best-effort; may throw (driver catches).
  fillRow(row: HTMLElement, data: T): Promise<void>;
}

// Wait until at least `target` rows exist, or the timeout elapses. Returns whether the
// target was reached. This is the hang guard: it always resolves within ADD_WAIT_MS.
async function waitForRows<T>(spec: SectionSpec<T>, target: number): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < ADD_WAIT_MS) {
    if (spec.rows(document).length >= target) return true;
    await sleep(POLL_MS);
  }
  return false;
}

// The safe driver. Fills up to `items.length` rows (capped), adding rows as needed.
// `found` reports whether the section is present on the page at all (a row or an Add button),
// so the caller can distinguish "no such section here" from "section present but unfilled".
async function driveSection<T>(
  spec: SectionSpec<T>,
  items: T[],
): Promise<{ filled: number; found: boolean }> {
  const found = spec.rows(document).length > 0 || !!spec.addButton(document);
  const wanted = Math.min(items.length, HARD_ROW_CAP);
  let filled = 0;
  for (let i = 0; i < wanted; i++) {
    let rows = spec.rows(document);

    // Need a row at index i that doesn't exist yet → add one, bounded + timeout-guarded.
    if (i >= rows.length) {
      const add = spec.addButton(document);
      if (!add) break; // no way to add more → stop cleanly (invariant 3)
      const before = rows.length;
      add.click();
      const grew = await waitForRows(spec, before + 1);
      if (!grew) break; // row never rendered → stop, never loop (invariant 3)
      rows = spec.rows(document);
    }

    const row = rows[i];
    if (!row) break;
    try {
      await spec.fillRow(row, items[i]);
      filled++;
    } catch {
      /* best-effort: leave this row partial, keep going (invariant 4) */
    }
    await sleep(120); // let the framework register the row before touching the next
  }
  return { filled, found };
}

// ---------------------------------------------------------------------------
// Workday specs. Automation-ids are the stable hook; they still drift between tenants, so
// each lookup is defensive and the driver tolerates misses. Verify against a live page.
// ---------------------------------------------------------------------------

const qIn = (root: ParentNode, sel: string) => root.querySelector<HTMLElement>(sel);

// Set a Workday month/year date widget (two spinbutton inputs) from an ISO-ish string.
function setWorkdayDate(scope: HTMLElement | null, iso?: string): void {
  if (!scope || !iso) return;
  const [y, m] = iso.split('-');
  const month = qIn(scope, '[data-automation-id="dateSectionMonth-input"]');
  const year = qIn(scope, '[data-automation-id="dateSectionYear-input"]');
  if (month instanceof HTMLInputElement && m) setReactInputValue(month, String(parseInt(m, 10)));
  if (year instanceof HTMLInputElement && y) setReactInputValue(year, y);
}

// Find a section's "Add" button, scoped to the section container when we can identify it so
// we don't click a different section's Add. Excludes delete/remove controls.
function findAddButton(container: ParentNode): HTMLElement | null {
  const btns = Array.from(container.querySelectorAll<HTMLElement>('button, [role="button"]'));
  return (
    btns.find((b) => {
      const aid = (b.getAttribute('data-automation-id') ?? '').toLowerCase();
      const txt = (b.textContent ?? '').trim().toLowerCase();
      if (/delete|remove/.test(aid) || /delete|remove/.test(txt)) return false;
      return aid === 'add' || /^add( another| more)?$/.test(txt);
    }) ?? null
  );
}

// The container of a section (explicit wrapper, common ancestor of its panels, or — on a
// fresh form with neither — the region under a matching section heading). Returns null rather
// than falling back to the whole document, so findAddButton can't click a DIFFERENT section's
// "Add" (which would add a stray panel elsewhere and then time out waiting for our row).
function sectionScope(
  doc: Document,
  wrapperSel: string,
  panelSel: string,
  headingRe: RegExp,
): ParentNode | null {
  const explicit = doc.querySelector<HTMLElement>(wrapperSel);
  if (explicit) return explicit;
  const panels = Array.from(doc.querySelectorAll<HTMLElement>(panelSel));
  if (panels.length) {
    let anc: HTMLElement | null = panels[0].parentElement;
    while (anc && !panels.every((p) => anc!.contains(p))) anc = anc.parentElement;
    return anc;
  }
  return findSectionContainer(headingRe); // heading-based, or null if the section isn't here
}

function workdayExperienceSpec(): SectionSpec<ExpData> {
  const PANEL = '[data-automation-id^="workExperience-"]';
  const WRAPPER =
    '[data-automation-id="workExperienceSection"], [data-automation-id="Work-Experience"]';
  return {
    rows: (doc) => Array.from(doc.querySelectorAll<HTMLElement>(PANEL)),
    addButton: (doc) => {
      const scope = sectionScope(doc, WRAPPER, PANEL, EXP_HEADING);
      return scope ? findAddButton(scope) : null;
    },
    fillRow: async (row, d) => {
      const title = qIn(row, '[data-automation-id="jobTitle"]');
      if (title instanceof HTMLInputElement && d.title) setReactInputValue(title, d.title);

      const company = qIn(row, '[data-automation-id="company"]');
      if (company instanceof HTMLInputElement && d.company) setReactInputValue(company, d.company);

      const loc = qIn(row, '[data-automation-id="location"]');
      if (loc instanceof HTMLInputElement && d.location) setReactInputValue(loc, d.location);

      // "I currently work here" must be set BEFORE the end date — checking it disables the
      // end-date field, so we only fill end date when the role isn't current.
      if (d.current) {
        const cb = row.querySelector<HTMLInputElement>(
          '[data-automation-id="currentlyWorkHere"] input, input[type="checkbox"]',
        );
        if (cb) setCheckbox(cb, true);
      }

      setWorkdayDate(
        qIn(row, '[data-automation-id*="startDate"], [data-automation-id*="dateFrom"]'),
        d.startDate,
      );
      if (!d.current && d.endDate) {
        setWorkdayDate(
          qIn(row, '[data-automation-id*="endDate"], [data-automation-id*="dateTo"]'),
          d.endDate,
        );
      }

      const desc = qIn(row, '[data-automation-id="roleDescription"], textarea');
      if (
        (desc instanceof HTMLTextAreaElement || desc instanceof HTMLInputElement) &&
        d.description
      )
        setReactInputValue(desc, d.description);
    },
  };
}

function workdayEducationSpec(): SectionSpec<EduData> {
  const PANEL = '[data-automation-id^="education-"]';
  const WRAPPER = '[data-automation-id="educationSection"], [data-automation-id="Education"]';
  return {
    rows: (doc) => Array.from(doc.querySelectorAll<HTMLElement>(PANEL)),
    addButton: (doc) => {
      const scope = sectionScope(doc, WRAPPER, PANEL, EDU_HEADING);
      return scope ? findAddButton(scope) : null;
    },
    fillRow: async (row, d) => {
      const school = qIn(row, '[data-automation-id="school"]');
      if (school instanceof HTMLInputElement && d.school) setReactInputValue(school, d.school);

      // Degree is a custom "select one" dropdown on most tenants, but a plain text input or
      // native <select> on others — handle whichever this tenant renders.
      const degree = qIn(row, '[data-automation-id="degree"]');
      if (degree && d.degree) {
        if (degree instanceof HTMLInputElement) setReactInputValue(degree, d.degree);
        else if (degree instanceof HTMLSelectElement) setNativeSelect(degree, d.degree);
        else {
          try {
            await setCustomDropdown(degree, d.degree, {
              optionSelector: '[data-automation-id*="promptOption"], [role=option]',
              typeToFilter: true,
            });
          } catch {
            /* degree is optional/best-effort */
          }
        }
      }

      setWorkdayDate(
        qIn(row, '[data-automation-id*="startDate"], [data-automation-id*="dateFrom"]'),
        d.startDate,
      );
      setWorkdayDate(
        qIn(row, '[data-automation-id*="endDate"], [data-automation-id*="dateTo"]'),
        d.endDate,
      );

      const gpa = qIn(row, '[data-automation-id="gradeAverage"], [data-automation-id="gpa"]');
      if (gpa instanceof HTMLInputElement && d.gpa) setReactInputValue(gpa, d.gpa);
    },
  };
}

// Map a profile Experience row to the filler's view, dropping incomplete rows (a row with
// no company AND no title would only create empty panels).
function toExpData(e: Experience): ExpData | null {
  if (!e.company && !e.title) return null;
  return {
    title: e.title ?? '',
    company: e.company ?? '',
    location: e.location,
    startDate: e.startDate ?? '',
    endDate: e.endDate,
    current: !!e.current,
    description: e.description,
  };
}
function toEduData(e: Education): EduData | null {
  if (!e.school && !e.degree) return null;
  return {
    school: e.school ?? '',
    degree: e.degree ?? '',
    field: e.field,
    startDate: e.startDate,
    endDate: e.endDate,
    gpa: e.gpa,
  };
}

// ---------------------------------------------------------------------------
// Generic, label-driven filler — for ATSs without stable repeater selectors (iCIMS,
// SuccessFactors, Oracle/Taleo, and bespoke career sites). Their own adapters note the ids
// are generated, so we key off visible labels instead.
//
// SAFETY: this is deliberately conservative to avoid mis-filling unrelated fields.
//   • It only runs INSIDE a container identified by a real section heading ("Work
//     Experience" / "Education"). No heading → no-op. So it never touches a plain form.
//   • It NEVER clicks "Add" — it fills only rows already present, aligned by DOM order
//     (the Nth company/title/date belong to the Nth row). No DOM-mutating loop → no hang.
//   • Only fields whose label clearly matches a sub-field are touched; capped at HARD_ROW_CAP.
// ---------------------------------------------------------------------------

// Anchored to the START of the (trimmed) heading so a standalone "Experience"/"Employment"
// heading matches but a qualified phrase like "Years of experience" (a plain question on a
// non-section form) does NOT — which would otherwise make the generic filler treat a normal
// form as the Experience section and mis-fill it.
const EXP_HEADING =
  /^(work |professional |previous )?experience\b|^employment( history| background)?\b|^work history\b/i;
const EDU_HEADING =
  /^education\b|^academic (background|history)\b|^educational\b|^qualifications?\b/i;

// Order matters: more specific / checkbox-ish keys are tested before generic ones so
// "end date" isn't captured by the "date"-ish start rule, etc. First match wins per control.
const EXP_SUBKEYS: { key: keyof ExpData; re: RegExp }[] = [
  { key: 'current', re: /currently work(ing)? here|i currently|present(ly)?$/i },
  { key: 'endDate', re: /end date|to date|end year|end month|\buntil\b|\bto\b/i },
  { key: 'startDate', re: /start date|from date|start year|start month|\bfrom\b|\bstart\b/i },
  { key: 'title', re: /job title|position|role|designation|\btitle\b/i },
  { key: 'company', re: /company|employer|organi[sz]ation/i },
  { key: 'location', re: /location|city/i },
  { key: 'description', re: /description|responsibilit|duties|summary|achievement/i },
];
const EDU_SUBKEYS: { key: keyof EduData; re: RegExp }[] = [
  { key: 'endDate', re: /end date|to date|graduation|end year|completed|\buntil\b|\bto\b/i },
  { key: 'startDate', re: /start date|from date|start year|\bfrom\b|\bstart\b/i },
  { key: 'school', re: /school|university|college|institution|institute/i },
  { key: 'degree', re: /degree|qualification/i },
  { key: 'field', re: /field of study|major|spec[ai]li[sz]ation|discipline|stream/i },
  { key: 'gpa', re: /gpa|cgpa|grade|percentage|marks/i },
];

const HEADING_SEL =
  'h1,h2,h3,h4,h5,h6,legend,[role="heading"],[class*="section-title"],[class*="sectionTitle"],[class*="section-header"]';

// Find a titled section: a short heading matching `re`, plus its nearest ancestor holding
// form controls. Returns the heading too so the filler can bound itself to that heading's own
// range (so an over-broad ancestor can't swallow later, unrelated fields).
function findSection(re: RegExp): { container: HTMLElement; heading: HTMLElement } | null {
  const headings = Array.from(document.querySelectorAll<HTMLElement>(HEADING_SEL));
  for (const h of headings) {
    const txt = (h.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!txt || txt.length > 60 || !re.test(txt)) continue;
    let anc: HTMLElement | null = h.parentElement;
    for (let i = 0; i < 6 && anc; i++, anc = anc.parentElement) {
      if (anc.querySelector('input:not([type=hidden]), select, textarea'))
        return { container: anc, heading: h };
    }
  }
  return null;
}

// Thin wrapper for callers that only need the container (sectionScope).
function findSectionContainer(re: RegExp): HTMLElement | null {
  return findSection(re)?.container ?? null;
}

// The highest ancestor of `anchor` (within `section`) that still contains exactly ONE anchor
// — i.e. the element representing one row. Lets us align sub-fields by DOM containment when
// rows are wrapped, instead of a fragile per-key occurrence index.
function rowContainerOf(
  anchor: HTMLElement,
  section: HTMLElement,
  anchors: HTMLElement[],
): HTMLElement {
  let node: HTMLElement = anchor;
  let parent = node.parentElement;
  while (parent && parent !== section && anchors.filter((a) => parent!.contains(a)).length <= 1) {
    node = parent;
    parent = node.parentElement;
  }
  return node;
}

function controlIsShown(el: HTMLElement): boolean {
  const s = getComputedStyle(el);
  return s.display !== 'none' && s.visibility !== 'hidden';
}

function controlLabel(el: HTMLElement): string {
  const s = extractSignals(el);
  return (s.label || s.ariaLabel || s.placeholder || s.nearbyText || s.name || '').toLowerCase();
}

// Format an ISO-ish date (YYYY | YYYY-MM | YYYY-MM-DD) for the target input's type.
function dateForInput(el: HTMLInputElement, iso: string): string {
  const [y, m = '01', d = '01'] = iso.split('-');
  if (el.type === 'month') return `${y}-${m.padStart(2, '0')}`;
  if (el.type === 'date') return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  return iso; // text: keep as authored (YYYY or YYYY-MM)
}

function fillTextLike(el: HTMLElement, value: string): void {
  if (!value) return;
  if (el instanceof HTMLSelectElement) setNativeSelect(el, value);
  else if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)
    setReactInputValue(el, value);
}

// Classify a control's label into a sub-field key (first match wins; "current" only for a
// checkbox). Returns null if nothing matches or the label is genuinely sensitive. We use the
// protected-ONLY check (not the search-box heuristic) so a "Search company" typeahead — which
// IS the company field — still classifies, while EEO/DOB/financial labels are still blocked.
function classifySub<T>(el: HTMLElement, subkeys: { key: keyof T; re: RegExp }[]): keyof T | null {
  const label = controlLabel(el);
  if (!label || isSensitiveLabel(label)) return null;
  for (const { key, re } of subkeys) {
    if (!re.test(label)) continue;
    if (
      key === ('current' as keyof T) &&
      !(el instanceof HTMLInputElement && el.type === 'checkbox')
    )
      continue;
    return key;
  }
  return null;
}

// Fill a titled section by label, aligning sub-fields by DOM containment when rows are
// wrapped (falling back to positional index for flat layouts). Only touches controls within
// the heading's own range, skips protected/search fields, never clicks "Add" (loop-free over
// static DOM → cannot hang). Returns found=true when the section exists so the panel can warn.
function fillGenericSection<T extends ExpData | EduData>(
  kind: 'experience' | 'education',
  items: T[],
): { filled: number; found: boolean } {
  const sec = findSection(kind === 'experience' ? EXP_HEADING : EDU_HEADING);
  if (!sec) return { filled: 0, found: false }; // no such section → don't warn
  const { container, heading } = sec;

  const subkeys = (kind === 'experience' ? EXP_SUBKEYS : EDU_SUBKEYS) as {
    key: keyof T;
    re: RegExp;
  }[];

  // Bound to the heading's range: after THIS heading and before the next SECTION heading, so
  // an over-broad container can't leak into unrelated fields. The boundary must be OUTSIDE the
  // container — otherwise a per-row <legend>/sub-heading inside the section would truncate the
  // range to zero and leave the whole section unfilled.
  const allHeadings = Array.from(document.querySelectorAll<HTMLElement>(HEADING_SEL));
  const nextHeading = allHeadings.find(
    (h) =>
      h !== heading &&
      !container.contains(h) &&
      !!(heading.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
  const inRange = (el: HTMLElement): boolean => {
    const afterHeading = !!(heading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    const beforeNext =
      !nextHeading || !(nextHeading.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
    return afterHeading && beforeNext;
  };

  const controls = Array.from(
    container.querySelectorAll<HTMLElement>(
      'input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=reset]), select, textarea',
    ),
  ).filter((el) => controlIsShown(el) && inRange(el));

  const buckets = new Map<keyof T, HTMLElement[]>();
  for (const el of controls) {
    const key = classifySub<T>(el, subkeys);
    if (!key) continue;
    const list = buckets.get(key) ?? [];
    list.push(el);
    buckets.set(key, list);
  }

  // Anchors define rows (most distinctive field first).
  const anchors =
    (kind === 'experience'
      ? (buckets.get('company' as keyof T) ?? buckets.get('title' as keyof T))
      : (buckets.get('school' as keyof T) ?? buckets.get('degree' as keyof T))) ?? [];
  if (!anchors.length) return { filled: 0, found: true }; // section present but unrecognized

  const rowCount = Math.min(anchors.length, items.length, HARD_ROW_CAP);
  let filled = 0;
  for (let i = 0; i < rowCount; i++) {
    const rowEl = rowContainerOf(anchors[i], container, anchors);
    // A real per-ROW wrapper holds more than one of this section's controls; a flat layout
    // (fields directly under the section, or one wrapper PER FIELD) does not. Only in the flat
    // case do we fall back to positional index — in a real row wrapper a containment miss
    // means the field is genuinely absent, so we must NOT grab another row's control.
    const rowIsWrapper = controls.filter((c) => rowEl.contains(c)).length > 1;
    const data = items[i] as ExpData & EduData;
    // Prefer the control inside this row's wrapper (containment alignment); for flat layouts
    // fall back to the i-th occurrence of the sub-field.
    const pick = (key: keyof T): HTMLElement | undefined => {
      const bucket = buckets.get(key) ?? [];
      return bucket.find((b) => rowEl.contains(b)) ?? (rowIsWrapper ? undefined : bucket[i]);
    };
    let any = false;
    for (const { key } of subkeys) {
      const el = pick(key);
      if (!el) continue;
      if (key === ('current' as keyof T)) {
        if (data.current) {
          const cb =
            el instanceof HTMLInputElement && el.type === 'checkbox'
              ? el
              : el.querySelector<HTMLInputElement>('input[type=checkbox]');
          if (cb) {
            setCheckbox(cb, true);
            any = true;
          }
        }
        continue;
      }
      if (key === ('endDate' as keyof T) && data.current) continue; // current → leave end blank
      const raw = data[key as keyof (ExpData & EduData)] as string | undefined;
      if (!raw) continue;
      const value =
        (key === ('startDate' as keyof T) || key === ('endDate' as keyof T)) &&
        el instanceof HTMLInputElement
          ? dateForInput(el, raw)
          : raw;
      fillTextLike(el, value);
      any = true;
    }
    if (any) filled++;
  }
  return { filled, found: true };
}

// Registry of section fillers by adapter id. Only ATSs with genuine repeaters appear here;
// everything else is a no-op (resume-upload ATSs like Greenhouse have no such section).
const SPECS: Record<
  string,
  { experience: () => SectionSpec<ExpData>; education: () => SectionSpec<EduData> }
> = {
  workday: { experience: workdayExperienceSpec, education: workdayEducationSpec },
};

/**
 * Fill the repeatable Work Experience and Education sections for the current ATS.
 * Safe to call on any page: returns all-zero/absent for adapters without a spec, or when the
 * profile has no rows. `*Found` reports whether the section was present on the page at all,
 * so the caller can warn only when a section existed but couldn't be filled (not on forms
 * that simply have no such section). Never throws; never hangs (see invariants above).
 */
export async function fillRepeatableSections(
  profile: Profile,
  adapterId: string | null,
): Promise<{ experience: number; education: number; expFound: boolean; eduFound: boolean }> {
  const expItems = (profile.experience ?? []).map(toExpData).filter((x): x is ExpData => !!x);
  const eduItems = (profile.education ?? []).map(toEduData).filter((x): x is EduData => !!x);
  const empty = { experience: 0, education: 0, expFound: false, eduFound: false };
  if (!expItems.length && !eduItems.length) return empty;

  const specs = adapterId ? SPECS[adapterId] : undefined;

  let experience = 0;
  let education = 0;
  let expFound = false;
  let eduFound = false;
  try {
    // Adapter-driven (Workday: stable selectors + "Add another"); otherwise the conservative,
    // heading-gated generic filler that fills pre-existing rows on any ATS / career site.
    if (expItems.length) {
      const r = specs
        ? await driveSection(specs.experience(), expItems)
        : fillGenericSection('experience', expItems);
      experience = r.filled;
      expFound = r.found;
    }
  } catch {
    /* whole-section failure is non-fatal */
  }
  try {
    if (eduItems.length) {
      const r = specs
        ? await driveSection(specs.education(), eduItems)
        : fillGenericSection('education', eduItems);
      education = r.filled;
      eduFound = r.found;
    }
  } catch {
    /* whole-section failure is non-fatal */
  }
  return { experience, education, expFound, eduFound };
}

// Exported for unit testing the driver in isolation (see tests/sections.test.ts).
export const __test = { driveSection, HARD_ROW_CAP };
