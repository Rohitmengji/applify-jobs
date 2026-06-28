import { useState } from 'react';
import { putBlob, deleteBlob } from '@/core/storage/blobStore';
import { parseResumeText, applyParsedResume, mergeExtractedResume } from '@/core/parser/resume';
import type { FromBackground } from '@/core/messages';
import { Section, TextArea, Button, type SectionProps } from '../components/ui';

export function DocumentsSection({ draft, setDraft }: SectionProps) {
  const docs = draft.documents;

  const onPick = (kind: 'resume' | 'coverLetter') => async (file: File | undefined) => {
    if (!file) return;
    const id = await putBlob(file);
    setDraft((d) => ({
      ...d,
      documents:
        kind === 'resume'
          ? { ...d.documents, resumeBlobId: id, resumeFilename: file.name }
          : { ...d.documents, coverLetterBlobId: id, coverLetterFilename: file.name },
    }));
  };

  const removeResume = async () => {
    if (docs.resumeBlobId) await deleteBlob(docs.resumeBlobId);
    setDraft((d) => ({
      ...d,
      documents: { ...d.documents, resumeBlobId: undefined, resumeFilename: undefined },
    }));
  };
  const removeCover = async () => {
    if (docs.coverLetterBlobId) await deleteBlob(docs.coverLetterBlobId);
    setDraft((d) => ({
      ...d,
      documents: { ...d.documents, coverLetterBlobId: undefined, coverLetterFilename: undefined },
    }));
  };

  return (
    <Section
      title="Documents"
      description="Stored locally in your browser (IndexedDB) — never uploaded."
    >
      <DocSlot
        title="Résumé"
        filename={docs.resumeFilename}
        onPick={onPick('resume')}
        onRemove={removeResume}
      />
      <DocSlot
        title="Cover letter"
        filename={docs.coverLetterFilename}
        onPick={onPick('coverLetter')}
        onRemove={removeCover}
      />

      <ResumeTextImport
        onApply={(text) => setDraft((d) => applyParsedResume(d, parseResumeText(text)))}
        onApplyAI={async (text) => {
          const res = (await chrome.runtime.sendMessage({
            type: 'LLM_EXTRACT_RESUME',
            text,
          })) as FromBackground;
          if (res?.type === 'LLM_EXTRACT_RESULT') {
            setDraft((d) => mergeExtractedResume(d, res.data));
          }
        }}
      />
    </Section>
  );
}

// §M8 — paste résumé text to seed the profile. The deterministic pass fills contact
// fields/links/skills; the optional AI pass adds experience & education (validated).
// Both are non-destructive; the user reviews everything before saving.
function ResumeTextImport({
  onApply,
  onApplyAI,
}: {
  onApply: (text: string) => void;
  onApplyAI: (text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-4">
      <h3 className="mb-1 text-sm font-semibold text-gray-700">Auto-fill from résumé text</h3>
      <p className="mb-2 text-xs text-gray-400">
        Paste your résumé text and fill empty fields — nothing is overwritten. The basic pass
        extracts contact details, links, and known skills; the AI pass also adds experience &amp;
        education (needs AI assist enabled in Settings). PDF parsing is a future addition.
      </p>
      <TextArea value={text} onChange={setText} rows={5} placeholder="Paste résumé text here…" />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            if (!text.trim()) return;
            onApply(text);
            setMsg('Basic fields applied — review the sections ✓');
          }}
        >
          Extract &amp; fill (basic)
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            if (!text.trim()) return;
            setBusy(true);
            setMsg('Extracting with AI…');
            try {
              await onApplyAI(text);
              setMsg('AI extraction applied — review Experience & Education ✓');
            } catch {
              setMsg('AI extraction failed — check your API key/settings.');
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Extracting…' : 'Extract with AI (experience & education)'}
        </Button>
        {msg && <span className="text-xs text-green-600">{msg}</span>}
      </div>
    </div>
  );
}

function DocSlot({
  title,
  filename,
  onPick,
  onRemove,
}: {
  title: string;
  filename?: string;
  onPick: (file: File | undefined) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{title}</h3>
      {filename ? (
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">📄 {filename}</span>
          <Button variant="danger" onClick={onRemove}>
            Remove
          </Button>
        </div>
      ) : (
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(e) => onPick(e.target.files?.[0])}
          className="text-sm"
        />
      )}
    </div>
  );
}
