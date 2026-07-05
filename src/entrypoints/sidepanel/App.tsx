import { useCallback, useEffect, useRef, useState } from 'react';
import type { DetectedField, FillSource, WizardStatus } from '@/core/types';
import type { FromContent, FromBackground, ResolvedFill } from '@/core/messages';
import type { ProfileKey, SavedAnswer } from '@/core/profile.schema';
import { getProfile, saveProfile } from '@/core/storage/profileStore';
import { getFile, putBlob } from '@/core/storage/blobStore';
import { recordLearned, countLearned } from '@/core/storage/learnStore';
import { logApplication, findDuplicate } from '@/core/storage/appTracker';
import { saveFillProgress, loadFillProgress, clearFillProgress } from '@/core/storage/fillProgress';
import {
  getVariants,
  switchVariant,
  getActiveVariantId,
  type ProfileVariant,
} from '@/core/storage/profileVariants';
import { learnableEntries } from '@/core/engine/learn';
import { findDuplicateAnswer } from '@/core/llm/answerBank';
import { valueForKey } from '@/core/engine/values';
import { coerceValueForField, extractNumber } from '@/core/engine/fill';
import {
  sendToFrame,
  sendToBackground,
  frameIds,
  fileToB64,
  activeTabId,
  currentWindowId,
  injectContentScript,
} from './lib/messaging';
import { StatusBar } from './components/StatusBar';
import { ReviewTable } from './components/ReviewTable';
import { FillButton } from './components/FillButton';
import { AskAI } from './components/AskAI';
import { JobMatchCard } from './components/JobMatchCard';
import { BatchQueue } from './components/BatchQueue';
import { ReportBug } from './components/ReportBug';
import { analyzeJobDescription, type JdAnalysis } from '@/core/engine/jdAnalysis';

type FilledMap = Record<string, { ok: boolean; error?: string }>;
type LlmPatch = { key: ProfileKey; confidence: number; value: string | null };

// A question that wants a NUMBER, not prose (e.g. LinkedIn "How many years of experience…").
// Type-based always counts; for a single-line text input we also accept common numeric labels
// so a text field asking for years/count gets "3", not "I have 3 years…".
const NUMERIC_Q = /how many|number of|\byears?\b|\bmonths?\b|total\s*experience|\bage\b|gpa|cgpa/i;
function isNumericQuestion(field: DetectedField): boolean {
  if (field.kind === 'number' || field.signals.inputType === 'number') return true;
  if (field.kind !== 'text') return false; // never treat a textarea as numeric
  return NUMERIC_Q.test(
    field.signals.label || field.signals.ariaLabel || field.signals.placeholder || '',
  );
}

// Turn a terse wizard error into something a stranded user can act on. The content script
// emits short machine strings ('wizard failed', 'no adapter', 'busy', …); map the ones we
// know to a next step, and fall back to generic guidance for the rest.
function wizardErrorHelp(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('no adapter'))
    return 'No multi-step handler for this site — use “Fill & Next” to fill each step and advance manually.';
  if (m.includes('busy')) return 'Another action is still running. Wait a moment, then try again.';
  if (m.includes('max') || m.includes('step'))
    return 'The run stopped after too many steps. Click “Next step” to advance manually, then Re-detect.';
  // 'wizard failed' and anything unrecognized:
  return 'The automated run hit a snag. Try “Next step” to advance manually, then Re-detect — your filled values are kept.';
}

export function App() {
  const [fields, setFields] = useState<DetectedField[]>([]);
  const [adapterId, setAdapterId] = useState<string | null>(null);
  const [multiStep, setMultiStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filledMap, setFilledMap] = useState<FilledMap>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<string | null>(null); // "Applied on Jun 15"
  const [status, setStatus] = useState<WizardStatus | null>(null);
  const [threshold, setThreshold] = useState(0.6);
  const [answerBank, setAnswerBank] = useState<SavedAnswer[]>([]);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [tailored, setTailored] = useState<{ text: string; file: File } | null>(null);
  const [tailorBusy, setTailorBusy] = useState(false);
  const [jobMatch, setJobMatch] = useState<JdAnalysis | null>(null);
  const [isRunning, setIsRunning] = useState(false); // a wizard run is in flight (#1)
  const [aiReady, setAiReady] = useState(false); // llmEnabled AND an API key is saved
  // Multi-resume: list + currently selected resume for this fill session
  const [resumeOptions, setResumeOptions] = useState<{ id: string; label: string }[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string | undefined>(undefined);
  const [learnedCount, setLearnedCount] = useState(0); // answers remembered (shown in header)
  // Profile variant switcher
  const [variants, setVariants] = useState<ProfileVariant[]>([]);
  const [activeVariantId, setActiveVariantId] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  // Result of the last section fill (Work Experience / Education), for the post-fill summary.
  const [sections, setSections] = useState<{
    exp: number;
    edu: number;
    expFound: boolean; // section was present on the page (→ warn if present but 0 filled)
    eduFound: boolean;
  } | null>(null);
  const locked = busy || isRunning;

  // Post-fill summary derived from live FIELD_FILLED broadcasts + the section result.
  const okCount = Object.values(filledMap).filter((f) => f.ok).length;
  const failCount = Object.values(filledMap).filter((f) => !f.ok).length;
  const showSummary = okCount + failCount > 0 || sections !== null;

  // Required fields the user still hasn't given a value — surfaced as a pre-submit warning
  // so a real applicant doesn't hit "Fill" and then get the form rejected on the page for a
  // blank mandatory field they never saw. Files are excluded (the résumé attaches on Fill).
  const requiredEmpty = fields.filter(
    (f) => f.signals.required && f.kind !== 'file' && (f.value == null || f.value === ''),
  );

  const tabIdRef = useRef<number | null>(null); // tab this panel is bound to (#5)
  const windowIdRef = useRef<number | undefined>(undefined); // the window this panel lives in
  const adapterFrameRef = useRef(0); // frame that owns the multi-step adapter
  const detectIdRef = useRef(0); // increments each detect() so a slow run can't clobber a newer one
  const committedRef = useRef<Map<string, string>>(new Map()); // uid → last value auto-saved (avoid re-saving)

  // Ask the LLM to map fields the deterministic layers left unmapped, then resolve their
  // values from the profile (§11.4/§11.5). Returns a per-uid patch map so the caller can
  // merge functionally and never clobber a manual edit made during the round-trip (#2).
  const enrichWithLLM = useCallback(
    async (current: DetectedField[]): Promise<Map<string, LlmPatch>> => {
      const out = new Map<string, LlmPatch>();
      const profile = await getProfile();
      if (!profile.settings.llmEnabled) return out;
      const threshold = profile.settings.confidenceThreshold ?? 0.6;

      // Send to LLM: unmapped fields AND low-confidence fields (between 0.3 and threshold).
      // High-confidence fields stay deterministic. Capped at 10 per batch to control cost.
      const candidates = current.filter(
        (f) =>
          f.kind !== 'file' &&
          (f.mappedKey === null || (f.confidence >= 0.3 && f.confidence < threshold)),
      );
      if (candidates.length === 0) return out;
      const batch = candidates.slice(0, 10); // cap per-detection LLM batch

      const res = await sendToBackground<FromBackground>({
        type: 'LLM_MAP_FIELDS',
        unresolved: batch.map((f) => ({ uid: f.uid, signals: f.signals })),
      });
      if (res.type !== 'LLM_MAP_RESULT') return out;

      const byUid = new Map(res.mappings.map((m) => [m.uid, m]));
      for (const f of current) {
        const m = byUid.get(f.uid);
        if (!m || !m.key) continue;
        // Only adopt LLM result if it improves confidence over the current heuristic
        if (f.mappedKey && m.confidence <= f.confidence) continue;
        const key = m.key as ProfileKey;
        const value = key === 'freeText' ? f.value : (valueForKey(profile, key, f) ?? f.value);
        out.set(f.uid, { key, confidence: m.confidence, value });
      }
      return out;
    },
    [],
  );

  // Detect across every frame of the tab (iframe ATSes), tagging each field with its
  // frameId so fills route back to the right frame. Single-frame pages = just frame 0.
  const detect = useCallback(async () => {
    // Tag this run so a slow detect (e.g. LLM enrichment) for a tab the user has since
    // left can't overwrite the newer tab's results (multi-tab race, #switch).
    const runId = ++detectIdRef.current;
    const stale = () => runId !== detectIdRef.current;

    setBusy(true);
    setNotice(null);
    // Reset per-tab UI state up front so the previous job's data never lingers while we
    // switch tabs (blank → new job), and a stuck wizard flag can't disable Re-detect.
    setFields([]);
    setFilledMap({});
    setSections(null);
    setAdapterId(null);
    setMultiStep(false);
    setDuplicate(null);
    setJobMatch(null);
    setCoverLetter(null);
    setStatus(null);
    setIsRunning(false);
    committedRef.current.clear();

    const noContent = () => {
      setNotice(
        'No form fields found. If this is an internal career site: make sure the form is visible, wait for it to fully load, then click Detect again. If the form is inside a popup, open it first.',
      );

      setAdapterId(null);
      setMultiStep(false);
    };
    try {
      const tabId = await activeTabId(windowIdRef.current);
      tabIdRef.current = tabId;

      const profile = await getProfile();
      setThreshold(profile.settings.confidenceThreshold);
      setAnswerBank(profile.answerBank ?? []);
      // Populate resume picker from the multi-doc array
      const resOpts = (profile.documents.resumes ?? []).map((r) => ({
        id: r.id,
        label: r.label || r.filename,
      }));
      setResumeOptions(resOpts);
      setSelectedResumeId(profile.documents.defaultResumeId ?? resOpts[0]?.id);
      void countLearned().then((n) => {
        if (!stale()) setLearnedCount(n);
      });
      // Load profile variants for the switcher
      void Promise.all([getVariants(), getActiveVariantId()]).then(([vs, activeId]) => {
        if (!stale()) {
          setVariants(vs);
          setActiveVariantId(activeId);
        }
      });

      // AI features are only usable when the user enabled them AND saved an API key.
      // Surface that up front so the AI buttons don't fail silently later (see render).
      const { llmApiKey = '' } = await chrome.storage.local.get('llmApiKey');
      const aiUsable = profile.settings.llmEnabled && !!llmApiKey;
      setAiReady(aiUsable);

      // Detect every frame; don't gate on the top frame having a content script — the
      // form may live only inside an iframe (iCIMS). We fail only if NO frame responds (#4).
      const detectFrames = async () => {
        const ids = await frameIds(tabId);
        const perFrame = await Promise.all(
          ids.map(async (fid) => {
            const r = await sendToFrame(tabId, fid, { type: 'DETECT' }).catch(() => null);
            return r && r.type === 'DETECTED'
              ? { fid, fields: r.fields, adapterId: r.adapterId, multiStep: r.multiStep }
              : null;
          }),
        );
        return perFrame.filter((x): x is NonNullable<typeof x> => x !== null);
      };

      let got = await detectFrames();
      // Generic / self-hosted career site: the content script isn't auto-injected there
      // (we narrowed `matches` to known ATS domains for store review). Inject on demand via
      // activeTab, then retry. SPA career pages may render forms late, so we retry with
      // increasing delays to catch lazy-loaded forms.
      if (got.length === 0 && (await injectContentScript(tabId))) {
        await new Promise((r) => setTimeout(r, 400));
        got = await detectFrames();
      }
      // Second attempt with longer delay for SPAs that render forms after initial load
      if (got.length === 0) {
        await new Promise((r) => setTimeout(r, 1500));
        got = await detectFrames();
      }
      // Third attempt — some internal career sites take 3-5s to render after navigation
      if (got.length === 0) {
        await new Promise((r) => setTimeout(r, 2500));
        got = await detectFrames();
      }
      if (got.length === 0) {
        noContent();
        return;
      }
      if (stale()) return; // user switched tabs while we were detecting — abandon this run

      const merged: DetectedField[] = [];
      for (const fr of got) for (const f of fr.fields) merged.push({ ...f, frameId: fr.fid });

      // Prefer a frame that matched an adapter AND actually has fields, so the parent
      // page that merely embeds the form's iframe doesn't claim the wizard (#10/#13).
      const adapterFrames = got.filter((fr) => fr.adapterId);
      const best = adapterFrames.find((fr) => fr.fields.length > 0) ?? adapterFrames[0];
      adapterFrameRef.current = best?.fid ?? 0;
      setFilledMap({});
      setSections(null); // clear the previous fill summary
      setAdapterId(best?.adapterId ?? null);
      setMultiStep(best?.multiStep ?? false);
      setFields(merged);
      setDuplicate(null);

      // Fetch page info (company/role/description/url) ONCE and reuse it for progress
      // restore, duplicate detection, the job-match pre-check, and cover-letter drafting.
      const pi = await sendToFrame(tabId, 0, { type: 'GET_PAGE_INFO' }).catch(() => null);
      const pageInfo = pi?.type === 'PAGE_INFO' ? pi : null;

      if (pageInfo) {
        // Restore saved fill progress (if the user revisits after a crash), then snapshot.
        try {
          const saved = await loadFillProgress(pageInfo.url);
          if (saved) {
            const savedMap = new Map(saved.fields.map((f) => [f.uid, f]));
            setFields((prev) =>
              prev.map((f) => {
                const s = savedMap.get(f.uid);
                if (s?.value && !f.value)
                  return { ...f, value: s.value, source: 'manual' as FillSource };
                return f;
              }),
            );
          }
          void saveFillProgress(pageInfo.url, merged);
        } catch {
          /* non-critical */
        }

        // Duplicate-application warning.
        try {
          const dup = await findDuplicate(pageInfo.url);
          if (!stale() && dup) {
            const daysAgo = Math.round((Date.now() - dup.appliedAt) / (1000 * 60 * 60 * 24));
            setDuplicate(
              `You applied to this role on ${new Date(dup.appliedAt).toLocaleDateString()} (${daysAgo} day${daysAgo === 1 ? '' : 's'} ago)`,
            );
          }
        } catch {
          /* non-critical */
        }

        // Job-match pre-check (Track 4): auto-run so the applicant sees fit + skill gaps
        // BEFORE filling, instead of behind an extra click after they've already committed.
        if (pageInfo.description) {
          try {
            const match = analyzeJobDescription(pageInfo.description, profile);
            if (!stale()) setJobMatch(match);
          } catch {
            /* non-critical */
          }
        }
      }

      // Apply LLM mappings — wrapped in try/catch so LLM failures don't wipe fields
      try {
        const patches = await enrichWithLLM(merged);
        if (!stale() && patches.size > 0) {
          setFields((prev) =>
            prev.map((f) => {
              if (f.source === 'manual') return f;
              const p = patches.get(f.uid);
              return p
                ? {
                    ...f,
                    mappedKey: p.key,
                    source: 'llm' as FillSource,
                    confidence: p.confidence,
                    value: p.value,
                  }
                : f;
            }),
          );
        }
      } catch {
        // LLM enrichment failed (no key, network error) — continue with deterministic results
      }

      // Auto-generate cover letter for cover-letter textareas that are empty.
      // Uses the JD from the page + profile to create a tailored letter. Requires a saved
      // API key (aiUsable), not just llmEnabled, so we don't fire a call that will 401.
      if (aiUsable && pageInfo) {
        const coverLetterField = merged.find((f) => {
          if (f.value) return false; // already has value
          if (f.kind !== 'textarea' && f.kind !== 'text') return false;
          const lbl = (
            f.signals.label ||
            f.signals.ariaLabel ||
            f.signals.placeholder ||
            ''
          ).toLowerCase();
          return /cover letter|covering letter|motivation letter|letter of motivation|why .* this (role|position|company)|why .* join|tell us why/.test(
            lbl,
          );
        });
        if (coverLetterField) {
          try {
            const company = pageInfo.company;
            const role = pageInfo.role;
            if (company || role) {
              const res = await sendToBackground<FromBackground>({
                type: 'LLM_COVER_LETTER',
                company,
                role,
                description: pageInfo.description,
              });
              if (!stale() && res.type === 'LLM_COVER_LETTER_RESULT' && res.text) {
                setFields((prev) =>
                  prev.map((f) =>
                    f.uid === coverLetterField.uid
                      ? {
                          ...f,
                          value: res.text,
                          source: 'llm' as FillSource,
                          confidence: 0.85,
                          reason: 'AI-generated cover letter tailored to job',
                        }
                      : f,
                  ),
                );
              }
            }
          } catch {
            /* non-critical — user can still click "Generate Cover Letter" manually */
          }
        }
      }
    } catch {
      noContent();
    } finally {
      setBusy(false);
    }
  }, [enrichWithLLM]);

  // Detect once on open. Guard against React StrictMode's double-invoke (#20).
  const didMount = useRef(false);
  useEffect(() => {
    if (didMount.current) return;
    didMount.current = true;
    void (async () => {
      windowIdRef.current = await currentWindowId(); // bind to THIS panel's window first
      void detect();
    })();
  }, [detect]);

  // Multi-tab: the side panel is a SINGLE instance shared across the window's tabs. Re-detect
  // whenever the user switches to another tab, or the bound tab navigates to a new job (SPA or
  // full load), so the panel always reflects the job the user is looking at — never a stale one.
  // Debounced so rapid tab-flipping only detects the tab they actually land on.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void detect(), 120);
    };
    const onActivated = (info: chrome.tabs.TabActiveInfo) => {
      // onActivated fires for EVERY window; only react to switches in our own window so a
      // second window's panel doesn't rebind us to the wrong tab (#multi-window).
      if (windowIdRef.current != null && info.windowId !== windowIdRef.current) return;
      schedule();
    };
    const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      // Only when the tab THIS panel is bound to navigates to a new URL (new job on same tab).
      if (tabId === tabIdRef.current && changeInfo.url) schedule();
    };
    chrome.tabs.onActivated.addListener(onActivated);
    chrome.tabs.onUpdated.addListener(onUpdated);
    return () => {
      if (timer) clearTimeout(timer);
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, [detect]);

  // Live updates broadcast by the content script during fill / wizard runs.
  useEffect(() => {
    const handler = (msg: FromContent, sender: chrome.runtime.MessageSender) => {
      if (tabIdRef.current != null && sender.tab?.id !== tabIdRef.current) return; // other tab (#5)
      const fid = sender.frameId ?? 0;
      if (msg.type === 'FIELD_FILLED') {
        setFilledMap((m) => ({ ...m, [msg.uid]: { ok: msg.ok, error: msg.error } }));
      } else if (msg.type === 'DETECTED') {
        // Replace this frame's fields, keep other frames'; preserve manual edits (#4).
        setFields((prev) => {
          const manual = new Map(prev.filter((f) => f.source === 'manual').map((f) => [f.uid, f]));
          const others = prev.filter((f) => (f.frameId ?? 0) !== fid);
          const incoming = msg.fields.map((f) => ({ ...(manual.get(f.uid) ?? f), frameId: fid }));
          return [...others, ...incoming];
        });
        if (msg.adapterId) {
          setAdapterId(msg.adapterId);
          setMultiStep(msg.multiStep);
          adapterFrameRef.current = fid;
        } else if (fid === adapterFrameRef.current) {
          // The adapter frame no longer matches an ATS — clear stale wizard state (#11).
          setAdapterId(null);
          setMultiStep(false);
          adapterFrameRef.current = 0;
        }
      } else if (msg.type === 'STATUS') {
        setStatus(msg.status);
        // Track whether a multi-step run is still in flight to gate Re-detect (#1).
        setIsRunning(msg.status.phase === 'filling' || msg.status.phase === 'ready');
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const applyResolved = useCallback(
    (uid: string, value: string, source: FillSource, confidence = 1) => {
      setFields((fs) => fs.map((f) => (f.uid === uid ? { ...f, value, source, confidence } : f)));
    },
    [],
  );

  const onChange = useCallback(
    (uid: string, value: string) => applyResolved(uid, value, 'manual', 1),
    [applyResolved],
  );

  // Before any action that touches the page, confirm the panel is still bound to the ACTIVE
  // tab. Tab-switch auto-detect keeps these in sync; this guards the race where the user
  // switches tabs right before clicking Fill. Returns the tab id to act on, or null (and
  // kicks off a re-detect of the now-active tab) so a fill can NEVER land on the wrong job.
  const activeTabGuard = useCallback(async (): Promise<number | null> => {
    const active = await activeTabId(windowIdRef.current).catch(() => null);
    if (active == null) return null;
    if (tabIdRef.current !== active) {
      tabIdRef.current = active;
      setNotice('You switched tabs — re-detecting this page…');
      void detect();
      return null;
    }
    return active;
  }, [detect]);

  const onDraft = useCallback(
    async (field: DetectedField) => {
      const question =
        field.signals.label || field.signals.ariaLabel || field.signals.placeholder || '';
      if (!question) return;

      // NUMBER fields (years of experience, etc.) — compute directly, don't call LLM
      if (isNumericQuestion(field)) {
        const profile = await getProfile();
        // Try to compute a numeric answer from profile
        const label = question.toLowerCase();
        if (/years?.*(experience|exp)|experience.*years?|total.*experience/i.test(label)) {
          if (profile.experience.length > 0) {
            const earliest = profile.experience
              .map((e) => parseInt(e.startDate.slice(0, 4), 10))
              .filter((y) => !isNaN(y))
              .sort()[0];
            if (earliest) {
              const years = new Date().getFullYear() - earliest;
              applyResolved(field.uid, String(years), 'heuristic');
              return;
            }
          }
        }
        // For other number fields, ask LLM but instruct it to return ONLY a number
        const res = await sendToBackground<FromBackground>({
          type: 'LLM_DRAFT_ANSWER',
          uid: field.uid,
          question: `[FIELD TYPE: number - respond with ONLY a single number, no text] ${question}`,
        });
        if (res.type === 'LLM_DRAFT_RESULT' && res.answer) {
          applyResolved(field.uid, extractNumber(res.answer), 'llm');
        }
        return;
      }

      // SHORT text fields (name-like, single-word answers) — instruct LLM to be brief
      const isShort =
        field.kind === 'text' &&
        /^(how many|what is your|select|enter|type)/i.test(question.trim()) &&
        question.length < 50;

      // Cover letter fields → generate a full cover letter from the JD
      const isCoverLetter =
        field.mappedKey === 'documents.coverLetter' ||
        /cover letter|covering letter|motivation letter|why .* (this|the) (role|position|company|job)|tell us why|why.*join/i.test(
          question,
        );

      if (isCoverLetter) {
        setBusy(true);
        try {
          const tabId = await activeTabGuard();
          if (tabId == null) return;
          const info = await sendToFrame(tabId, 0, { type: 'GET_PAGE_INFO' }).catch(() => null);
          const company = info?.type === 'PAGE_INFO' ? info.company : '';
          const role = info?.type === 'PAGE_INFO' ? info.role : '';
          const description = info?.type === 'PAGE_INFO' ? info.description : undefined;
          const res = await sendToBackground<FromBackground>({
            type: 'LLM_COVER_LETTER',
            company: company || 'the company',
            role: role || 'this role',
            description,
          });
          if (res.type === 'LLM_COVER_LETTER_RESULT' && res.text) {
            applyResolved(field.uid, res.text, 'llm');
          }
        } finally {
          setBusy(false);
        }
        return;
      }

      // Regular free-text → draft with AI (include field type + length constraints)
      let fieldContext = '';
      if (isShort) {
        fieldContext =
          '[FIELD TYPE: short text input - respond with a brief 1-5 word answer only] ';
      } else if (field.kind === 'textarea') {
        fieldContext = '[FIELD TYPE: textarea - respond with 2-5 sentences] ';
      }

      // Add character length constraints if the field has them
      const { minLength, maxLength } = field.signals;
      if (maxLength && maxLength > 0) {
        fieldContext += `[MAX ${maxLength} characters - your response MUST be under ${maxLength} chars] `;
      }
      if (minLength && minLength > 0) {
        fieldContext += `[MIN ${minLength} characters required] `;
      }

      const res = await sendToBackground<FromBackground>({
        type: 'LLM_DRAFT_ANSWER',
        uid: field.uid,
        question: `${fieldContext}${question}`,
      });
      if (res.type === 'LLM_DRAFT_RESULT' && res.answer) {
        // coerceValueForField enforces maxLength (and numeric) as a safety net if the LLM
        // ignored the prompt constraints.
        applyResolved(
          field.uid,
          coerceValueForField(field, res.answer),
          res.source === 'answerBank' ? 'answerBank' : 'llm',
        );
      }
    },
    [applyResolved],
  );

  const fillAll = useCallback(async () => {
    setBusy(true);
    try {
      const tabId = await activeTabGuard();
      if (tabId == null) return;
      const profile = await getProfile();

      // 1) résumé first, routed to the frame that owns the file field.
      // Look for explicitly mapped resume fields OR any file input (most file inputs on
      // job applications ARE resume uploads).
      const resumeField =
        fields.find((f) => f.mappedKey === 'documents.resume') ??
        fields.find((f) => f.kind === 'file'); // fallback: first file input = resume
      let attachedResume = false;
      // Resolve the blob to attach: use the side-panel-selected resume (multi-doc) first,
      // then fall back to the default, then to legacy resumeBlobId (migration compat).
      const pickId = selectedResumeId ?? profile.documents.defaultResumeId;
      const resumeDoc = profile.documents.resumes?.find((r) => r.id === pickId);
      const resumeBlobId = resumeDoc?.blobId ?? profile.documents.resumeBlobId;
      if (resumeField && resumeBlobId) {
        const file = await getFile(resumeBlobId);
        if (file) {
          const b64 = await fileToB64(file);
          await sendToFrame(tabId, resumeField.frameId ?? 0, {
            type: 'FILL_FILE',
            uid: resumeField.uid,
            filename: file.name,
            mime: file.type,
            b64,
          });
          attachedResume = true;
        }
      }

      // Let a résumé-parse prefill settle before filling the rest, so our values win (§25, #18).
      if (attachedResume) await new Promise((r) => setTimeout(r, 1200));

      // 2) everything else, grouped per frame.
      const byFrame = new Map<number, ResolvedFill[]>();
      for (const f of fields) {
        if (f.value == null || f.mappedKey === 'documents.resume') continue;
        const fid = f.frameId ?? 0;
        const list = byFrame.get(fid) ?? [];
        list.push({ uid: f.uid, value: f.value });
        byFrame.set(fid, list);
      }
      for (const [fid, list] of byFrame) {
        await sendToFrame(tabId, fid, { type: 'FILL', fields: list });
      }

      // 3) repeatable sections (Work Experience / Education). Routed to the adapter frame;
      // a no-op on ATSs without a section spec. Bounded + timeout-guarded in the content
      // script, so this can't hang the fill. Best-effort — don't block the rest on it.
      // Capture how many rows actually filled so the panel can report it (and warn on 0).
      try {
        const r = await sendToFrame(tabId, adapterFrameRef.current, { type: 'FILL_SECTIONS' });
        if (r.type === 'SECTIONS_RESULT') {
          setSections({
            exp: r.experience,
            edu: r.education,
            expFound: r.expFound,
            eduFound: r.eduFound,
          });
        }
      } catch {
        /* section fill failed / port closed — non-critical */
      }

      // Learning engine: remember how the user resolved custom/corrected fields so the
      // next form with that field auto-fills (source 'learned') without re-asking — scoped to
      // this ATS, with a global fallback. Skip fields already auto-saved on blur this session
      // (committedRef) so their `uses` count isn't double-incremented by this Fill.
      const notYetLearned = fields.filter(
        (f) => committedRef.current.get(f.uid) !== (f.value ?? '').trim(),
      );
      await recordLearned(learnableEntries(notYetLearned), adapterId);

      // Application tracker + progress cleanup, keyed to THIS job's URL so clearing one
      // job's saved progress never wipes another open tab's job (#multitab).
      try {
        const info = await sendToFrame(tabId, 0, { type: 'GET_PAGE_INFO' });
        if (info?.type === 'PAGE_INFO') {
          await clearFillProgress(info.url); // this job filled — drop only its saved progress
          await logApplication({
            company: info.company,
            role: info.role,
            url: info.url,
            atsType: adapterId ?? 'generic',
          });
        } else {
          await clearFillProgress(); // no URL available — best-effort clear
        }
      } catch {
        /* page info extraction failed — non-critical */
      }

      // Post-fill verification: after a delay, read back DOM values to detect fills that
      // silently reverted (React re-render, framework override). Non-blocking; just warns.
      const filledUids = fields
        .filter((f) => f.value != null && f.kind !== 'file')
        .map((f) => f.uid);
      if (filledUids.length > 0 && tabIdRef.current != null) {
        const verifyTabId = tabIdRef.current;
        setTimeout(async () => {
          try {
            const vr = await sendToFrame(verifyTabId, 0, { type: 'VERIFY', uids: filledUids });
            if (vr?.type === 'VERIFY_RESULT' && vr.mismatches.length > 0) {
              setNotice(
                `${vr.mismatches.length} field${vr.mismatches.length === 1 ? '' : 's'} may not have stuck — review the page.`,
              );
            }
          } catch {
            /* frame gone or extension reloaded — non-critical */
          }
        }, 1500);
      }
    } finally {
      setBusy(false);
    }
  }, [fields, adapterId, selectedResumeId]);

  const runStep = useCallback(async () => {
    setBusy(true);
    try {
      const tabId = await activeTabGuard();
      if (tabId == null) return;
      await sendToFrame(tabId, adapterFrameRef.current, { type: 'WIZARD_NEXT' });
    } catch {
      /* page navigated / port closed — status arrives via broadcast */
    } finally {
      setBusy(false);
    }
  }, []);

  const runToReview = useCallback(async () => {
    setBusy(true);
    setIsRunning(true); // gates Re-detect until a STATUS broadcast reports the run ended (#1)
    try {
      const tabId = await activeTabGuard();
      if (tabId == null) return;
      await sendToFrame(tabId, adapterFrameRef.current, { type: 'WIZARD_RUN' });
    } catch {
      /* run proceeds via STATUS broadcasts even if the ack channel closes */
    } finally {
      setBusy(false);
    }
  }, []);

  // Generic "Fill & Next" — fills current step and clicks Next/Continue (works without adapter).
  const fillAndNext = useCallback(async () => {
    setBusy(true);
    try {
      const tabId = await activeTabGuard();
      if (tabId == null) return;
      await sendToFrame(tabId, adapterFrameRef.current, { type: 'FILL_AND_NEXT' });
    } catch {
      /* page navigated or port closed */
    } finally {
      setBusy(false);
    }
  }, []);

  // Cover letter generation
  const genCoverLetter = useCallback(async () => {
    setBusy(true);
    setCoverLetter(null);
    try {
      const tabId = await activeTabGuard();
      if (tabId == null) return;
      const info = await sendToFrame(tabId, 0, { type: 'GET_PAGE_INFO' }).catch(() => null);
      const company = info?.type === 'PAGE_INFO' ? info.company : 'the company';
      const role = info?.type === 'PAGE_INFO' ? info.role : 'this role';
      const description = info?.type === 'PAGE_INFO' ? info.description : undefined;
      const res = await sendToBackground<FromBackground>({
        type: 'LLM_COVER_LETTER',
        company,
        role,
        description,
      });
      if (tabIdRef.current !== tabId) return; // user switched tabs during the LLM call
      if (res.type === 'LLM_COVER_LETTER_RESULT' && res.text) {
        setCoverLetter(res.text);
      } else {
        setCoverLetter(
          (res as { error?: string }).error
            ? `Error: ${(res as { error: string }).error}`
            : 'Could not generate. Check AI settings.',
        );
      }
    } catch {
      setCoverLetter('Failed to generate cover letter.');
    } finally {
      setBusy(false);
    }
  }, []);

  // Analyze job match — compare profile skills vs JD requirements
  const analyzeMatch = useCallback(async () => {
    setBusy(true);
    try {
      const tabId = await activeTabGuard();
      if (tabId == null) return;
      const info = await sendToFrame(tabId, 0, { type: 'GET_PAGE_INFO' }).catch(() => null);
      const description = info?.type === 'PAGE_INFO' ? info.description : '';
      if (description) {
        const profile = await getProfile();
        const result = analyzeJobDescription(description, profile);
        if (tabIdRef.current === tabId) setJobMatch(result); // ignore if user switched tabs
      }
    } finally {
      setBusy(false);
    }
  }, []);

  // Tailor the user's résumé to THIS job: extract their existing résumé text (if PDF), have
  // the LLM reorganize/emphasize their real facts for the JD, render a PDF, and show it for
  // review. Never auto-attaches — the user explicitly downloads or attaches after reviewing.
  const tailorResume = useCallback(async () => {
    setTailorBusy(true);
    setTailored(null);
    setNotice(null);
    try {
      const tabId = await activeTabGuard();
      if (tabId == null) return;
      const profile = await getProfile();
      // Use the selected resume or default for tailoring
      const pickId = selectedResumeId ?? profile.documents.defaultResumeId;
      const resumeDoc = profile.documents.resumes?.find((r) => r.id === pickId);
      const tailorBlobId = resumeDoc?.blobId ?? profile.documents.resumeBlobId;
      if (!tailorBlobId) {
        setNotice('Upload your résumé in Settings → Documents first, then tailor it.');
        return;
      }

      // Base wording from the user's existing PDF résumé (best-effort; DOCX falls back to the
      // structured profile, which the tailoring always includes anyway).
      let baseText = '';
      try {
        const file = await getFile(tailorBlobId);
        if (file) {
          const { isPdf, extractPdfText } = await import('@/core/parser/pdf');
          if (isPdf(file)) baseText = await extractPdfText(file);
        }
      } catch {
        /* extraction is best-effort */
      }

      const info = await sendToFrame(tabId, 0, { type: 'GET_PAGE_INFO' }).catch(() => null);
      const jobInfo = {
        company: info?.type === 'PAGE_INFO' ? info.company : '',
        role: info?.type === 'PAGE_INFO' ? info.role : '',
        description: info?.type === 'PAGE_INFO' ? info.description : undefined,
      };

      const res = await sendToBackground<FromBackground>({
        type: 'LLM_TAILOR_RESUME',
        jobInfo,
        baseText,
      });
      if (res.type !== 'LLM_TAILOR_RESULT' || !res.data) {
        setNotice(
          res.type === 'LLM_TAILOR_RESULT' && res.error
            ? `Résumé tailoring: ${res.error}`
            : 'Could not tailor résumé. Check AI settings.',
        );
        return;
      }

      const { normalizeTailored, tailoredToPlainText } = await import('@/core/resume/tailored');
      const t = normalizeTailored(res.data);
      if (!t) {
        setNotice('The AI response could not be turned into a résumé — try again.');
        return;
      }
      const { renderResumePdf } = await import('@/core/resume/renderResumePdf');
      const base = (profile.personal.firstName || 'resume').toLowerCase();
      const co = (jobInfo.company || 'tailored').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      const file = renderResumePdf(t, `${base}-${co}.pdf`);
      if (tabIdRef.current !== tabId) return; // user switched tabs while we worked
      setTailored({ text: tailoredToPlainText(t), file });
    } finally {
      setTailorBusy(false);
    }
  }, [activeTabGuard, selectedResumeId]);

  const downloadTailored = useCallback(() => {
    if (!tailored) return;
    const url = URL.createObjectURL(tailored.file);
    const a = document.createElement('a');
    a.href = url;
    a.download = tailored.file.name;
    a.click();
    URL.revokeObjectURL(url);
  }, [tailored]);

  const attachTailored = useCallback(async () => {
    if (!tailored) return;
    const tabId = await activeTabGuard();
    if (tabId == null) return;
    const resumeField =
      fields.find((f) => f.mappedKey === 'documents.resume') ??
      fields.find((f) => f.kind === 'file');
    if (!resumeField) {
      setNotice('No résumé upload field found on this page.');
      return;
    }
    const b64 = await fileToB64(tailored.file);
    await sendToFrame(tabId, resumeField.frameId ?? 0, {
      type: 'FILL_FILE',
      uid: resumeField.uid,
      filename: tailored.file.name,
      mime: 'application/pdf',
      b64,
    });
  }, [tailored, fields, activeTabGuard]);

  // Save a tailored résumé into the user's stored résumé set (multi-doc Phase 1).
  const saveTailoredToResumes = useCallback(async () => {
    if (!tailored) return;
    const blobId = await putBlob(tailored.file);
    const id = crypto.randomUUID();
    const profile = await getProfile();
    const doc = {
      id,
      blobId,
      filename: tailored.file.name,
      label: tailored.file.name.replace(/\.pdf$/i, ''),
      createdAt: Date.now(),
    };
    const resumes = [...profile.documents.resumes, doc];
    await saveProfile({
      ...profile,
      documents: { ...profile.documents, resumes },
    });
    // Update side-panel picker
    setResumeOptions((prev) => [...prev, { id, label: doc.label || doc.filename }]);
    setNotice('Saved to your résumés ✓');
  }, [tailored]);

  // Save an AI-drafted answer to the answer bank so it's reused next time
  const saveToAnswerBank = useCallback(async (question: string, answer: string) => {
    if (!question || !answer) return;
    const profile = await getProfile();
    const already = profile.answerBank.some(
      (a) => a.questionPattern.toLowerCase() === question.toLowerCase(),
    );
    if (already) return;

    // Dedup: if a near-identical question already exists, update its answer instead of
    // creating a duplicate entry. This keeps the bank clean across slight label variants.
    const dup = findDuplicateAnswer(question, profile.answerBank, 0.85);
    let updatedBank;
    if (dup) {
      // Merge: update the existing entry's answer (latest wins)
      updatedBank = profile.answerBank.map((a) => (a.id === dup.id ? { ...a, answer } : a));
    } else {
      const entry = {
        id: crypto.randomUUID(),
        questionPattern: question,
        answer,
        tags: [],
      };
      updatedBank = [...profile.answerBank, entry];
    }
    const updated = { ...profile, answerBank: updatedBank };
    const { saveProfile } = await import('@/core/storage/profileStore');
    await saveProfile(updated);
    setAnswerBank(updated.answerBank);
  }, []);

  // Persist a user's answer/edit the MOMENT they commit it (blur after typing, or picking a
  // dropdown/checkbox), so it's reused on future forms even if they never click "Fill all".
  // - Learned store: every committed field (structured or custom) → auto-fills next time.
  // - Answer bank: free-text questions → reusable saved answers.
  // Protected/blank/search fields are filtered inside learnableEntries. Wizard steps are
  // covered too: an edit on step 1 is saved on blur, before the user ever advances.
  const onCommit = useCallback(
    async (field: DetectedField, value: string) => {
      const v = (value ?? '').trim();
      if (!v) return;
      if (committedRef.current.get(field.uid) === v) return; // already saved this exact value
      committedRef.current.set(field.uid, v);

      const edited: DetectedField = { ...field, value: v, source: 'manual' };
      try {
        const entries = learnableEntries([edited]);
        if (entries.length) {
          await recordLearned(entries, adapterId);
          setLearnedCount(await countLearned()); // reflect the newly-remembered answer live
        }
      } catch {
        /* non-critical */
      }

      const isFreeText =
        field.mappedKey === 'freeText' ||
        field.mappedKey === 'documents.coverLetter' ||
        (field.mappedKey === null && (field.kind === 'textarea' || field.kind === 'text'));
      const label = (
        field.signals.label ||
        field.signals.ariaLabel ||
        field.signals.placeholder ||
        ''
      ).trim();
      // Only bank substantial free-text answers (short/structured values live in the learned
      // store, not the answer bank). saveToAnswerBank de-dups by question.
      if (isFreeText && label.length >= 5 && v.length >= 15) {
        await saveToAnswerBank(label, v);
      }
    },
    [adapterId, saveToAnswerBank],
  );

  const draftAllAnswers = useCallback(async () => {
    setBusy(true);
    try {
      const freeTextFields = fields.filter((f) => {
        if (f.value) return false; // already has a value
        if (f.kind !== 'textarea' && f.kind !== 'text') return false;
        const lbl = (
          f.signals.label ||
          f.signals.ariaLabel ||
          f.signals.placeholder ||
          ''
        ).toLowerCase();
        // Skip fields that are clearly structured (name, email, etc.)
        if (f.mappedKey && f.mappedKey !== 'freeText' && f.mappedKey !== 'documents.coverLetter')
          return false;
        // Need a meaningful label to draft from
        return lbl.length > 5;
      });

      if (freeTextFields.length === 0) return;

      // Draft in batches of 3 to avoid rate-limiting
      // Delegate to onDraft so batch drafting gets the SAME handling as single "Draft with AI":
      // numeric fields → a bare number, length-constrained prompts, and maxLength coercion.
      const draftOne = async (field: DetectedField) => {
        try {
          await onDraft(field);
        } catch {
          /* single draft failed — continue with others */
        }
      };

      // Process in batches of 3 (avoids API rate limits)
      for (let i = 0; i < freeTextFields.length; i += 3) {
        const batch = freeTextFields.slice(i, i + 3);
        await Promise.all(batch.map(draftOne));
      }
    } finally {
      setBusy(false);
    }
  }, [fields, onDraft]);

  // --- Keyboard shortcuts (power-user speed + accessibility) ---
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      switch (e.key.toLowerCase()) {
        case 'd': // Ctrl/Cmd+D → Detect
          if (!e.shiftKey) {
            e.preventDefault();
            detect();
          }
          break;
        case 'f': // Ctrl/Cmd+Shift+F → Fill All
          if (e.shiftKey && !locked && fields.length > 0) {
            e.preventDefault();
            fillAll();
          }
          break;
        case 'enter': // Ctrl/Cmd+Enter → Next Step
          if (!locked && multiStep) {
            e.preventDefault();
            runStep();
          }
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [detect, fillAll, runStep, locked, fields.length, multiStep]);

  return (
    <div className="flex h-full flex-col bg-slate-900 text-sm text-slate-100">
      <StatusBar
        adapterId={adapterId}
        count={fields.length}
        busy={locked}
        learnedCount={learnedCount}
        variants={variants}
        activeVariantId={activeVariantId}
        onSwitchVariant={async (id) => {
          const profile = await switchVariant(id);
          if (profile) {
            setActiveVariantId(id);
            detect(); // re-detect with the new profile
          }
        }}
        onRedetect={detect}
      />

      {/* Job Match Score */}
      <JobMatchCard analysis={jobMatch} loading={busy} onAnalyze={analyzeMatch} />

      {status?.phase === 'review' && (
        <div className="mx-3 mt-2 rounded-lg bg-green-900/30 border border-green-700/50 px-3 py-2 text-[11px] text-green-300 flex items-center gap-1.5">
          <span className="text-green-400">✓</span> Reached the review step — check the page and
          submit.
        </div>
      )}
      {status?.phase === 'error' && (
        <div className="mx-3 mt-2 rounded-lg bg-red-900/30 border border-red-700/50 px-3 py-2 text-[11px] text-red-300">
          <div className="font-medium">Multi-step run stopped</div>
          <div className="mt-0.5 text-red-400">{wizardErrorHelp(status.message)}</div>
        </div>
      )}
      {duplicate && (
        <div className="mx-3 mt-2 rounded-lg bg-amber-900/30 border border-amber-700/50 px-3 py-2 text-[11px] text-amber-300 flex items-center gap-1.5">
          <span>⚠️</span> {duplicate}
        </div>
      )}

      {/* Post-fill summary — makes the fill self-diagnosing: what landed, what didn't. */}
      {showSummary && !busy && (
        <div className="mx-3 mt-2 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-[11px]">
          <div className="text-slate-200">
            <span className="font-medium text-green-400">
              ✓ Filled {okCount} field{okCount === 1 ? '' : 's'}
            </span>
            {failCount > 0 && (
              <span className="text-amber-400">
                {' '}
                · {failCount} need{failCount === 1 ? 's' : ''} attention
              </span>
            )}
            {sections && sections.exp > 0 && (
              <span className="text-slate-400">
                {' '}
                · {sections.exp} experience row{sections.exp === 1 ? '' : 's'}
              </span>
            )}
            {sections && sections.edu > 0 && (
              <span className="text-slate-400"> · {sections.edu} education</span>
            )}
          </div>
          {/* Warn only when a section was actually PRESENT on the page but nothing filled —
              never on forms that simply have no such section. */}
          {sections && sections.expFound && sections.exp === 0 && (
            <div className="mt-1 text-amber-700">
              ⚠ Couldn’t fill Work Experience automatically — add it on the page manually.
            </div>
          )}
          {sections && sections.eduFound && sections.edu === 0 && (
            <div className="mt-1 text-amber-700">
              ⚠ Couldn’t fill Education automatically — add it on the page manually.
            </div>
          )}
        </div>
      )}

      {notice ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-gray-400">
          {notice}
        </div>
      ) : (
        <ReviewTable
          fields={fields}
          filledMap={filledMap}
          threshold={threshold}
          answerBank={answerBank}
          onChange={onChange}
          onCommit={onCommit}
          onDraft={onDraft}
          onSaveAnswer={saveToAnswerBank}
        />
      )}

      {/* Ask AI — paste any question, get an answer to copy */}
      <AskAI />

      {/* AI not configured — tell the user why the AI actions are missing instead of
          letting the buttons fail silently later (Track 3). */}
      {!aiReady && (
        <div className="mx-3 mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
          <span className="font-medium text-slate-700">AI features are off.</span> Add an OpenAI or
          Anthropic API key in Settings to unlock cover letters, “Draft All Answers,” and Ask AI.
        </div>
      )}

      {/* Cover letter section */}
      {aiReady && (
        <div className="px-3 py-1.5">
          <div className="flex gap-1.5">
            <button
              onClick={genCoverLetter}
              disabled={locked}
              className="flex-1 rounded-lg border border-purple-500/40 bg-purple-950/60 px-2 py-1.5 text-[10px] font-semibold text-purple-200 transition hover:bg-purple-900/60 disabled:opacity-50"
            >
              {busy ? '...' : '✨ Cover Letter'}
            </button>
            <button
              onClick={tailorResume}
              disabled={locked || tailorBusy}
              className="flex-1 rounded-lg border border-sky-500/40 bg-sky-950/60 px-2 py-1.5 text-[10px] font-semibold text-sky-200 transition hover:bg-sky-900/60 disabled:opacity-50"
            >
              {tailorBusy ? '...' : '📄 Tailor Résumé'}
            </button>
          </div>

          {/* Cover letter output */}
          {coverLetter && (
            <div className="mt-2 rounded-lg border border-slate-600 bg-slate-800/80 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-medium rounded px-1.5 py-0.5 bg-purple-900/40 text-purple-300">
                  Cover Letter
                </span>
                <button
                  onClick={() => setCoverLetter(null)}
                  className="text-slate-500 hover:text-slate-300"
                  title="Dismiss"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-200">
                {coverLetter}
              </pre>
              <p className="mt-2 text-[9px] text-amber-500/80">
                ⚠️ AI can make mistakes. Review before using.
              </p>
              <button
                onClick={() => navigator.clipboard.writeText(coverLetter)}
                className="mt-1.5 rounded-md bg-indigo-900/40 border border-indigo-700/50 px-2.5 py-1 text-[10px] font-medium text-indigo-300 transition hover:bg-indigo-900/60"
              >
                📋 Copy to clipboard
              </button>
            </div>
          )}

          {/* Tailored résumé output */}
          {tailored && (
            <div className="mt-2 rounded-lg border border-slate-600 bg-slate-800/80 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-medium rounded px-1.5 py-0.5 bg-sky-900/40 text-sky-300">
                  Tailored Résumé
                </span>
                <button
                  onClick={() => setTailored(null)}
                  className="text-slate-500 hover:text-slate-300"
                  title="Dismiss"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
              <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-200">
                {tailored.text}
              </pre>
              <p className="mt-2 text-[9px] text-amber-500/80">
                ⚠️ AI rephrases your experience. Verify every line is accurate before attaching.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  onClick={downloadTailored}
                  className="rounded-md border border-slate-600 px-2 py-1 text-[10px] font-medium text-slate-300 transition hover:bg-slate-700"
                >
                  ⬇ Download PDF
                </button>
                <button
                  onClick={attachTailored}
                  disabled={locked}
                  className="rounded-md bg-sky-700 px-2 py-1 text-[10px] font-medium text-white transition hover:brightness-110 disabled:opacity-50"
                >
                  📎 Attach
                </button>
                <button
                  onClick={saveTailoredToResumes}
                  className="rounded-md bg-emerald-900/40 border border-emerald-700/50 px-2 py-1 text-[10px] font-medium text-emerald-300 transition hover:bg-emerald-900/60"
                >
                  💾 Save
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Draft All Answers — one click generates all free-text answers */}
      {aiReady &&
        fields.some(
          (f) =>
            !f.value &&
            (f.kind === 'textarea' || f.kind === 'text') &&
            (!f.mappedKey ||
              f.mappedKey === 'freeText' ||
              f.mappedKey === 'documents.coverLetter') &&
            (f.signals.label || f.signals.ariaLabel || '').length > 5,
        ) && (
          <div className="px-3 py-1">
            <button
              onClick={draftAllAnswers}
              disabled={locked}
              className="w-full rounded-lg border border-indigo-500/40 bg-indigo-950/60 px-3 py-1.5 text-[10px] font-semibold text-indigo-200 transition hover:bg-indigo-900/60 disabled:opacity-50"
            >
              {busy ? '⏳ Drafting...' : '🚀 Draft All with AI'}
            </button>
          </div>
        )}

      {/* Pre-submit safety net (Track 3): required fields with no value would sail past
          "Fill" and get the form bounced on the page. Make them impossible to miss. */}
      {!notice && requiredEmpty.length > 0 && (
        <div className="mx-3 mb-1 mt-1 rounded-lg border border-amber-600/40 bg-amber-950/40 px-3 py-1.5 text-[10px] text-amber-300">
          <span className="font-semibold">
            {requiredEmpty.length} required field{requiredEmpty.length === 1 ? '' : 's'} still
            empty.
          </span>{' '}
          Fill {requiredEmpty.length === 1 ? 'it' : 'them'} above before submitting on the page —
          the form may be rejected otherwise.
        </div>
      )}

      {/* Résumé picker — shown only when the user has >1 résumé uploaded */}
      {resumeOptions.length > 1 && (
        <div className="mx-3 mb-1 mt-1 flex items-center gap-2">
          <label className="text-[10px] font-medium text-slate-400">📎</label>
          <select
            className="flex-1 rounded border border-slate-600 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-200"
            value={selectedResumeId ?? ''}
            onChange={(e) => setSelectedResumeId(e.target.value)}
          >
            {resumeOptions.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      )}

      <FillButton
        busy={locked}
        hasFields={fields.length > 0}
        multiStep={multiStep}
        onFill={fillAll}
        onFillAndNext={fillAndNext}
        onNext={runStep}
        onRun={runToReview}
      />

      {/* Batch queue — paste multiple job URLs and process them one by one */}
      <BatchQueue
        onNavigate={(url) => {
          chrome.tabs.update({ url });
        }}
      />

      {/* Bug report */}
      <div className="px-3 py-2">
        {showReport ? (
          <ReportBug
            adapterId={adapterId}
            fieldsDetected={fields.length}
            fieldsFilled={Object.values(filledMap).filter((f) => f.ok).length}
            failedFields={Object.entries(filledMap)
              .filter(([, v]) => !v.ok)
              .map(([uid, v]) => {
                const f = fields.find((x) => x.uid === uid);
                return {
                  label: f?.signals.label || f?.signals.ariaLabel || uid,
                  mappedKey: f?.mappedKey ?? null,
                  error: v.error,
                };
              })}
            onClose={() => setShowReport(false)}
          />
        ) : (
          <button
            onClick={() => setShowReport(true)}
            className="w-full rounded-lg border border-dashed border-slate-600 px-3 py-1.5 text-[10px] text-slate-500 transition hover:border-red-500/50 hover:text-red-400"
          >
            🐛 Report a bug
          </button>
        )}
      </div>
    </div>
  );
}
