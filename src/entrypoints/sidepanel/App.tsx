import { useCallback, useEffect, useRef, useState } from 'react';
import type { DetectedField, FillSource, WizardStatus } from '@/core/types';
import type { FromContent, FromBackground, ResolvedFill } from '@/core/messages';
import type { ProfileKey } from '@/core/profile.schema';
import { getProfile } from '@/core/storage/profileStore';
import { getFile } from '@/core/storage/blobStore';
import { valueForKey } from '@/core/engine/values';
import { sendToTab, sendToBackground, fileToB64, activeTabId } from './lib/messaging';
import { StatusBar } from './components/StatusBar';
import { ReviewTable } from './components/ReviewTable';
import { FillButton } from './components/FillButton';

type FilledMap = Record<string, { ok: boolean; error?: string }>;

export function App() {
  const [fields, setFields] = useState<DetectedField[]>([]);
  const [adapterId, setAdapterId] = useState<string | null>(null);
  const [multiStep, setMultiStep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filledMap, setFilledMap] = useState<FilledMap>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [status, setStatus] = useState<WizardStatus | null>(null);
  const [threshold, setThreshold] = useState(0.6);

  // The tab this panel is bound to — used to ignore broadcasts from other tabs (#5).
  const tabIdRef = useRef<number | null>(null);

  // Ask the LLM to map any fields the deterministic layers left unmapped, then resolve
  // their values from the profile (§11.4/§11.5, finding #6). Degrades to a no-op when
  // LLM assist is off or no API key is set (background returns []).
  const enrichWithLLM = useCallback(async (current: DetectedField[]): Promise<DetectedField[]> => {
    const profile = await getProfile();
    if (!profile.settings.llmEnabled) return current;
    const unmapped = current.filter((f) => f.mappedKey === null && f.kind !== 'file');
    if (unmapped.length === 0) return current;

    const res = await sendToBackground<FromBackground>({
      type: 'LLM_MAP_FIELDS',
      unresolved: unmapped.map((f) => ({ uid: f.uid, signals: f.signals })),
    });
    if (res.type !== 'LLM_MAP_RESULT' || res.mappings.length === 0) return current;

    const byUid = new Map(res.mappings.map((m) => [m.uid, m]));
    return current.map((f) => {
      const m = byUid.get(f.uid);
      if (!m || !m.key) return f;
      const key = m.key as ProfileKey;
      // freeText stays valueless (drafted on demand); structured keys resolve now.
      const value = key === 'freeText' ? f.value : (valueForKey(profile, key, f) ?? f.value);
      return { ...f, mappedKey: key, source: 'llm' as FillSource, confidence: m.confidence, value };
    });
  }, []);

  const detect = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      tabIdRef.current = await activeTabId();
      const ping = await sendToTab({ type: 'PING' });
      if (ping?.type !== 'PONG') throw new Error('no content script');

      const profile = await getProfile();
      setThreshold(profile.settings.confidenceThreshold);

      const res = await sendToTab({ type: 'DETECT' });
      if (res.type === 'DETECTED') {
        setAdapterId(res.adapterId);
        setMultiStep(res.multiStep);
        setFilledMap({});
        setFields(res.fields);
        const enriched = await enrichWithLLM(res.fields);
        if (enriched !== res.fields) setFields(enriched);
      }
    } catch {
      setNotice(
        'Open a job application page, then re-detect. (This panel can’t read browser pages.)',
      );
      setFields([]);
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
      // Only react to broadcasts from the tab this panel is bound to (#5).
      if (tabIdRef.current != null && sender.tab?.id !== tabIdRef.current) return;
      if (msg.type === 'FIELD_FILLED') {
        setFilledMap((m) => ({ ...m, [msg.uid]: { ok: msg.ok, error: msg.error } }));
      } else if (msg.type === 'DETECTED') {
        // Merge by uid, preserving the user's manual edits (#4).
        setFields((prev) => {
          const manual = new Map(prev.filter((f) => f.source === 'manual').map((f) => [f.uid, f]));
          return msg.fields.map((f) => manual.get(f.uid) ?? f);
        });
        setAdapterId(msg.adapterId);
        setMultiStep(msg.multiStep);
      } else if (msg.type === 'STATUS') {
        setStatus(msg.status);
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
        // Tag provenance so the badge reads "saved" (answer bank) or "AI" (§17, §20, #12).
        applyResolved(field.uid, res.answer, res.source === 'answerBank' ? 'answerBank' : 'llm');
      }
    },
    [applyResolved],
  );

  const fillAll = useCallback(async () => {
    setBusy(true);
    try {
      const profile = await getProfile();

      // 1) résumé first.
      const resumeField = fields.find((f) => f.mappedKey === 'documents.resume');
      let attachedResume = false;
      if (resumeField && profile.documents.resumeBlobId) {
        const file = await getFile(profile.documents.resumeBlobId);
        if (file) {
          const b64 = await fileToB64(file);
          await sendToTab({
            type: 'FILL_FILE',
            uid: resumeField.uid,
            filename: file.name,
            mime: file.type,
            b64,
          });
          attachedResume = true;
        }
      }

      // Many ATSes parse the résumé to prefill, then overwrite our values. Give that a
      // beat to settle before filling the rest, so our values win (§25, finding #18).
      if (attachedResume) await new Promise((r) => setTimeout(r, 1200));

      // 2) everything else with a resolved value.
      const resolved: ResolvedFill[] = fields
        .filter((f) => f.value != null && f.mappedKey !== 'documents.resume')
        .map((f) => ({ uid: f.uid, value: f.value as string }));
      await sendToTab({ type: 'FILL', fields: resolved });
    } finally {
      setBusy(false);
    }
  }, [fields]);

  const runStep = useCallback(async () => {
    setBusy(true);
    try {
      await sendToTab({ type: 'WIZARD_NEXT' });
    } catch {
      /* page navigated / port closed — status arrives via broadcast */
    } finally {
      setBusy(false);
    }
  }, []);

  const runToReview = useCallback(async () => {
    setBusy(true);
    try {
      await sendToTab({ type: 'WIZARD_RUN' });
    } catch {
      /* run proceeds via STATUS broadcasts even if the ack channel closes */
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <div className="flex h-full flex-col bg-white text-sm text-gray-900">
      <StatusBar adapterId={adapterId} count={fields.length} busy={busy} onRedetect={detect} />

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
        busy={busy}
        hasFields={fields.length > 0}
        multiStep={multiStep}
        onFill={fillAll}
        onNext={runStep}
        onRun={runToReview}
      />
    </div>
  );
}
