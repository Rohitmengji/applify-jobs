import type { SavedAnswer } from '../profile.schema';

// IMPLEMENTATION.md §20 — before any LLM draft, check whether a saved answer matches.
// Resolution order for free-text: answer bank → LLM draft → leave blank + flag.

const tokenize = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9 ]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 2),
  );

function jaccard(a: Set<string>, b: Set<string>): number {
  const inter = [...a].filter((x) => b.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : inter / union;
}

export function findAnswer(question: string, bank: SavedAnswer[], min = 0.5): SavedAnswer | null {
  const q = tokenize(question);
  let best: { ans: SavedAnswer; score: number } | null = null;
  for (const a of bank) {
    const score = jaccard(q, tokenize(a.questionPattern));
    if (!best || score > best.score) best = { ans: a, score };
  }
  return best && best.score >= min ? best.ans : null;
}
