// Find a clickable control whose visible text/value matches a pattern. Used by the
// multi-step adapters (Workday/iCIMS/SuccessFactors/Oracle) to locate Next/Submit
// buttons that have no stable id.
export function findButtonByText(doc: Document, re: RegExp): HTMLElement | null {
  const els = Array.from(
    doc.querySelectorAll<HTMLElement>(
      'button, input[type=submit], input[type=button], a[role=button], [role=button]',
    ),
  );
  return (
    els.find((b) => re.test((b.textContent || (b as HTMLInputElement).value || '').trim())) ?? null
  );
}
