// CSS.escape with a fallback. Content scripts run where CSS.escape exists, but some
// headless DOM environments (jsdom) don't expose the CSS global — guard for both.
export function cssEscape(value: string): string {
  if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(value);
  // Minimal fallback adequate for id/name attribute values used in selectors.
  return value.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
}
