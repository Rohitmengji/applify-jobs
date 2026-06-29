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
import { indeed } from './indeed';
import { jobvite } from './jobvite';
import { linkedin } from './linkedin';
import { bamboohr } from './bamboohr';
import { recruitee } from './recruitee';
import { teamtailor } from './teamtailor';
import { breezyhr } from './breezyhr';
import { comeet } from './comeet';
import { pinpoint } from './pinpoint';
import { personio } from './personio';
import { rippling } from './rippling';
import { wellfound } from './wellfound';
import { dice } from './dice';
import { ziprecruiter } from './ziprecruiter';
import { naukri } from './naukri';
import { joincom } from './joincom';
import { zohorecruit } from './zohorecruit';
import { keka } from './keka';

// IMPLEMENTATION.md §14.2 — registry. Order matters: most specific first.
// 28 adapters covering all major ATS platforms + job boards worldwide.
export const ADAPTERS: SiteAdapter[] = [
  greenhouse,
  lever,
  workable,
  ashby,
  smartrecruiters,
  jobvite,
  linkedin,
  bamboohr,
  recruitee,
  teamtailor,
  breezyhr,
  comeet,
  pinpoint,
  personio,
  rippling,
  wellfound,
  naukri,
  joincom,
  zohorecruit,
  keka,
  dice,
  ziprecruiter,
  jazzhr,
  indeed,
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
