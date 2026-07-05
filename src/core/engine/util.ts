// Shared string-normalization utilities for the fill engine.
// Consolidates the `norm()` function previously duplicated across heuristic, learn,
// resolve, countries, and adapter modules.

/**
 * Standard label normalizer: lowercase, strip non-alphanumeric (keep spaces), collapse
 * whitespace, trim. Used for synonym matching, fingerprints, and field comparison.
 */
export const normLabel = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Country normalizer: same as normLabel but preserves dots (for "U.S.", "D.C.", etc.).
 */
export const normCountry = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9. ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
