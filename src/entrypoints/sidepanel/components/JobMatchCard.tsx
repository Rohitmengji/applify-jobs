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
      <div className="border-t border-slate-700/50 px-3 py-2">
        <button
          onClick={onAnalyze}
          disabled={loading}
          className="w-full rounded-lg border border-emerald-600/50 bg-emerald-950/60 px-3 py-1.5 text-[11px] font-semibold text-emerald-300 transition hover:bg-emerald-900/60 disabled:opacity-50"
        >
          {loading ? '\u23F3 Analyzing...' : '\u{1F4CA} Analyze Job Match'}
        </button>
      </div>
    );
  }

  const { matchPercentage, matchedSkills, missingSkills, experienceLevel, yearsRequired } =
    analysis;
  const color = matchPercentage >= 75 ? 'emerald' : matchPercentage >= 50 ? 'amber' : 'red';

  return (
    <div className="border-t border-slate-700/50 px-3 py-2">
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
            <div className="text-[11px] font-semibold text-slate-200">Job Match Score</div>
            <div className="text-[10px] text-slate-400">
              {matchedSkills.length} matched \u00B7 {missingSkills.length} gaps
              {experienceLevel !== 'unknown' && ` \u00B7 ${experienceLevel} level`}
            </div>
          </div>
        </div>
        <span className="text-[10px] text-slate-500">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {expanded && (
        <div className="mt-2 space-y-2 text-[10px]">
          {yearsRequired && (
            <div className="text-slate-400">Required: {yearsRequired} experience</div>
          )}

          {matchedSkills.length > 0 && (
            <div>
              <div className="font-medium text-emerald-400 mb-0.5">
                {'\u2713'} Your matching skills:
              </div>
              <div className="flex flex-wrap gap-1">
                {matchedSkills.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-emerald-300"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {missingSkills.length > 0 && (
            <div>
              <div className="font-medium text-red-400 mb-0.5">
                {'\u2717'} Skills to highlight or learn:
              </div>
              <div className="flex flex-wrap gap-1">
                {missingSkills.map((s) => (
                  <span key={s} className="rounded-full bg-red-900/40 px-2 py-0.5 text-red-300">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button onClick={onAnalyze} className="text-[9px] text-slate-500 hover:text-slate-300">
            {'\u21BB'} Re-analyze
          </button>
        </div>
      )}
    </div>
  );
}
