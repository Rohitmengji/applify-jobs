import type { SiteAdapter } from './types';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import { workable } from './workable';
import { ashby } from './ashby';
import { smartrecruiters } from './smartrecruiters';
import { jazzhr } from './jazzhr';
import { workday } from './workday';

// IMPLEMENTATION.md §14.2 — registry. Order matters: most specific first.
// Only adapters that are actually implemented are registered. As later milestones
// land (M5: icims/sf/oracle), add them here.
export const ADAPTERS: SiteAdapter[] = [
  greenhouse,
  lever,
  workable,
  ashby,
  smartrecruiters,
  jazzhr,
  workday,
];

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
