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

import { normCountry as norm } from './util';

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

// --- US States & Territories normalization ---
const US_STATES: Record<string, string[]> = {
  Alabama: ['al', 'alabama'],
  Alaska: ['ak', 'alaska'],
  Arizona: ['az', 'arizona'],
  Arkansas: ['ar', 'arkansas'],
  California: ['ca', 'california', 'calif'],
  Colorado: ['co', 'colorado'],
  Connecticut: ['ct', 'connecticut'],
  Delaware: ['de', 'delaware'],
  Florida: ['fl', 'florida'],
  Georgia: ['ga', 'georgia'],
  Hawaii: ['hi', 'hawaii'],
  Idaho: ['id', 'idaho'],
  Illinois: ['il', 'illinois'],
  Indiana: ['in', 'indiana'],
  Iowa: ['ia', 'iowa'],
  Kansas: ['ks', 'kansas'],
  Kentucky: ['ky', 'kentucky'],
  Louisiana: ['la', 'louisiana'],
  Maine: ['me', 'maine'],
  Maryland: ['md', 'maryland'],
  Massachusetts: ['ma', 'massachusetts'],
  Michigan: ['mi', 'michigan'],
  Minnesota: ['mn', 'minnesota'],
  Mississippi: ['ms', 'mississippi'],
  Missouri: ['mo', 'missouri'],
  Montana: ['mt', 'montana'],
  Nebraska: ['ne', 'nebraska'],
  Nevada: ['nv', 'nevada'],
  'New Hampshire': ['nh', 'new hampshire'],
  'New Jersey': ['nj', 'new jersey'],
  'New Mexico': ['nm', 'new mexico'],
  'New York': ['ny', 'new york'],
  'North Carolina': ['nc', 'north carolina'],
  'North Dakota': ['nd', 'north dakota'],
  Ohio: ['oh', 'ohio'],
  Oklahoma: ['ok', 'oklahoma'],
  Oregon: ['or', 'oregon'],
  Pennsylvania: ['pa', 'pennsylvania'],
  'Rhode Island': ['ri', 'rhode island'],
  'South Carolina': ['sc', 'south carolina'],
  'South Dakota': ['sd', 'south dakota'],
  Tennessee: ['tn', 'tennessee'],
  Texas: ['tx', 'texas'],
  Utah: ['ut', 'utah'],
  Vermont: ['vt', 'vermont'],
  Virginia: ['va', 'virginia'],
  Washington: ['wa', 'washington'],
  'West Virginia': ['wv', 'west virginia'],
  Wisconsin: ['wi', 'wisconsin'],
  Wyoming: ['wy', 'wyoming'],
  'District of Columbia': ['dc', 'district of columbia', 'washington dc', 'washington d.c.'],
};

// Indian states (common for Indian applicants)
const INDIAN_STATES: Record<string, string[]> = {
  Karnataka: ['karnataka', 'ka'],
  Maharashtra: ['maharashtra', 'mh'],
  'Tamil Nadu': ['tamil nadu', 'tn'],
  Telangana: ['telangana', 'ts'],
  'Andhra Pradesh': ['andhra pradesh', 'ap'],
  'Uttar Pradesh': ['uttar pradesh', 'up'],
  Delhi: ['delhi', 'new delhi', 'dl'],
  Gujarat: ['gujarat', 'gj'],
  Rajasthan: ['rajasthan', 'rj'],
  'West Bengal': ['west bengal', 'wb'],
  Punjab: ['punjab', 'pb'],
  Haryana: ['haryana', 'hr'],
  Kerala: ['kerala', 'kl'],
  'Madhya Pradesh': ['madhya pradesh', 'mp'],
};

// Build a combined state lookup (canonical → lowercase aliases)
const ALL_STATES: Record<string, string[]> = { ...US_STATES, ...INDIAN_STATES };

// Flatten: alias → canonical
const STATE_LOOKUP = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(ALL_STATES)) {
  STATE_LOOKUP.set(canonical.toLowerCase(), canonical);
  for (const alias of aliases) {
    STATE_LOOKUP.set(alias.toLowerCase(), canonical);
  }
}

// Flatten country aliases into a lookup map too
const COUNTRY_LOOKUP = new Map<string, string>();
for (const [canonical, aliases] of Object.entries(COUNTRIES)) {
  COUNTRY_LOOKUP.set(canonical.toLowerCase(), canonical);
  for (const alias of aliases) {
    COUNTRY_LOOKUP.set(alias, canonical);
  }
}

/**
 * Given a target value (from user profile) and a list of dropdown option texts,
 * find the best match using alias normalization. Returns the matching option text
 * or null if no match.
 *
 * This handles:
 * - "United States" matching "United States of America"
 * - "US" matching "United States"
 * - "CA" matching "California"
 * - "Karnataka" matching "KA"
 */
export function matchByAlias(target: string, options: string[]): string | null {
  const t = target.toLowerCase().trim();
  if (!t) return null;

  // 1) Direct exact match (already handled by pickOption, but just in case)
  const exact = options.find((o) => o.toLowerCase().trim() === t);
  if (exact) return exact;

  // 2) Resolve target to its canonical form
  const canonicalTarget = COUNTRY_LOOKUP.get(t) ?? STATE_LOOKUP.get(t) ?? null;

  if (canonicalTarget) {
    // Try matching canonical against options
    const canonLower = canonicalTarget.toLowerCase();
    const match = options.find((o) => o.toLowerCase().trim() === canonLower);
    if (match) return match;

    // Try matching all aliases of the canonical against options
    const countryAliases = COUNTRIES[canonicalTarget];
    const stateAliases = ALL_STATES[canonicalTarget];
    const allAliases = [...(countryAliases ?? []), ...(stateAliases ?? []), canonLower];

    for (const alias of allAliases) {
      const m = options.find((o) => o.toLowerCase().trim() === alias);
      if (m) return m;
    }

    // Try substring: option contains canonical or canonical contains option
    for (const o of options) {
      const oLower = o.toLowerCase().trim();
      if (oLower.includes(canonLower) || canonLower.includes(oLower)) {
        // Guard against too-short matches
        if (oLower.length >= 3 && canonLower.length >= 3) return o;
      }
    }
  }

  // 3) Reverse: resolve each option to canonical, compare to target's canonical
  for (const o of options) {
    const oLower = o.toLowerCase().trim();
    const oCanonical = COUNTRY_LOOKUP.get(oLower) ?? STATE_LOOKUP.get(oLower) ?? null;
    if (oCanonical && canonicalTarget && oCanonical === canonicalTarget) return o;
  }

  return null;
}
