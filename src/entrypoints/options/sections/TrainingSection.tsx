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

  // --- Additional questions (expanded set) ---

  // Work authorization (extended)
  {
    id: 'auth_country',
    question: 'Which countries are you authorized to work in?',
    hint: 'e.g. USA, UK, Canada, India',
    kind: 'text',
  },
  {
    id: 'visa_expiry',
    question: 'When does your current work authorization expire?',
    hint: 'e.g. N/A, Dec 2027',
    kind: 'text',
  },
  {
    id: 'clearance',
    question: 'Do you have or can you obtain a security clearance?',
    hint: 'Yes/No/Not applicable',
    kind: 'text',
  },

  // Availability (extended)
  {
    id: 'available_date',
    question: 'What date are you available to start?',
    hint: 'e.g. August 1, 2026',
    kind: 'text',
  },
  {
    id: 'part_time',
    question: 'Are you open to part-time work?',
    hint: 'Yes/No/Prefer full-time',
    kind: 'text',
  },
  {
    id: 'contract',
    question: 'Are you open to contract/freelance positions?',
    hint: 'Yes/No/Prefer full-time',
    kind: 'text',
  },
  {
    id: 'work_hours',
    question: 'What are your preferred working hours?',
    hint: 'e.g. Standard 9-5, Flexible, Any',
    kind: 'text',
  },
  {
    id: 'timezone',
    question: 'What timezone are you in?',
    hint: 'e.g. IST (UTC+5:30), EST, PST',
    kind: 'text',
  },
  {
    id: 'commute',
    question: 'How far are you willing to commute?',
    hint: 'e.g. Up to 30 min, Remote only',
    kind: 'text',
  },
  {
    id: 'night_shift',
    question: 'Are you available to work night shifts?',
    hint: 'Yes/No',
    kind: 'text',
  },
  {
    id: 'weekend_work',
    question: 'Are you available to work weekends?',
    hint: 'Yes/No/Occasionally',
    kind: 'text',
  },

  // Experience (extended)
  {
    id: 'years_management',
    question: 'How many years of management/leadership experience do you have?',
    hint: 'e.g. 0, 2, 5+',
    kind: 'text',
  },
  {
    id: 'team_size',
    question: 'What is the largest team you have managed?',
    hint: 'e.g. 0 (IC), 5, 15',
    kind: 'text',
  },
  {
    id: 'current_title',
    question: 'What is your current job title?',
    hint: 'e.g. Senior Software Engineer',
    kind: 'text',
  },
  {
    id: 'current_company',
    question: 'What is your current company?',
    hint: 'e.g. Google, Startup, Self-employed',
    kind: 'text',
  },
  {
    id: 'reason_leaving',
    question: 'Why are you looking to leave your current position?',
    hint: 'Growth, challenge, relocation, layoff, etc.',
    kind: 'textarea',
  },
  {
    id: 'employment_gap',
    question: 'Can you explain any gaps in your employment?',
    hint: 'Education, travel, caregiving, etc.',
    kind: 'textarea',
  },
  {
    id: 'career_goals',
    question: 'What are your short-term and long-term career goals?',
    hint: '1-3 sentences',
    kind: 'textarea',
  },
  {
    id: 'work_style',
    question: 'How would you describe your work style?',
    hint: 'Collaborative, independent, detail-oriented, etc.',
    kind: 'textarea',
  },

  // Technical (extended)
  {
    id: 'tech_stack',
    question: 'What is your primary tech stack?',
    hint: 'e.g. React, Node.js, PostgreSQL, AWS',
    kind: 'text',
  },
  {
    id: 'frameworks',
    question: 'What frameworks/libraries are you experienced with?',
    hint: 'e.g. React, Next.js, Django, Spring Boot',
    kind: 'text',
  },
  {
    id: 'cloud',
    question: 'What cloud platforms have you worked with?',
    hint: 'e.g. AWS, GCP, Azure, None',
    kind: 'text',
  },
  {
    id: 'databases',
    question: 'What databases are you experienced with?',
    hint: 'e.g. PostgreSQL, MongoDB, Redis',
    kind: 'text',
  },
  {
    id: 'devops',
    question: 'What DevOps/CI-CD tools have you used?',
    hint: 'e.g. Docker, Kubernetes, GitHub Actions, Jenkins',
    kind: 'text',
  },
  {
    id: 'agile',
    question: 'Are you experienced with Agile/Scrum methodologies?',
    hint: 'Yes — X years / familiar',
    kind: 'text',
  },
  {
    id: 'open_source',
    question: 'Have you contributed to open source projects?',
    hint: 'Yes (links) / No',
    kind: 'text',
  },
  {
    id: 'certifications',
    question: 'Do you have any relevant certifications?',
    hint: 'e.g. AWS Solutions Architect, PMP, None',
    kind: 'text',
  },
  {
    id: 'system_design',
    question: 'Describe your experience with system design',
    hint: 'Scale, complexity, examples',
    kind: 'textarea',
  },

  // Behavioral (extended)
  {
    id: 'deadline_miss',
    question: 'Describe a time you missed a deadline. What happened?',
    hint: 'STAR format: situation, action, result',
    kind: 'textarea',
  },
  {
    id: 'feedback',
    question: 'How do you handle constructive criticism or negative feedback?',
    hint: 'Your approach + example',
    kind: 'textarea',
  },
  {
    id: 'multitask',
    question: 'How do you prioritize when you have multiple urgent tasks?',
    hint: 'Framework/approach + example',
    kind: 'textarea',
  },
  {
    id: 'learn_fast',
    question: 'Describe a time you had to learn something quickly',
    hint: 'Context, approach, outcome',
    kind: 'textarea',
  },
  {
    id: 'disagree_manager',
    question: 'Describe a time you disagreed with your manager',
    hint: 'How you handled it, outcome',
    kind: 'textarea',
  },
  {
    id: 'failed_project',
    question: 'Tell me about a project that failed. What did you learn?',
    hint: 'What went wrong, lessons, what you changed',
    kind: 'textarea',
  },
  {
    id: 'initiative',
    question: 'Give an example of when you took initiative beyond your role',
    hint: 'What you did, impact',
    kind: 'textarea',
  },
  {
    id: 'customer_focus',
    question: 'Describe a time you went above and beyond for a customer/user',
    hint: 'Context, action, impact',
    kind: 'textarea',
  },
  {
    id: 'ambiguity',
    question: 'How do you handle ambiguity or unclear requirements?',
    hint: 'Your approach, example',
    kind: 'textarea',
  },
  {
    id: 'mentor',
    question: 'Have you mentored or coached junior team members?',
    hint: 'Yes — approach + example',
    kind: 'textarea',
  },
  {
    id: 'innovation',
    question: 'Describe a time you introduced a new idea or process improvement',
    hint: 'What, why, result',
    kind: 'textarea',
  },
  {
    id: 'pressure',
    question: 'How do you perform under pressure?',
    hint: 'Approach + example of high-pressure delivery',
    kind: 'textarea',
  },

  // Culture & motivation
  {
    id: 'ideal_culture',
    question: 'What kind of work culture do you thrive in?',
    hint: 'Collaborative, fast-paced, structured, startup, etc.',
    kind: 'textarea',
  },
  {
    id: 'motivates',
    question: 'What motivates you at work?',
    hint: 'Impact, learning, autonomy, team, etc.',
    kind: 'textarea',
  },
  {
    id: 'values',
    question: 'What values are important to you in a workplace?',
    hint: 'Transparency, diversity, innovation, etc.',
    kind: 'textarea',
  },
  {
    id: 'proud_of',
    question: 'What professional accomplishment are you most proud of?',
    hint: '2-3 sentences about the impact',
    kind: 'textarea',
  },
  {
    id: 'five_years',
    question: 'Where do you see yourself in 5 years?',
    hint: 'Career progression, skills, impact',
    kind: 'textarea',
  },
  {
    id: 'passion_project',
    question: 'Do you have any side projects or passion projects?',
    hint: 'Brief description + what you learned',
    kind: 'textarea',
  },

  // Salary & compensation (extended)
  {
    id: 'benefits_priority',
    question: 'What benefits are most important to you?',
    hint: 'Health, equity, PTO, remote, learning budget',
    kind: 'text',
  },
  {
    id: 'equity',
    question: 'Are you open to equity-based compensation?',
    hint: 'Yes/Prefer cash/Open to discuss',
    kind: 'text',
  },
  {
    id: 'salary_flexible',
    question: 'Is your salary expectation flexible?',
    hint: 'Yes, depending on total package / Fixed',
    kind: 'text',
  },

  // Diversity & inclusion
  {
    id: 'pronouns',
    question: 'What are your preferred pronouns?',
    hint: 'e.g. He/Him, She/Her, They/Them',
    kind: 'text',
  },
  {
    id: 'dei_contribution',
    question: 'How have you contributed to diversity and inclusion?',
    hint: 'Initiatives, mentoring, ERGs, etc.',
    kind: 'textarea',
  },

  // Communication & collaboration
  {
    id: 'communication_style',
    question: 'How would you describe your communication style?',
    hint: 'Direct, collaborative, written-first, etc.',
    kind: 'text',
  },
  {
    id: 'remote_experience',
    question: 'Do you have experience working remotely/distributed teams?',
    hint: 'Yes — X years / tools used',
    kind: 'text',
  },
  {
    id: 'cross_functional',
    question: 'Describe your experience working with cross-functional teams',
    hint: 'Teams involved, your role, outcome',
    kind: 'textarea',
  },

  // Industry & domain
  {
    id: 'industry_exp',
    question: 'What industries have you worked in?',
    hint: 'e.g. Fintech, Healthcare, E-commerce, SaaS',
    kind: 'text',
  },
  {
    id: 'domain_knowledge',
    question: 'Do you have domain expertise relevant to this role?',
    hint: 'Specific domain knowledge/experience',
    kind: 'textarea',
  },
  {
    id: 'startup_exp',
    question: 'Do you have startup experience?',
    hint: 'Yes — stage, role, outcome / No',
    kind: 'text',
  },
  {
    id: 'enterprise_exp',
    question: 'Do you have enterprise/large company experience?',
    hint: 'Yes — company, role / No',
    kind: 'text',
  },

  // Logistics
  {
    id: 'current_location',
    question: 'What is your current location/city?',
    hint: 'e.g. Bangalore, San Francisco, London',
    kind: 'text',
  },
  {
    id: 'willing_relocate_city',
    question: 'Which cities are you willing to relocate to?',
    hint: 'e.g. NYC, SF, Seattle, Any',
    kind: 'text',
  },
  { id: 'passport', question: 'Do you have a valid passport?', hint: 'Yes/No', kind: 'text' },
  {
    id: 'drivers_license',
    question: "Do you have a valid driver's license?",
    hint: 'Yes/No',
    kind: 'text',
  },

  // Education (extended)
  { id: 'gpa', question: 'What was your GPA/percentage?', hint: 'e.g. 3.8/4.0, 85%', kind: 'text' },
  { id: 'grad_year', question: 'What year did you graduate?', hint: 'e.g. 2020', kind: 'text' },
  {
    id: 'relevant_coursework',
    question: 'What relevant coursework have you completed?',
    hint: 'Key courses, bootcamps, certifications',
    kind: 'textarea',
  },
  {
    id: 'continuing_edu',
    question: 'Are you currently pursuing any further education?',
    hint: 'No / Yes (what and when)',
    kind: 'text',
  },

  // Specific scenario questions
  {
    id: 'tell_about_yourself',
    question: 'Tell me about yourself',
    hint: 'Professional summary: background → current → future',
    kind: 'textarea',
  },
  {
    id: 'unique_value',
    question: 'What unique value do you bring to this role?',
    hint: 'Your differentiator — skills + experience + perspective',
    kind: 'textarea',
  },
  {
    id: 'difficult_coworker',
    question: 'How do you deal with a difficult coworker?',
    hint: 'Approach: empathy, communication, boundaries',
    kind: 'textarea',
  },
  {
    id: 'mistake',
    question: 'Tell me about a mistake you made and how you handled it',
    hint: 'Ownership, fix, prevention',
    kind: 'textarea',
  },
  {
    id: 'adapt_change',
    question: 'Describe a time you had to adapt to a major change at work',
    hint: 'Change, your response, outcome',
    kind: 'textarea',
  },
  {
    id: 'competing_priorities',
    question: 'How do you handle competing priorities from different stakeholders?',
    hint: 'Alignment, trade-offs, communication',
    kind: 'textarea',
  },
  {
    id: 'data_driven',
    question: 'Give an example of a data-driven decision you made',
    hint: 'Data used, analysis, decision, outcome',
    kind: 'textarea',
  },
  {
    id: 'tight_deadline',
    question: 'Tell me about a time you delivered under a tight deadline',
    hint: "Context, approach, what you sacrificed/didn't",
    kind: 'textarea',
  },
  {
    id: 'influence',
    question: 'Describe a time you had to influence others without authority',
    hint: 'Context, approach, outcome',
    kind: 'textarea',
  },

  // Additional logistics/legal
  { id: 'nda', question: 'Are you willing to sign an NDA?', hint: 'Yes', kind: 'text' },
  {
    id: 'ip_assignment',
    question: 'Are you comfortable with IP assignment clauses?',
    hint: 'Yes/Need to review terms',
    kind: 'text',
  },
  {
    id: 'employment_type',
    question: 'What employment type are you seeking?',
    hint: 'Full-time/Part-time/Contract/Any',
    kind: 'text',
  },
  {
    id: 'availability_interview',
    question: 'What is your availability for interviews?',
    hint: 'e.g. Weekdays 9-5, Flexible, Mornings only',
    kind: 'text',
  },
  {
    id: 'other_offers',
    question: 'Are you currently considering other offers?',
    hint: 'Yes/No/In process with other companies',
    kind: 'text',
  },
  {
    id: 'questions_for_us',
    question: 'Do you have any questions for us?',
    hint: 'Team structure, growth path, tech decisions, culture',
    kind: 'textarea',
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
        <span className="text-xs text-slate-400">
          {answeredCount} of {COMMON_QUESTIONS.length} answered
        </span>
      </div>

      <div className="space-y-4 max-h-[65vh] overflow-y-auto pr-2">
        {COMMON_QUESTIONS.map((q) => (
          <div key={q.id} className="rounded-lg border border-slate-600 p-3">
            <label className="block text-xs font-medium text-slate-200 mb-1">{q.question}</label>
            <p className="text-[10px] text-slate-500 mb-1.5">{q.hint}</p>
            {q.kind === 'textarea' ? (
              <textarea
                value={answers[q.id] ?? ''}
                onChange={(e) => updateAnswer(q.id, e.target.value)}
                rows={3}
                className="w-full rounded border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300 focus:border-indigo-300 focus:outline-none"
                placeholder="Your answer..."
              />
            ) : (
              <input
                type="text"
                value={answers[q.id] ?? ''}
                onChange={(e) => updateAnswer(q.id, e.target.value)}
                className="w-full rounded border border-slate-600 px-2.5 py-1.5 text-xs text-slate-300 focus:border-indigo-300 focus:outline-none"
                placeholder="Your answer..."
              />
            )}
          </div>
        ))}
      </div>

      {/* Export/Import learned data */}
      <div className="mt-6 rounded-lg border border-dashed border-slate-600 p-4">
        <h3 className="mb-1 text-sm font-semibold text-slate-300">Learned Data</h3>
        <p className="mb-3 text-xs text-slate-500">
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
          <label className="cursor-pointer rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800">
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
