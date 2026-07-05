import { useState } from 'react';
import { sendToBackground } from '../lib/messaging';
import type { FromBackground } from '@/core/messages';

/**
 * "Ask AI" section: paste any question from a job application,
 * get an AI-generated answer based on your profile. Copy-paste it back.
 * Includes response validation, reset, and disclaimer.
 */
export function AskAI() {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [source, setSource] = useState<'answerBank' | 'llm' | 'none'>('none');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const ask = async () => {
    if (!question.trim()) return;
    setLoading(true);
    setAnswer('');
    setSource('none');
    setCopied(false);
    try {
      const res = await sendToBackground<FromBackground>({
        type: 'LLM_DRAFT_ANSWER',
        uid: 'ask-ai-manual',
        question: question.trim(),
      });
      if (res.type === 'LLM_DRAFT_RESULT' && res.answer) {
        // Validate: response shouldn't be empty, shouldn't be too short for the question,
        // and shouldn't contain obvious error markers
        const cleaned = res.answer.trim();
        if (cleaned.length < 3) {
          setAnswer('The AI returned an unusable response. Try rephrasing your question.');
          setSource('none');
        } else if (/^(error|sorry|i cannot|i can't|as an ai)/i.test(cleaned)) {
          setAnswer(cleaned);
          setSource('none');
        } else {
          setAnswer(cleaned);
          setSource(res.source);
        }
      } else {
        setAnswer('Could not generate an answer. Check AI settings.');
        setSource('none');
      }
    } catch {
      setAnswer('Failed. Check your API key in Settings.');
      setSource('none');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setAnswer('');
    setQuestion('');
    setSource('none');
    setCopied(false);
  };

  const copy = () => {
    navigator.clipboard.writeText(answer);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="border-t border-slate-700/50 px-3 py-2">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className="text-[11px] font-semibold text-slate-300">{'\u{1F4AC}'} Ask AI</span>
        <span className="text-[10px] text-slate-500">Paste any question, get an answer</span>
      </div>

      {!answer ? (
        <>
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Paste a question from the application form here..."
            className="w-full rounded-lg border border-slate-600 bg-slate-800 px-2.5 py-2 text-[11px] text-slate-200 placeholder:text-slate-500 resize-none focus:border-indigo-400 focus:outline-none"
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
        </>
      ) : (
        <div className="rounded-lg border border-slate-600 bg-slate-800/80 p-2.5">
          {/* Header with source badge + reset */}
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] font-medium rounded px-1.5 py-0.5 bg-slate-700 text-slate-400">
              {source === 'answerBank'
                ? 'From saved answers'
                : source === 'llm'
                  ? 'AI generated'
                  : 'Response'}
            </span>
            <button
              onClick={reset}
              className="text-slate-500 hover:text-slate-300 transition"
              title="Clear and ask another question"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Answer text */}
          <pre className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-slate-200 max-h-40 overflow-y-auto">
            {answer}
          </pre>

          {/* Disclaimer */}
          <p className="mt-2 text-[9px] text-amber-500/80 flex items-center gap-1">
            <span>{'\u26A0\uFE0F'}</span> AI can make mistakes. Please review before using.
          </p>

          {/* Actions */}
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={copy}
              className="rounded-md bg-indigo-900/40 border border-indigo-700/50 px-2.5 py-1 text-[10px] font-medium text-indigo-300 transition hover:bg-indigo-900/60"
            >
              {copied ? '\u2713 Copied!' : '\u{1F4CB} Copy to clipboard'}
            </button>
            <button
              onClick={reset}
              className="rounded-md border border-slate-600 px-2.5 py-1 text-[10px] text-slate-400 transition hover:bg-slate-700"
            >
              Ask another
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
