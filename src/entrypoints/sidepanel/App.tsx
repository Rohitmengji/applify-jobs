import { useCallback, useEffect, useRef, useState } from 'react';
import type { DetectedField, FillSource, WizardStatus } from '@/core/types';
import type { FromContent, FromBackground, ResolvedFill } from '@/core/messages';
import type { ProfileKey, SavedAnswer } from '@/core/profile.schema';
import { getProfile } from '@/core/storage/profileStore';
import { getFile } from '@/core/storage/blobStore';
import { recordLearned } from '@/core/storage/learnStore';
import { logApplication, findDuplicate } from '@/core/storage/appTracker';
import { saveFillProgress, loadFillProgress, clearFillProgress } from '@/core/storage/fillProgress';
import { learnableEntries } from '@/core/engine/learn';
import { valueForKey } from '@/core/engine/values';
import { sendToFrame, sendToBackground, frameIds, fileToB64, activeTabId } from './lib/messaging';
import { StatusBar } from './components/StatusBar';
import { ReviewTable } from './components/ReviewTable';
import { FillButton } from './components/FillButton';

type FilledMap = Record<string, { ok: boolean; error?: string }>;
type LlmPatch = { key: ProfileKey; confidence: number; value: string | null };

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
  const [isRunning, setIsRunning] = useState(false); // a wizard run is in flight (#1)
  const locked = busy || isRunning;

  const tabIdRef = useRef<number | null>(null); // tab this panel is bound to (#5)
  const adapterFrameRef = useRef(0); // frame that owns the multi-step adapter

  // Ask the LLM to map fields the deterministic layers left unmapped, then resolve their
  // values from the profile (§11.4/§11.5). Returns a per-uid patch map so the caller can
  // merge functionally and never clobber a manual edit made during the round-trip (#2).
  const enrichWithLLM = useCallback(
    async (current: DetectedField[]): Promise<Map<string, LlmPatch>> => {
      const out = new Map<string, LlmPatch>();
      const profile = await getProfile();
      if (!profile.settings.llmEnabled) return out;
      const unmapped = current.filter((f) => f.mappedKey === null && f.kind !== 'file');
      if (unmapped.length === 0) return out;

      const res = await sendToBackground<FromBackground>({
        type: 'LLM_MAP_FIELDS',
        unresolved: unmapped.map((f) => ({ uid: f.uid, signals: f.signals })),
      });
      if (res.type !== 'LLM_MAP_RESULT') return out;

      const byUid = new Map(res.mappings.map((m) => [m.uid, m]));
      for (const f of current) {
        const m = byUid.get(f.uid);
        if (!m || !m.key) continue;
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
    setBusy(true);
    setNotice(null);
    const noContent = () => {
      setNotice(
        'Open a job application page, then re-detect. (This panel can’t read browser pages.)',
      );
      setFields([]);
      setAdapterId(null);
      setMultiStep(false);
    };
    try {
      const tabId = await activeTabId();
      tabIdRef.current = tabId;

      const profile = await getProfile();
      setThreshold(profile.settings.confidenceThreshold);
      setAnswerBank(profile.answerBank ?? []);

      // Detect every frame; don't gate on the top frame having a content script — the
      // form may live only inside an iframe (iCIMS). We fail only if NO frame responds (#4).
      const ids = await frameIds(tabId);
      const perFrame = await Promise.all(
        ids.map(async (fid) => {
          const r = await sendToFrame(tabId, fid, { type: 'DETECT' }).catch(() => null);
          return r && r.type === 'DETECTED'
            ? { fid, fields: r.fields, adapterId: r.adapterId, multiStep: r.multiStep }
            : null;
        }),
      );
      const got = perFrame.filter((x): x is NonNullable<typeof x> => x !== null);
      if (got.length === 0) {
        noContent();
        return;
      }

      const merged: DetectedField[] = [];
      for (const fr of got) for (const f of fr.fields) merged.push({ ...f, frameId: fr.fid });

      // Prefer a frame that matched an adapter AND actually has fields, so the parent
      // page that merely embeds the form's iframe doesn't claim the wizard (#10/#13).
      const adapterFrames = got.filter((fr) => fr.adapterId);
      const best = adapterFrames.find((fr) => fr.fields.length > 0) ?? adapterFrames[0];
      adapterFrameRef.current = best?.fid ?? 0;
      setFilledMap({});
      setAdapterId(best?.adapterId ?? null);
      setMultiStep(best?.multiStep ?? false);
      setFields(merged);
      setDuplicate(null);

      // Restore saved fill progress (if user revisits the same page after a crash)
      try {
        const pageInfo = await sendToFrame(tabId, 0, { type: 'GET_PAGE_INFO' }).catch(() => null);
        if (pageInfo?.type === 'PAGE_INFO') {
          const saved = await loadFillProgress(pageInfo.url);
          if (saved) {
            const savedMap = new Map(saved.fields.map((f) => [f.uid, f]));
            setFields((prev) =>
              prev.map((f) => {
                const s = savedMap.get(f.uid);
                if (s?.value && !f.value) return { ...f, value: s.value, source: 'manual' as FillSource };
                return f;
              }),
            );
          }

          // Auto-save current progress
          void saveFillProgress(pageInfo.url, merged);
        }
      } catch { /* non-critical */ }

      // Check for duplicate application
      try {
        const pageInfo = await sendToFrame(tabId, 0, { type: 'GET_PAGE_INFO' }).catch(() => null);
        if (pageInfo?.type === 'PAGE_INFO') {
          const dup = await findDuplicate(pageInfo.url);
          if (dup) {
            const daysAgo = Math.round((Date.now() - dup.appliedAt) / (1000 * 60 * 60 * 24));
            setDuplicate(
              `You applied to this role on ${new Date(dup.appliedAt).toLocaleDateString()} (${daysAgo} day${daysAgo === 1 ? '' : 's'} ago)`,
            );
          }
        }
      } catch { /* non-critical */ }

      // Apply LLM mappings as a functional per-uid patch: skip manual edits and skip uids
      // no longer present (e.g. a wizard step advanced during the round-trip) (#1/#2).
      const patches = await enrichWithLLM(merged);
      if (patches.size > 0) {
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

      // Auto-generate cover letter for cover-letter textareas that are empty.
      // Uses the JD from the page + profile to create a tailored letter.
      const profile2 = await getProfile();
      if (profile2.settings.llmEnabled) {
        const coverLetterField = merged.find((f) => {
          if (f.value) return false; // already has value
          if (f.kind !== 'textarea' && f.kind !== 'text') return false;
          const lbl = (f.signals.label || f.signals.ariaLabel || f.signals.placeholder || '').toLowerCase();
          return /cover letter|covering letter|motivation letter|letter of motivation|why .* this (role|position|company)|why .* join|tell us why/.test(lbl);
        });
        if (coverLetterField) {
          try {
            const info = await sendToFrame(tabId, 0, { type: 'GET_PAGE_INFO' }).catch(() => null);
            const company = info?.type === 'PAGE_INFO' ? info.company : '';
            const role = info?.type === 'PAGE_INFO' ? info.role : '';
            if (company || role) {
              const res = await sendToBackground<FromBackground>({
                type: 'LLM_COVER_LETTER',
                company,
                role,
                description: info?.type === 'PAGE_INFO' ? info.description : undefined,
              });
              if (res.type === 'LLM_COVER_LETTER_RESULT' && res.text) {
                setFields((prev) =>
                  prev.map((f) =>
                    f.uid === coverLetterField.uid
                      ? { ...f, value: res.text, source: 'llm' as FillSource, confidence: 0.85, reason: 'AI-generated cover letter tailored to job' }
                      : f,
                  ),
                );
              }
            }
          } catch { /* non-critical — user can still click "Generate Cover Letter" manually */ }
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
    void detect();
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

  const onDraft = useCallback(
    async (field: DetectedField) => {
      const question =
        field.signals.label || field.signals.ariaLabel || field.signals.placeholder || '';
      if (!question) return;

      // Cover letter fields → generate a full cover letter from the JD
      const isCoverLetter =
        field.mappedKey === 'documents.coverLetter' ||
        /cover letter|covering letter|motivation letter|why .* (this|the) (role|position|company|job)|tell us why|why.*join/i.test(question);

      if (isCoverLetter) {
        setBusy(true);
        try {
          const tabId = tabIdRef.current ?? (await activeTabId());
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

      // Regular free-text → draft with AI
      const res = await sendToBackground<FromBackground>({
        type: 'LLM_DRAFT_ANSWER',
        uid: field.uid,
        question,
      });
      if (res.type === 'LLM_DRAFT_RESULT' && res.answer) {
        applyResolved(field.uid, res.answer, res.source === 'answerBank' ? 'answerBank' : 'llm');
      }
    },
    [applyResolved],
  );

  const fillAll = useCallback(async () => {
    setBusy(true);
    try {
      const tabId = tabIdRef.current ?? (await activeTabId());
      const profile = await getProfile();

      // 1) résumé first, routed to the frame that owns the file field.
      // Look for explicitly mapped resume fields OR any file input (most file inputs on
      // job applications ARE resume uploads).
      const resumeField =
        fields.find((f) => f.mappedKey === 'documents.resume') ??
        fields.find((f) => f.kind === 'file'); // fallback: first file input = resume
      let attachedResume = false;
      if (resumeField && profile.documents.resumeBlobId) {
        const file = await getFile(profile.documents.resumeBlobId);
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

      // Learning engine: remember how the user resolved custom/corrected fields so the
      // next form with that field auto-fills (source 'learned') without re-asking —
      // scoped to this ATS, with a global fallback.
      await recordLearned(learnableEntries(fields), adapterId);
      await clearFillProgress(); // filled successfully, no need to restore

      // Application tracker: log this application for history/duplicate detection.
      try {
        const info = await sendToFrame(tabId, 0, { type: 'GET_PAGE_INFO' });
        if (info?.type === 'PAGE_INFO') {
          await logApplication({
            company: info.company,
            role: info.role,
            url: info.url,
            atsType: adapterId ?? 'generic',
          });
        }
      } catch { /* page info extraction failed — non-critical */ }
    } finally {
      setBusy(false);
    }
  }, [fields, adapterId]);

  const runStep = useCallback(async () => {
    setBusy(true);
    try {
      const tabId = tabIdRef.current ?? (await activeTabId());
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
      const tabId = tabIdRef.current ?? (await activeTabId());
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
      const tabId = tabIdRef.current ?? (await activeTabId());
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
      const tabId = tabIdRef.current ?? (await activeTabId());
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

  return (
    <div className="flex h-full flex-col bg-gradient-to-b from-white to-gray-50/80 text-sm text-gray-900">
      <StatusBar adapterId={adapterId} count={fields.length} busy={locked} onRedetect={detect} />

      {status?.phase === 'review' && (
        <div className="mx-3 mt-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-[11px] text-green-700 flex items-center gap-1.5">
          <span className="text-green-500">✓</span> Reached the review step — check the page and submit.
        </div>
      )}
      {status?.phase === 'error' && (
        <div className="mx-3 mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-[11px] text-red-700">{status.message}</div>
      )}
      {duplicate && (
        <div className="mx-3 mt-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-700 flex items-center gap-1.5">
          <span>⚠️</span> {duplicate}
        </div>
      )}

      {notice ? (
        <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-gray-400">{notice}</div>
      ) : (
        <ReviewTable
          fields={fields}
          filledMap={filledMap}
          threshold={threshold}
          answerBank={answerBank}
          onChange={onChange}
          onDraft={onDraft}
        />
      )}

      {/* Cover letter section */}
      <div className="border-t border-gray-100 px-3 py-2">
        <button
          onClick={genCoverLetter}
          disabled={locked}
          className="w-full rounded-lg bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-100 px-3 py-2 text-[11px] font-medium text-purple-700 transition hover:border-purple-200 hover:shadow-sm disabled:opacity-50"
        >
          {busy ? (
            <span className="flex items-center justify-center gap-1.5">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-purple-200 border-t-purple-600" />
              Generating...
            </span>
          ) : (
            '✨ Generate Cover Letter'
          )}
        </button>
        {coverLetter && (
          <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-gray-200 bg-white p-3 text-[11px] text-gray-700 shadow-sm">
            <pre className="whitespace-pre-wrap font-sans leading-relaxed">{coverLetter}</pre>
            <button
              onClick={() => { navigator.clipboard.writeText(coverLetter); }}
              className="mt-2 rounded-md bg-indigo-50 px-2 py-1 text-[10px] font-medium text-indigo-600 transition hover:bg-indigo-100"
            >
              📋 Copy to clipboard
            </button>
          </div>
        )}
      </div>

      <FillButton
        busy={locked}
        hasFields={fields.length > 0}
        multiStep={multiStep}
        onFill={fillAll}
        onFillAndNext={fillAndNext}
        onNext={runStep}
        onRun={runToReview}
      />
    </div>
  );
}
