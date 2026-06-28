// Detect a country named in free text (e.g. a work-authorization question like
// "Are you authorized to work in the United States?") and compare countries across
// common aliases. Pure + unit-tested. Used by the work-auth value derivation.

// canonical → aliases (lowercased). Order/length handled at match time (longest wins).
const COUNTRIES: Record<string, string[]> = {
  'United States': [
    'united states of america',
    'united states',
    'u.s.a',
    'u.s.',
    'usa',
    'america',
    'us',
  ],
  'United Kingdom': ['united kingdom', 'great britain', 'u.k.', 'britain', 'england', 'uk'],
  India: ['india'],
  Canada: ['canada'],
  Australia: ['australia'],
  Germany: ['germany', 'deutschland'],
  France: ['france'],
  Ireland: ['ireland'],
  Netherlands: ['netherlands', 'holland'],
  Singapore: ['singapore'],
  'United Arab Emirates': ['united arab emirates', 'uae'],
  'New Zealand': ['new zealand'],
  Spain: ['spain'],
  Switzerland: ['switzerland'],
};

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// Build [alias, canonical] pairs sorted by alias length desc, so "united states" wins
// over the bare "us", and word-boundary matching avoids matching inside other words.
const ALIASES: { re: RegExp; canonical: string }[] = Object.entries(COUNTRIES)
  .flatMap(([canonical, aliases]) => aliases.map((a) => ({ a, canonical })))
  .sort((x, y) => y.a.length - x.a.length)
  .map(({ a, canonical }) => ({
    re: new RegExp(`(^|[^a-z0-9])${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`),
    canonical,
  }));

/** Return the canonical country named in `text`, or null. */
export function countryInText(text: string): string | null {
  const t = norm(text);
  if (!t) return null;
  for (const { re, canonical } of ALIASES) {
    if (re.test(t)) return canonical;
  }
  return null;
}

/** Canonicalize a country name (via alias table) for comparison. */
export function canonicalCountry(name: string): string {
  return countryInText(name) ?? name.trim();
}

export function sameCountry(a: string, b: string): boolean {
  return canonicalCountry(a).toLowerCase() === canonicalCountry(b).toLowerCase();
}
