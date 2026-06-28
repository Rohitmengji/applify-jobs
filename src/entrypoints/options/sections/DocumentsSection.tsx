import { useState } from 'react';
import { putBlob, deleteBlob } from '@/core/storage/blobStore';
import { parseResumeText, applyParsedResume } from '@/core/parser/resume';
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
      />
    </Section>
  );
}

// §M8 — paste résumé text to seed empty profile fields (name, email, phone, links,
// skills). Non-destructive; the user reviews everything before saving.
function ResumeTextImport({ onApply }: { onApply: (text: string) => void }) {
  const [text, setText] = useState('');
  const [done, setDone] = useState(false);

  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-4">
      <h3 className="mb-1 text-sm font-semibold text-gray-700">Auto-fill from résumé text</h3>
      <p className="mb-2 text-xs text-gray-400">
        Paste your résumé text. We extract name, email, phone, links, and known skills and fill only
        the empty fields — nothing is overwritten. (PDF parsing is a future addition.)
      </p>
      <TextArea value={text} onChange={setText} rows={5} placeholder="Paste résumé text here…" />
      <div className="mt-2 flex items-center gap-3">
        <Button
          onClick={() => {
            if (!text.trim()) return;
            onApply(text);
            setDone(true);
          }}
        >
          Extract &amp; fill
        </Button>
        {done && <span className="text-xs text-green-600">Applied — review the sections ✓</span>}
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
