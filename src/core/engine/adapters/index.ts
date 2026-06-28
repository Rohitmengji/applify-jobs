import type { SiteAdapter } from './types';
import { greenhouse } from './greenhouse';
import { lever } from './lever';
import { workable } from './workable';
import { ashby } from './ashby';
import { smartrecruiters } from './smartrecruiters';
import { jazzhr } from './jazzhr';
import { workday } from './workday';
import { icims } from './icims';
import { successfactors } from './successfactors';
import { oracle } from './oracle';

// IMPLEMENTATION.md §14.2 — registry. Order matters: most specific first.
export const ADAPTERS: SiteAdapter[] = [
  greenhouse,
  lever,
  workable,
  ashby,
  smartrecruiters,
  jazzhr,
  workday,
  icims,
  successfactors,
  oracle,
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
