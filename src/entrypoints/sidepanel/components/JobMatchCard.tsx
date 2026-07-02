import { useState } from 'react';
import type { JdAnalysis } from '@/core/engine/jdAnalysis';

interface Props {
  analysis: JdAnalysis | null;
  loading: boolean;
  onAnalyze: () => void;
}

export function JobMatchCard({ analysis, loading, onAnalyze }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!analysis) {
    return (
      <div className="border-t border-gray-100 px-3 py-2">
        <button
          onClick={onAnalyze}
          disabled={loading}
          className="w-full rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 px-3 py-2 text-[11px] font-medium text-emerald-700 transition hover:border-emerald-300 hover:shadow-sm disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-1.5">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-emerald-200 border-t-emerald-600" />
              Analyzing...
            </span>
          ) : (
            '📊 Analyze Job Match'
          )}
        </button>
      </div>
    );
  }

  const { matchPercentage, matchedSkills, missingSkills, experienceLevel, yearsRequired } =
    analysis;
  const color = matchPercentage >= 75 ? 'emerald' : matchPercentage >= 50 ? 'amber' : 'red';

  return (
    <div className="border-t border-gray-100 px-3 py-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <div
            className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white bg-${color}-500`}
          >
            {matchPercentage}%
          </div>
          <div className="text-left">
            <div className="text-[11px] font-semibold text-gray-800">Job Match Score</div>
            <div className="text-[10px] text-gray-500">
              {matchedSkills.length} matched · {missingSkills.length} gaps
              {experienceLevel !== 'unknown' && ` · ${experienceLevel} level`}
            </div>
          </div>
        </div>
        <span className="text-[10px] text-gray-400">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 text-[10px]">
          {yearsRequired && (
            <div className="text-gray-600">Required: {yearsRequired} experience</div>
          )}

          {matchedSkills.length > 0 && (
            <div>
              <div className="font-medium text-emerald-700 mb-0.5">✓ Your matching skills:</div>
              <div className="flex flex-wrap gap-1">
                {matchedSkills.map((s) => (
                  <span key={s} className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {missingSkills.length > 0 && (
            <div>
              <div className="font-medium text-red-600 mb-0.5">✗ Skills to highlight or learn:</div>
              <div className="flex flex-wrap gap-1">
                {missingSkills.map((s) => (
                  <span key={s} className="rounded-full bg-red-50 px-2 py-0.5 text-red-600">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button onClick={onAnalyze} className="text-[9px] text-gray-400 hover:text-gray-600">
            ↻ Re-analyze
          </button>
        </div>
      )}
    </div>
  );
}
