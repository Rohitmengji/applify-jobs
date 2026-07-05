import { useState } from 'react';
import { putBlob, deleteBlob } from '@/core/storage/blobStore';
import { parseResumeText, applyParsedResume, mergeExtractedResume } from '@/core/parser/resume';
import type { FromBackground } from '@/core/messages';
import type { StoredDoc } from '@/core/profile.schema';
import { Section, TextArea, Button, type SectionProps } from '../components/ui';

export function DocumentsSection({ draft, setDraft }: SectionProps) {
  const docs = draft.documents;
  const [resumeText, setResumeText] = useState('');
  const [pdfMsg, setPdfMsg] = useState('');

  const addResume = async (file: File | undefined) => {
    if (!file) return;
    const blobId = await putBlob(file);
    const id = crypto.randomUUID();
    const doc: StoredDoc = { id, blobId, filename: file.name, createdAt: Date.now() };
    setDraft((d) => {
      const resumes = [...d.documents.resumes, doc];
      const defaultResumeId = d.documents.defaultResumeId ?? id; // first upload becomes default
      return { ...d, documents: { ...d.documents, resumes, defaultResumeId } };
    });
    // PDF extraction for profile seeding
    const looksPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!looksPdf) return;
    setPdfMsg('Reading PDF…');
    try {
      const { extractPdfText } = await import('@/core/parser/pdf');
      const text = await extractPdfText(file);
      if (text) {
        setResumeText(text);
        setDraft((d) => applyParsedResume(d, parseResumeText(text)));
        setPdfMsg(
          'PDF text extracted — basic fields filled. Use "Extract with AI" for experience & education.',
        );
      } else {
        setPdfMsg('No selectable text found (the PDF may be a scan/image).');
      }
    } catch {
      setPdfMsg('Could not read this PDF.');
    }
  };

  const removeResume = async (doc: StoredDoc) => {
    await deleteBlob(doc.blobId);
    setDraft((d) => {
      const resumes = d.documents.resumes.filter((r) => r.id !== doc.id);
      const defaultResumeId =
        d.documents.defaultResumeId === doc.id ? resumes[0]?.id : d.documents.defaultResumeId;
      return { ...d, documents: { ...d.documents, resumes, defaultResumeId } };
    });
  };

  const setDefaultResume = (id: string) => {
    setDraft((d) => ({ ...d, documents: { ...d.documents, defaultResumeId: id } }));
  };

  const addCoverLetter = async (file: File | undefined) => {
    if (!file) return;
    const blobId = await putBlob(file);
    const id = crypto.randomUUID();
    const doc: StoredDoc = { id, blobId, filename: file.name, createdAt: Date.now() };
    setDraft((d) => {
      const coverLetters = [...d.documents.coverLetters, doc];
      const defaultCoverLetterId = d.documents.defaultCoverLetterId ?? id;
      return { ...d, documents: { ...d.documents, coverLetters, defaultCoverLetterId } };
    });
  };

  const removeCoverLetter = async (doc: StoredDoc) => {
    await deleteBlob(doc.blobId);
    setDraft((d) => {
      const coverLetters = d.documents.coverLetters.filter((c) => c.id !== doc.id);
      const defaultCoverLetterId =
        d.documents.defaultCoverLetterId === doc.id
          ? coverLetters[0]?.id
          : d.documents.defaultCoverLetterId;
      return { ...d, documents: { ...d.documents, coverLetters, defaultCoverLetterId } };
    });
  };

  return (
    <Section
      title="Documents"
      description="Stored locally in your browser (IndexedDB) — never uploaded."
    >
      <DocList
        title="Résumés"
        docs={docs.resumes}
        defaultId={docs.defaultResumeId}
        onAdd={addResume}
        onRemove={removeResume}
        onSetDefault={setDefaultResume}
      />
      {pdfMsg && <p className="text-xs text-indigo-600">{pdfMsg}</p>}
      <DocList
        title="Cover Letters"
        docs={docs.coverLetters}
        defaultId={docs.defaultCoverLetterId}
        onAdd={addCoverLetter}
        onRemove={removeCoverLetter}
        onSetDefault={(id) =>
          setDraft((d) => ({ ...d, documents: { ...d.documents, defaultCoverLetterId: id } }))
        }
      />

      <ResumeTextImport
        value={resumeText}
        onChange={setResumeText}
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

// §M8 — seed the profile from résumé text (auto-filled when you upload a PDF, or pasted).
// The basic pass fills contact fields/links/skills; the AI pass adds experience &
// education (validated). Both are non-destructive; the user reviews before saving.
function ResumeTextImport({
  value,
  onChange,
  onApply,
  onApplyAI,
}: {
  value: string;
  onChange: (v: string) => void;
  onApply: (text: string) => void;
  onApplyAI: (text: string) => Promise<void>;
}) {
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-4">
      <h3 className="mb-1 text-sm font-semibold text-gray-700">Auto-fill from résumé text</h3>
      <p className="mb-2 text-xs text-gray-400">
        Upload a PDF résumé above (text is extracted automatically) or paste text here, then fill
        empty fields — nothing is overwritten. The basic pass extracts contact details, links, and
        known skills; the AI pass also adds experience &amp; education (needs AI assist in
        Settings).
      </p>
      <TextArea value={value} onChange={onChange} rows={5} placeholder="Paste résumé text here…" />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            if (!value.trim()) return;
            onApply(value);
            setMsg('Basic fields applied — review the sections ✓');
          }}
        >
          Extract &amp; fill (basic)
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={async () => {
            if (!value.trim()) return;
            setBusy(true);
            setMsg('Extracting with AI…');
            try {
              await onApplyAI(value);
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

function DocList({
  title,
  docs,
  defaultId,
  onAdd,
  onRemove,
  onSetDefault,
}: {
  title: string;
  docs: StoredDoc[];
  defaultId?: string;
  onAdd: (file: File | undefined) => void;
  onRemove: (doc: StoredDoc) => void;
  onSetDefault: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4">
      <h3 className="mb-2 text-sm font-semibold text-gray-700">{title}</h3>
      {docs.length === 0 && (
        <p className="mb-2 text-xs text-gray-400">No {title.toLowerCase()} uploaded yet.</p>
      )}
      <ul className="space-y-2">
        {docs.map((doc) => (
          <li
            key={doc.id}
            className="flex items-center justify-between rounded border border-gray-100 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">📄 {doc.label || doc.filename}</span>
              {doc.id === defaultId && (
                <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700">
                  Default
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {doc.id !== defaultId && (
                <Button variant="ghost" onClick={() => onSetDefault(doc.id)}>
                  Set default
                </Button>
              )}
              <Button variant="danger" onClick={() => onRemove(doc)}>
                Remove
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-2">
        <input
          type="file"
          accept=".pdf,.doc,.docx"
          onChange={(e) => onAdd(e.target.files?.[0])}
          className="text-sm"
        />
      </div>
    </div>
  );
}
