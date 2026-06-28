import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import { setCustomDropdown } from '../fill';
import type { DetectedField } from '../../types';
import type { ProfileKey } from '../../profile.schema';

// IMPLEMENTATION.md §14.5 — Workday (*.myworkdayjobs.com, *.wdN.*). A thick SPA with
// auto-generated, unstable element IDs. The one stable hook is `data-automation-id`.
// Multi-step wizard; we advance to review and never submit.
//
// These automation ids drift between tenants/versions — verify against a live page.
// Only the unambiguous hooks are mapped here. Workday's country/state are custom
// dropdowns whose automation-ids are ambiguous and drift; the heuristic maps them by
// their visible labels instead (avoids the country/state inversion in finding #8).
const DA_MAP: Record<string, ProfileKey> = {
  legalNameSection_firstName: 'personal.firstName',
  legalNameSection_lastName: 'personal.lastName',
  email: 'personal.email',
  'phone-number': 'personal.phone',
  addressSection_addressLine1: 'personal.address.line1',
  addressSection_city: 'personal.address.city',
  addressSection_postalCode: 'personal.address.zip',
};

const da = (doc: Document, id: string) =>
  doc.querySelector<HTMLElement>(`[data-automation-id="${id}"]`);

// Strip Workday's dropdown placeholder echo ("… select one [required]") from a label.
// Only fires when "select one"/"select all that apply" is present, so a real trailing
// "required" on a genuine question isn't removed.
function stripSelectSuffix(s: string): string {
  const out = s.replace(/\s*(select one|select all that apply)\s*(required)?\s*$/i, '').trim();
  return out !== s ? out : '';
}

function labelIsWeak(label: string, daId: string, id: string): boolean {
  const l = label.trim().toLowerCase();
  return !l || l === 'select one' || l === daId.toLowerCase() || l === id.toLowerCase();
}

const NON_LABEL = 'input,select,textarea,button,[role=combobox],[role=listbox],[role=button]';
// Visible text of a Workday formField-* group, excluding the control's own value.
function groupText(node: Element): string {
  let out = '';
  node.childNodes.forEach((c) => {
    if (c.nodeType === Node.TEXT_NODE) out += c.textContent ?? '';
    else if (c.nodeType === Node.ELEMENT_NODE && !(c as Element).matches(NON_LABEL)) {
      out += ' ' + groupText(c as Element);
    }
  });
  return out.replace(/\s+/g, ' ').replace(/\*+$/, '').trim();
}

function workdayLabel(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria) {
    const stripped = stripSelectSuffix(aria) || aria.trim();
    if (stripped && stripped.toLowerCase() !== 'select one') return stripped;
  }
  const group = el.closest('[data-automation-id^="formField-"]');
  if (group) {
    const t = groupText(group);
    if (t) return t;
  }
  return '';
}

export const workday: SiteAdapter = {
  id: 'workday',

  // Anchored to myworkdayjobs.com (covers acme.wd1.myworkdayjobs.com etc.). The bare
  // /\.wdN\./ branch was dropped — it matched spoof hosts like evil.wd1.attacker.com (#7).
  matches(url) {
    return /(^|\.)myworkdayjobs\.com$/.test(url.hostname);
  },

  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const el = doc.querySelector(`[data-oca-uid="${f.uid}"]`);
      const id = el?.getAttribute('data-automation-id') ?? '';
      const key = DA_MAP[id];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.97;
        f.source = 'adapter';
      }
      // Label repair: Workday questionnaire controls often have only an aria-label of the
      // form "<question> select one required", or the question text lives in the wrapping
      // formField-* group. Recover the real question so the panel never shows a raw id.
      if (el) {
        if (labelIsWeak(f.signals.label, id, f.signals.id)) {
          const better = workdayLabel(el);
          if (better) f.signals.label = better;
        } else {
          const stripped = stripSelectSuffix(f.signals.label);
          if (stripped) f.signals.label = stripped;
        }
      }
    }
    return fields;
  },

  // Workday custom dropdowns are a button + popup of [data-automation-id*=promptOption].
  // Throw on a genuine no-match so the generic dispatcher doesn't re-open/re-type the
  // same dropdown (the override is responsible for select-custom here). Finding #12.
  async fillField(field: DetectedField, value: string): Promise<boolean> {
    if (field.kind !== 'select-custom') return false; // not ours → generic path
    const el = document.querySelector<HTMLElement>(`[data-oca-uid="${field.uid}"]`);
    if (!el) return false;
    const ok = await setCustomDropdown(el, value, {
      optionSelector:
        '[data-automation-id*="promptOption"], ul[role=listbox] li[role=option], [role=option]',
    });
    if (!ok) throw new Error('no option matched');
    return true;
  },

  isMultiStep() {
    return true;
  },

  isReviewStep(doc) {
    return !!doc.querySelector(
      '[data-automation-id*="reviewSubmit"], [data-automation-id*="reviewPreview"]',
    );
  },

  findNextButton(doc) {
    return (
      da(doc, 'bottom-navigation-next-button') ??
      Array.from(doc.querySelectorAll('button')).find((b) =>
        /save and continue|continue|next/i.test(b.textContent ?? ''),
      ) ??
      null
    );
  },

  findSubmitButton(doc) {
    return (
      Array.from(doc.querySelectorAll('button')).find((b) =>
        /^submit$/i.test((b.textContent ?? '').trim()),
      ) ?? null
    );
  },
};
