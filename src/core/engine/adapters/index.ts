import type { SiteAdapter } from './types';
import { greenhouse } from './greenhouse';
import { lever } from './lever';

// IMPLEMENTATION.md §14.2 — registry. Order matters: most specific first.
// Only adapters that are actually implemented are registered. As later milestones
// land (M3: workable/ashby/smartrecruiters/jazzhr; M4: workday; M5: icims/sf/oracle),
// add them here.
export const ADAPTERS: SiteAdapter[] = [greenhouse, lever];

export function matchAdapter(url: URL, doc: Document): SiteAdapter | null {
  return (
    ADAPTERS.find((a) => {
      try {
        return a.matches(url, doc);
      } catch {
        return false;
      }
    }) ?? null
  );
}
