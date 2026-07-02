import type { SiteAdapter } from './types';
import { detectFields } from '../detect';
import type { ProfileKey } from '../../profile.schema';

// Zoho Recruit adapter — Zoho's ATS platform.
// Matches *.zohorecruit.com and recruit.zoho.com.

const NAME_MAP: Record<string, ProfileKey> = {
  First_Name: 'personal.firstName',
  Last_Name: 'personal.lastName',
  Email: 'personal.email',
  Phone: 'personal.phone',
  Mobile: 'personal.phone',
  City: 'personal.address.city',
  State: 'personal.address.state',
  Zip_Code: 'personal.address.zip',
  Country: 'personal.address.country',
  Street: 'personal.address.line1',
  LinkedIn: 'links.linkedin',
  Website: 'links.website',
  Current_Salary: 'salary.expected',
  Expected_Salary: 'salary.expected',
};

export const zohorecruit: SiteAdapter = {
  id: 'zohorecruit',
  matches(url) {
    return (
      /(^|\.)zohorecruit\.com$/.test(url.hostname) ||
      /recruit\.zoho\.(com|in|eu)$/.test(url.hostname)
    );
  },
  detectFields(doc) {
    const fields = detectFields(doc);
    for (const f of fields) {
      const name = f.signals.name;
      const key = NAME_MAP[name] ?? NAME_MAP[name.replace(/[-_]/g, '_')];
      if (key) {
        f.mappedKey = key;
        f.confidence = 0.95;
        f.source = 'adapter';
        f.reason = `Zoho Recruit name="${f.signals.name}"`;
      }
    }
    return fields;
  },
};
