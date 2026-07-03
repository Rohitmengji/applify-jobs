import { useState } from 'react';
import { sendToBackground } from '../lib/messaging';
import type { FromBackground } from '@/core/messages';

/**
 * "Ask AI" section: paste any question from a job application,
 * get an AI-generated answer based on your profile. Copy-paste it back.
 */
export function AskAI() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const ask = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer('');
    setCopied(false);
    try {
      const res = await sendToBackground<FromBackground>({
        type: 'LLM_DRAFT_ANSWER',
        uid: 'ask-ai-manual',
        question: question.trim(),
      });
      if (res.type === 'LLM_DRAFT_RESULT' && res.answer) {
        setAnswer(res.answer);
      } else {
        setAnswer('Could not generate an answer. Check AI settings.');
      }
    } catch {
      setAnswer('Failed. Check your API key in Settings.');
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-t border-gray-100 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[11px] font-semibold text-gray-700">💬 Ask AI</span>
        <span className="text-[10px] text-gray-400">Paste any question, get an answer</span>
      </div>
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Paste a question from the application form here..."
        className="w-full rounded-lg border border-gray-200 px-2.5 py-2 text-[11px] text-gray-700 resize-none focus:border-indigo-300 focus:outline-none focus:ring-1 focus:ring-indigo-200"
        rows={2}
      />
      <button
        onClick={ask}
        disabled={loading || !question.trim()}
        className="mt-1.5 w-full rounded-lg bg-linear-to-r from-indigo-500 to-purple-500 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm transition hover:shadow-md disabled:opacity-50"
      >
        {loading ? (
          <span className="flex items-center justify-center gap-1.5">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            Generating...
          </span>
        ) : (
          'Generate Answer'
        )}
      </button>

      {answer && (
        <div className="mt-2 rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm">
          <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-gray-700">
            {answer}
          </pre>
          <button
            onClick={copy}
            className="mt-2 rounded-md bg-indigo-50 px-2.5 py-1 text-[10px] font-medium text-indigo-600 transition hover:bg-indigo-100"
          >
            {copied ? '✓ Copied!' : '📋 Copy to clipboard'}
          </button>
        </div>
      )}
    </div>
  );
}
