import { useCallback, useEffect, useState, type ComponentType } from 'react';
import { ProfileSchema, type Profile } from '@/core/profile.schema';
import { getProfile, saveProfile } from '@/core/storage/profileStore';
import { getFile } from '@/core/storage/blobStore';
import { parseResumeText, applyParsedResume, mergeExtractedResume } from '@/core/parser/resume';
import { Button, type SectionProps } from './components/ui';
import { PersonalSection } from './sections/PersonalSection';
import { LinksSection } from './sections/LinksSection';
import { WorkAuthSection } from './sections/WorkAuthSection';
import { EeoSection } from './sections/EeoSection';
import { ExperienceSection } from './sections/ExperienceSection';
import { EducationSection } from './sections/EducationSection';
import { SkillsSection } from './sections/SkillsSection';
import { DocumentsSection } from './sections/DocumentsSection';
import { AnswerBankSection } from './sections/AnswerBankSection';
import { SettingsSection } from './sections/SettingsSection';

const TABS: { id: string; label: string; C: ComponentType<SectionProps> }[] = [
  { id: 'personal', label: 'Personal', C: PersonalSection },
  { id: 'links', label: 'Links', C: LinksSection },
  { id: 'work', label: 'Work auth', C: WorkAuthSection },
  { id: 'eeo', label: 'EEO', C: EeoSection },
  { id: 'experience', label: 'Experience', C: ExperienceSection },
  { id: 'education', label: 'Education', C: EducationSection },
  { id: 'skills', label: 'Skills', C: SkillsSection },
  { id: 'documents', label: 'Documents', C: DocumentsSection },
  { id: 'answers', label: 'Answer bank', C: AnswerBankSection },
  { id: 'settings', label: 'Settings', C: SettingsSection },
];

export function App() {
  const [draft, setDraft] = useState<Profile | null>(null);
  const [active, setActive] = useState('personal');
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [info, setInfo] = useState('');

  useEffect(() => {
    void getProfile().then(setDraft);
  }, []);

  const update = useCallback((fn: (d: Profile) => Profile) => {
    setSaved(false);
    setDraft((d) => (d ? fn(d) : d));
  }, []);

  const save = useCallback(async () => {
    if (!draft) return;
    const res = ProfileSchema.safeParse(draft);
    if (!res.success) {
      setErrors(res.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`));
      setSaved(false);
      return;
    }
    setErrors([]);
    await saveProfile(res.data);
    setSaved(true);
  }, [draft]);

  const exportJson = useCallback(() => {
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'oneclick-apply-profile.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [draft]);

  const importJson = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const res = ProfileSchema.safeParse(parsed);
      if (!res.success) {
        setErrors([
          'Import failed:',
          ...res.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
        ]);
        return;
      }
      setErrors([]);
      setDraft(res.data);
      await saveProfile(res.data);
      setSaved(true);
    } catch (e) {
      setErrors([`Import failed: ${String(e)}`]);
    }
  }, []);

  // Import Experience/Education/Skills (+ contact) from the uploaded résumé.
  const importFromResume = useCallback(async () => {
    const id = draft?.documents.resumeBlobId;
    if (!id) {
      setErrors(['Upload a résumé in the Documents tab first.']);
      return;
    }
    setErrors([]);
    setInfo('Reading résumé…');
    const file = await getFile(id);
    if (!file) {
      setErrors(['Could not read the stored résumé — re-upload it in Documents.']);
      setInfo('');
      return;
    }
    let text = '';
    const looksPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (looksPdf) {
      const { extractPdfText } = await import('@/core/parser/pdf');
      text = await extractPdfText(file).catch(() => '');
    } else {
      text = await file.text().catch(() => '');
    }
    if (!text.trim()) {
      setErrors(['No text could be extracted (the résumé may be a scanned image).']);
      setInfo('');
      return;
    }
    // Basic deterministic pass (contact/links/skills).
    setDraft((d) => (d ? applyParsedResume(d, parseResumeText(text)) : d));
    // AI pass (experience/education) when AI assist + key are configured.
    setInfo('Extracting experience & education with AI…');
    try {
      const res = await chrome.runtime.sendMessage({ type: 'LLM_EXTRACT_RESUME', text });
      if (res?.type === 'LLM_EXTRACT_RESULT' && res.data) {
        setDraft((d) => (d ? mergeExtractedResume(d, res.data) : d));
        setInfo('Imported from résumé — review the sections, then Save profile ✓');
      } else {
        setInfo(
          'Imported contact/skills. (Enable AI assist + key in Settings for experience & education.)',
        );
      }
    } catch {
      setInfo('Imported contact/skills. (AI extraction unavailable — check Settings.)');
    }
    setSaved(false);
  }, [draft]);

  if (!draft) return <div className="p-8 text-gray-500">Loading…</div>;

  const ActiveSection = TABS.find((t) => t.id === active)?.C ?? PersonalSection;

  return (
    <div className="mx-auto flex min-h-screen max-w-5xl gap-6 p-6">
      <nav className="w-44 shrink-0 space-y-1">
        <h1 className="mb-3 text-base font-bold text-indigo-700">OneClick Apply</h1>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id)}
            className={`block w-full rounded-md px-3 py-2 text-left text-sm ${
              active === t.id
                ? 'bg-indigo-100 font-medium text-indigo-700'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 space-y-6">
        <ActiveSection draft={draft} setDraft={update} />

        {errors.length > 0 && (
          <ul className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}

        <div className="sticky bottom-0 flex items-center gap-3 border-t bg-white/90 py-3 backdrop-blur">
          <Button onClick={save}>Save profile</Button>
          <Button variant="ghost" onClick={exportJson}>
            Export JSON
          </Button>
          <label className="cursor-pointer rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Import JSON
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => importJson(e.target.files?.[0])}
            />
          </label>
          <Button variant="ghost" onClick={importFromResume}>
            Import from résumé
          </Button>
          {saved && <span className="text-sm text-green-600">Saved ✓</span>}
          {info && <span className="text-sm text-indigo-600">{info}</span>}
        </div>
      </main>
    </div>
  );
}
