import { useState } from 'react';

interface Props {
  onComplete: () => void;
}

const STEPS = [
  {
    title: 'Welcome to OneClick Apply',
    description: 'Fill job applications across every ATS in seconds. Let\'s get you set up.',
    icon: '🚀',
  },
  {
    title: 'Set Up Your Profile',
    description: 'Fill in your personal info, experience, and skills. This data fills forms automatically.',
    icon: '👤',
    action: 'Go to profile settings to add your info.',
  },
  {
    title: 'Upload Your Resume',
    description: 'Upload your PDF resume in the Documents tab. It auto-attaches to file upload fields.',
    icon: '📄',
  },
  {
    title: 'Train Once, Fill Forever',
    description:
      'This is the biggest time-saver. In the Training tab, answer 42 common questions once — work authorization, notice period, salary, “why this company.” OneClick remembers and auto-fills them on every future application. 10 minutes here can save 100+ hours.',
    icon: '🧠',
    action: 'Don\'t skip this — it\'s what makes the extension feel like magic.',
  },
  {
    title: 'Add Your AI Key (optional)',
    description:
      'For AI-drafted answers and tailored cover letters, add an OpenAI or Anthropic (Claude) API key in Settings. Everything else works without it.',
    icon: '🔑',
  },
  {
    title: 'You\'re Ready!',
    description: 'Open any job application, click the OneClick Apply icon, and watch it fill. The more you use it, the smarter it gets.',
    icon: '✨',
  },
];

export function Onboarding({ onComplete }: Props) {
  const [step, setStep] = useState(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-md rounded-2xl bg-white p-8 shadow-2xl">
        {/* Progress dots */}
        <div className="mb-6 flex justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all ${
                i === step ? 'w-6 bg-indigo-600' : i < step ? 'w-2 bg-indigo-300' : 'w-2 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="mb-4 text-center text-5xl">{current.icon}</div>

        {/* Content */}
        <h2 className="mb-2 text-center text-xl font-bold text-gray-900">{current.title}</h2>
        <p className="mb-6 text-center text-sm text-gray-600">{current.description}</p>
        {current.action && (
          <p className="mb-4 text-center text-xs text-indigo-600">{current.action}</p>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-medium text-gray-700 transition hover:bg-gray-50"
            >
              Back
            </button>
          )}
          <button
            onClick={() => (isLast ? onComplete() : setStep(step + 1))}
            className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:shadow-md"
          >
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>

        {/* Skip */}
        {!isLast && (
          <button
            onClick={onComplete}
            className="mt-3 w-full text-center text-xs text-gray-400 hover:text-gray-600"
          >
            Skip setup
          </button>
        )}
      </div>
    </div>
  );
}
