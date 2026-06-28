import { useCallback, useEffect, useRef, useState } from 'react';
import type { DetectedField, FillSource, WizardStatus } from '@/core/types';
import type { FromContent, FromBackground, ResolvedFill } from '@/core/messages';
import type { ProfileKey } from '@/core/profile.schema';
import { getProfile } from '@/core/storage/profileStore';
import { getFile } from '@/core/storage/blobStore';
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
  const [status, setStatus] = useState<WizardStatus | null>(null);
  const [threshold, setThreshold] = useState(0.6);
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
      const resumeField = fields.find((f) => f.mappedKey === 'documents.resume');
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
    } finally {
      setBusy(false);
    }
  }, [fields]);

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

  return (
    <div className="flex h-full flex-col bg-white text-sm text-gray-900">
      <StatusBar adapterId={adapterId} count={fields.length} busy={locked} onRedetect={detect} />

      {status?.phase === 'review' && (
        <div className="bg-green-100 px-3 py-1 text-[11px] text-green-800">
          Reached the review step — check the page and submit.
        </div>
      )}
      {status?.phase === 'error' && (
        <div className="bg-red-100 px-3 py-1 text-[11px] text-red-800">{status.message}</div>
      )}

      {notice ? (
        <div className="flex-1 p-6 text-center text-xs text-gray-500">{notice}</div>
      ) : (
        <ReviewTable
          fields={fields}
          filledMap={filledMap}
          threshold={threshold}
          onChange={onChange}
          onDraft={onDraft}
        />
      )}

      <FillButton
        busy={locked}
        hasFields={fields.length > 0}
        multiStep={multiStep}
        onFill={fillAll}
        onNext={runStep}
        onRun={runToReview}
      />
    </div>
  );
}
