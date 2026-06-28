import { useCallback, useEffect, useState } from 'react';
import type { DetectedField, WizardStatus } from '@/core/types';
import type { FromContent, FromBackground, ResolvedFill } from '@/core/messages';
import { getProfile } from '@/core/storage/profileStore';
import { getFile } from '@/core/storage/blobStore';
import { sendToTab, sendToBackground, fileToB64 } from './lib/messaging';
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

  const detect = useCallback(async () => {
    setBusy(true);
    setNotice(null);
    try {
      const ping = await sendToTab({ type: 'PING' });
      if (ping?.type !== 'PONG') throw new Error('no content script');
      const res = await sendToTab({ type: 'DETECT' });
      if (res.type === 'DETECTED') {
        setFields(res.fields);
        setAdapterId(res.adapterId);
        setMultiStep(res.multiStep);
        setFilledMap({});
      }
    } catch {
      setNotice(
        'Open a job application page, then re-detect. (This panel can’t read browser pages.)',
      );
      setFields([]);
    } finally {
      setBusy(false);
    }
  }, []);

  // Initial detection on open.
  useEffect(() => {
    void detect();
  }, [detect]);

  // Live updates broadcast by the content script during fill / wizard runs.
  useEffect(() => {
    const handler = (msg: FromContent) => {
      if (msg.type === 'FIELD_FILLED') {
        setFilledMap((m) => ({ ...m, [msg.uid]: { ok: msg.ok, error: msg.error } }));
      } else if (msg.type === 'DETECTED') {
        setFields(msg.fields);
        setAdapterId(msg.adapterId);
        setMultiStep(msg.multiStep);
      } else if (msg.type === 'STATUS') {
        setStatus(msg.status);
      }
    };
    chrome.runtime.onMessage.addListener(handler);
    return () => chrome.runtime.onMessage.removeListener(handler);
  }, []);

  const onChange = useCallback((uid: string, value: string) => {
    setFields((fs) =>
      fs.map((f) => (f.uid === uid ? { ...f, value, source: 'manual', confidence: 1 } : f)),
    );
  }, []);

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
      if (res.type === 'LLM_DRAFT_RESULT' && res.answer) onChange(field.uid, res.answer);
    },
    [onChange],
  );

  const fillAll = useCallback(async () => {
    setBusy(true);
    try {
      const profile = await getProfile();

      // 1) résumé first (so a parse-prefill settles before we fill, §25).
      const resumeField = fields.find((f) => f.mappedKey === 'documents.resume');
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
        }
      }

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
    } finally {
      setBusy(false);
    }
  }, []);

  const runToReview = useCallback(async () => {
    setBusy(true);
    try {
      await sendToTab({ type: 'WIZARD_RUN' });
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
        <ReviewTable fields={fields} filledMap={filledMap} onChange={onChange} onDraft={onDraft} />
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
