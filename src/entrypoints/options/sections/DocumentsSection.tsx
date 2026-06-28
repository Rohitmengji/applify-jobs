import { putBlob, deleteBlob } from '@/core/storage/blobStore';
import { Section, Button, type SectionProps } from '../components/ui';

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
    </Section>
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
