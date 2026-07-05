import { useEffect, useState } from 'react';
import { Section, Button, type SectionProps } from '../components/ui';
import { getProfile, saveProfile } from '@/core/storage/profileStore';
import { recordLearned, exportLearned, importLearned } from '@/core/storage/learnStore';

// The 50 most common job application questions across all ATS platforms.
// Answer these ONCE and they auto-fill everywhere via the learning engine.
const COMMON_QUESTIONS: { id: string; question: string; hint: string; kind: string }[] = [
  // Work authorization
  {
    id: 'auth_work',
    question: 'Are you authorized to work in this country?',
    hint: 'Yes/No',
    kind: 'radio-group',
  },
  {
    id: 'sponsorship',
    question: 'Will you now or in the future require sponsorship?',
    hint: 'Yes/No',
    kind: 'radio-group',
  },
  {
    id: 'visa_type',
    question: 'What is your current visa/work permit status?',
    hint: 'e.g. H1B, OPT, Citizen, Work Permit',
    kind: 'text',
  },

  // Availability & logistics
  {
    id: 'notice_period',
    question: 'What is your notice period?',
    hint: 'e.g. Immediate, 15 days, 30 days, 60 days, 90 days',
    kind: 'text',
  },
  {
    id: 'start_date',
    question: 'When can you start? / Earliest start date?',
    hint: 'e.g. Immediately, 2 weeks, 1 month',
    kind: 'text',
  },
  {
    id: 'relocate',
    question: 'Are you willing to relocate?',
    hint: 'Yes/No/Open to discussion',
    kind: 'text',
  },
  {
    id: 'remote_pref',
    question: 'What is your preferred work arrangement?',
    hint: 'Remote/Hybrid/On-site/Flexible',
    kind: 'text',
  },
  {
    id: 'travel',
    question: 'Are you willing to travel for work?',
    hint: 'Yes/No/Up to X%',
    kind: 'text',
  },

  // Experience & background
  {
    id: 'years_exp',
    question: 'How many years of professional experience do you have?',
    hint: 'e.g. 3',
    kind: 'text',
  },
  {
    id: 'years_relevant',
    question: 'How many years of relevant experience do you have?',
    hint: 'e.g. 3',
    kind: 'text',
  },
  {
    id: 'highest_edu',
    question: 'What is your highest level of education?',
    hint: "e.g. Bachelor's, Master's, PhD",
    kind: 'text',
  },
  {
    id: 'worked_before',
    question: 'Have you previously worked for this company?',
    hint: 'Yes/No',
    kind: 'text',
  },
  {
    id: 'applied_before',
    question: 'Have you previously applied to this company?',
    hint: 'Yes/No',
    kind: 'text',
  },
  {
    id: 'know_anyone',
    question: 'Do you know anyone who works at this company?',
    hint: 'Yes/No, if yes who',
    kind: 'text',
  },
  {
    id: 'referral',
    question: 'Were you referred by an employee?',
    hint: 'Yes/No, name if yes',
    kind: 'text',
  },

  // Salary & compensation
  {
    id: 'salary_expect',
    question: 'What are your salary expectations?',
    hint: 'e.g. 24-28 LPA, $120K-$140K',
    kind: 'text',
  },
  {
    id: 'current_ctc',
    question: 'What is your current CTC/salary?',
    hint: 'e.g. 12 LPA, $90K',
    kind: 'text',
  },

  // Source
  {
    id: 'how_heard',
    question: 'How did you hear about this position?',
    hint: 'e.g. LinkedIn, Naukri, Company Website, Referral',
    kind: 'text',
  },

  // EEO / Demographics (optional)
  {
    id: 'gender',
    question: 'What is your gender?',
    hint: 'Male/Female/Non-binary/Prefer not to say',
    kind: 'text',
  },
  {
    id: 'veteran',
    question: 'Are you a veteran or active military?',
    hint: 'No/Yes/Prefer not to say',
    kind: 'text',
  },
  {
    id: 'disability',
    question: 'Do you have a disability?',
    hint: 'No/Yes/Prefer not to say',
    kind: 'text',
  },
  {
    id: 'race',
    question: 'What is your race/ethnicity?',
    hint: 'Asian/Prefer not to say/etc.',
    kind: 'text',
  },

  // Legal
  {
    id: 'background_check',
    question: 'Are you willing to undergo a background check?',
    hint: 'Yes/No',
    kind: 'text',
  },
  {
    id: 'drug_test',
    question: 'Are you willing to take a drug test?',
    hint: 'Yes/No',
    kind: 'text',
  },
  {
    id: 'non_compete',
    question: 'Are you bound by a non-compete agreement?',
    hint: 'Yes/No',
    kind: 'text',
  },
  {
    id: 'criminal',
    question: 'Have you ever been convicted of a felony?',
    hint: 'No',
    kind: 'text',
  },

  // Technical / role-specific
  {
    id: 'proficiency_lang',
    question: 'What programming languages are you proficient in?',
    hint: 'e.g. TypeScript, JavaScript, Python, React',
    kind: 'textarea',
  },
  {
    id: 'why_role',
    question: 'Why are you interested in this role?',
    hint: '2-3 sentences about your motivation',
    kind: 'textarea',
  },
  {
    id: 'why_company',
    question: 'Why do you want to work at this company?',
    hint: '2-3 sentences',
    kind: 'textarea',
  },
  {
    id: 'strengths',
    question: 'What are your greatest strengths?',
    hint: '2-3 key strengths with examples',
    kind: 'textarea',
  },
  {
    id: 'weakness',
    question: 'What is your biggest weakness?',
    hint: 'Honest + how you work on it',
    kind: 'textarea',
  },
  {
    id: 'achievement',
    question: 'Describe your greatest professional achievement',
    hint: 'STAR format if possible',
    kind: 'textarea',
  },
  {
    id: 'challenge',
    question: 'Describe a challenge you overcame at work',
    hint: 'Situation, action, result',
    kind: 'textarea',
  },
  {
    id: 'teamwork',
    question: 'Describe a time you worked effectively in a team',
    hint: 'Your role, contribution, outcome',
    kind: 'textarea',
  },
  {
    id: 'leadership',
    question: 'Describe a time you demonstrated leadership',
    hint: 'Context, action, impact',
    kind: 'textarea',
  },
  {
    id: 'conflict',
    question: 'How do you handle conflict at work?',
    hint: 'Approach + example',
    kind: 'textarea',
  },

  // Miscellaneous
  {
    id: 'additional_info',
    question: 'Is there anything else you would like us to know?',
    hint: 'Optional — leave blank or add context',
    kind: 'textarea',
  },
  {
    id: 'accommodation',
    question: 'Do you require any reasonable accommodations?',
    hint: 'No/Yes (specify)',
    kind: 'text',
  },
  {
    id: 'languages',
    question: 'What languages do you speak?',
    hint: 'e.g. English (Fluent), Hindi (Native)',
    kind: 'text',
  },
  { id: 'age_18', question: 'Are you at least 18 years of age?', hint: 'Yes', kind: 'text' },
  {
    id: 'shift_work',
    question: 'Are you available to work in shifts?',
    hint: 'Yes/No',
    kind: 'text',
  },
  {
    id: 'overtime',
    question: 'Are you willing to work overtime if required?',
    hint: 'Yes/No',
    kind: 'text',
  },
];

export function TrainingSection({ draft }: SectionProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load existing answers from answer bank on mount
  useEffect(() => {
    const existing: Record<string, string> = {};
    for (const q of COMMON_QUESTIONS) {
      const match = draft.answerBank.find(
        (a) => a.questionPattern.toLowerCase() === q.question.toLowerCase(),
      );
      if (match) existing[q.id] = match.answer;
    }
    setAnswers(existing);
  }, [draft.answerBank]);

  const updateAnswer = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
    setSaved(false);
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      const profile = await getProfile();
      const newBank = [...profile.answerBank];
      const learnEntries: { fingerprint: string; key: null; value: string }[] = [];

      for (const q of COMMON_QUESTIONS) {
        const answer = answers[q.id]?.trim();
        if (!answer) continue;

        // Add to answer bank (dedup by question)
        const existing = newBank.findIndex(
          (a) => a.questionPattern.toLowerCase() === q.question.toLowerCase(),
        );
        if (existing >= 0) {
          newBank[existing] = { ...newBank[existing], answer };
        } else {
          newBank.push({
            id: crypto.randomUUID(),
            questionPattern: q.question,
            answer,
            tags: [],
          });
        }

        // Also record as learned entries (multiple fingerprints for fuzzy matching)
        const label = q.question
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ' ')
          .trim();
        learnEntries.push({ fingerprint: `${q.kind}|${label}`, key: null, value: answer });
        // Also without question mark and with shorter form
        const short = label.replace(/\?/g, '').trim();
        if (short !== label) {
          learnEntries.push({ fingerprint: `${q.kind}|${short}`, key: null, value: answer });
        }
      }

      await saveProfile({ ...profile, answerBank: newBank });
      if (learnEntries.length > 0) {
        await recordLearned(learnEntries, null);
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  const answeredCount = Object.values(answers).filter((v) => v.trim()).length;

  return (
    <Section
      title="Training"
      description={`Answer these common questions ONCE. They'll auto-fill on every future application. (${answeredCount}/${COMMON_QUESTIONS.length} answered)`}
    >
      <div className="mb-3 flex items-center gap-3">
        <Button onClick={saveAll} disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save All Answers'}
        </Button>
        <span className="text-xs text-gray-500">
          {answeredCount} of {COMMON_QUESTIONS.length} answered
        </span>
      </div>

      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
        {COMMON_QUESTIONS.map((q) => (
          <div key={q.id} className="rounded-lg border border-gray-200 p-3">
            <label className="block text-xs font-medium text-gray-800 mb-1">{q.question}</label>
            <p className="text-[10px] text-gray-400 mb-1.5">{q.hint}</p>
            {q.kind === 'textarea' ? (
              <textarea
                value={answers[q.id] ?? ''}
                onChange={(e) => updateAnswer(q.id, e.target.value)}
                rows={3}
                className="w-full rounded border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-indigo-300 focus:outline-none"
                placeholder="Your answer..."
              />
            ) : (
              <input
                type="text"
                value={answers[q.id] ?? ''}
                onChange={(e) => updateAnswer(q.id, e.target.value)}
                className="w-full rounded border border-gray-200 px-2.5 py-1.5 text-xs text-gray-700 focus:border-indigo-300 focus:outline-none"
                placeholder="Your answer..."
              />
            )}
          </div>
        ))}
      </div>

      {/* Export/Import learned data */}
      <div className="mt-6 rounded-lg border border-dashed border-gray-300 p-4">
        <h3 className="mb-1 text-sm font-semibold text-gray-700">Learned Data</h3>
        <p className="mb-3 text-xs text-gray-400">
          Export your learned answers to transfer to another device, or import a backup.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            onClick={async () => {
              const data = await exportLearned();
              const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = 'oneclick-apply-learned.json';
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Export learned data
          </Button>
          <label className="cursor-pointer rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50">
            Import learned data
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const text = await file.text();
                  const data = JSON.parse(text);
                  const count = await importLearned(data);
                  alert(`Imported ${count} learned entries.`);
                } catch {
                  alert('Invalid file — expected a JSON export from OneClick Apply.');
                }
                e.target.value = '';
              }}
            />
          </label>
        </div>
      </div>
    </Section>
  );
}
