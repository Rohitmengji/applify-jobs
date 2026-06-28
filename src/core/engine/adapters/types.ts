import type { DetectedField } from '../../types';

// IMPLEMENTATION.md §14.1 — a site adapter knows a specific ATS's exact DOM.
export interface SiteAdapter {
  id: string; // 'greenhouse', 'lever', …

  /** Return true if this adapter handles the current page. */
  matches(url: URL, doc: Document): boolean;

  /** Optional adapter-specific detection. If omitted, the generic detector is used. */
  detectFields?(doc: Document): DetectedField[];

  /** Optional per-field fill override for tricky custom controls. Return true if handled. */
  fillField?(field: DetectedField, value: string): Promise<boolean>;

  // --- multi-step support (Workday, iCIMS, SF, Oracle) ---
  isMultiStep?(doc: Document): boolean;
  isReviewStep?(doc: Document): boolean;
  findNextButton?(doc: Document): HTMLElement | null;
  findSubmitButton?(doc: Document): HTMLElement | null;
}
