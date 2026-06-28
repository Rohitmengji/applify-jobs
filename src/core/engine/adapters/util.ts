// Find a *visible, enabled* clickable control whose text/value matches a pattern.
// Used by the multi-step adapters to locate Next/Submit buttons that have no stable id.
// Skips display:none/visibility:hidden and disabled controls so a persistent/hidden
// Submit button can't falsely trip isReviewStep on every step (review finding #3).
export function findButtonByText(doc: Document, re: RegExp): HTMLElement | null {
  const els = Array.from(
    doc.querySelectorAll<HTMLElement>(
      'button, input[type=submit], input[type=button], a[role=button], [role=button]',
    ),
  );
  return (
    els.find((b) => {
      if ((b as HTMLButtonElement | HTMLInputElement).disabled) return false;
      const style = doc.defaultView?.getComputedStyle(b);
      if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
      return re.test((b.textContent || (b as HTMLInputElement).value || '').trim());
    }) ?? null
  );
}
