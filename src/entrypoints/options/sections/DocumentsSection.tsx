import { useState } from 'react';
import { putBlob, deleteBlob } from '@/core/storage/blobStore';
import { parseResumeText, applyParsedResume, mergeExtractedResume } from '@/core/parser/resume';
import type { FromBackground } from '@/core/messages';
import { Section, TextArea, Button, type SectionProps } from '../components/ui';

export function DocumentsSection({ draft, setDraft }: SectionProps) {
  const docs = draft.documents;
  const [resumeText, setResumeText] = useState('');
  const [pdfMsg, setPdfMsg] = useState('');

  const storeDoc = async (kind: 'resume' | 'coverLetter', file: File) => {
    const id = await putBlob(file);
    setDraft((d) => ({
      ...d,
      documents:
        kind === 'resume'
          ? { ...d.documents, resumeBlobId: id, resumeFilename: file.name }
          : { ...d.documents, coverLetterBlobId: id, coverLetterFilename: file.name },
    }));
  };

  // Résumé upload: store the blob, and if it's a PDF, extract its text and seed the
  // profile (basic pass) + prefill the box so the user can also run the AI pass (§M8).
  const onResume = async (file: File | undefined) => {
    if (!file) return;
    await storeDoc('resume', file);
    const looksPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!looksPdf) return;
    setPdfMsg('Reading PDF…');
    try {
      // Lazy-load pdf.js (heavy) only when a PDF is actually uploaded — code-split out
      // of the main options bundle.
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
        onPick={onResume}
        onRemove={removeResume}
      />
      {pdfMsg && <p className="text-xs text-indigo-600">{pdfMsg}</p>}
      <DocSlot
        title="Cover letter"
        filename={docs.coverLetterFilename}
        onPick={(f) => f && void storeDoc('coverLetter', f)}
        onRemove={removeCover}
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
