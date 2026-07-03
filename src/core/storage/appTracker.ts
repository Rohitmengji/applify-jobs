import { db, type TrackedApplication } from './blobStore';

// Application tracker: logs each application the user fills so they can track
// what they've applied to, avoid duplicates, and export their history.

/** Normalize URL: strip tracking params, anchors, trailing slashes */
function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    // Remove common tracking params
    const strip = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'source',
      'ref',
      'fbclid',
      'gclid',
      'mc_cid',
      'mc_eid',
    ];
    for (const p of strip) u.searchParams.delete(p);
    u.searchParams.sort(); // order-independent key (matches fillProgress normalization)
    u.hash = '';
    return u.toString().replace(/\/+$/, '');
  } catch {
    return raw;
  }
}

/** Extract company name from page metadata or title */
export function extractCompany(doc: Document): string {
  // Try og:site_name first (most reliable)
  const ogSite = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
  if (ogSite?.trim()) return ogSite.trim();

  // Try structured data
  const ld = doc.querySelector('script[type="application/ld+json"]');
  if (ld) {
    try {
      const data = JSON.parse(ld.textContent ?? '');
      if (data.hiringOrganization?.name) return data.hiringOrganization.name;
      if (data.name) return data.name;
    } catch {
      /* malformed JSON */
    }
  }

  // Try page title: common patterns like "Company - Job Title" or "Job Title | Company"
  const title = doc.title.trim();
  const parts = title.split(/\s*[|–—-]\s*/);
  if (parts.length >= 2) {
    // Usually company is the last part for ATS pages
    return parts[parts.length - 1].trim();
  }

  return title || doc.location.hostname;
}

/** Extract role/job title from page */
export function extractRole(doc: Document): string {
  // Try og:title
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle?.trim()) return ogTitle.trim();

  // Try h1 (many ATS pages put the job title in h1)
  const h1 = doc.querySelector('h1')?.textContent?.trim();
  if (h1 && h1.length < 100) return h1;

  // Try page title first part
  const title = doc.title.trim();
  const parts = title.split(/\s*[|–—-]\s*/);
  if (parts.length >= 2) return parts[0].trim();

  return title;
}

/**
 * Log an application. Deduplicates by normalized URL within the SAME window findDuplicate
 * warns on (30 days), so re-filling a job you already applied to updates the existing entry
 * instead of creating a second history row.
 */
export async function logApplication(
  opts: {
    company: string;
    role: string;
    url: string;
    atsType: string;
  },
  withinDays = 30,
): Promise<TrackedApplication | null> {
  const normalizedUrl = normalizeUrl(opts.url);
  const now = Date.now();
  const cutoff = now - withinDays * 24 * 60 * 60 * 1000;

  // Same URL within the dedup window → touch the existing entry, don't insert a duplicate.
  const existing = await db.applications
    .where('url')
    .equals(normalizedUrl)
    .filter((a) => a.appliedAt > cutoff)
    .first();

  if (existing) {
    await db.applications.update(existing.id, { updatedAt: now });
    return existing;
  }

  const app: TrackedApplication = {
    id: crypto.randomUUID(),
    company: opts.company,
    role: opts.role,
    url: normalizedUrl,
    atsType: opts.atsType,
    status: 'applied',
    appliedAt: now,
    updatedAt: now,
    notes: '',
  };
  await db.applications.put(app);
  return app;
}

/** Get all applications, most recent first */
export async function getApplications(): Promise<TrackedApplication[]> {
  return db.applications.orderBy('appliedAt').reverse().toArray();
}

/** Update an application's status or notes */
export async function updateApplication(
  id: string,
  patch: Partial<Pick<TrackedApplication, 'status' | 'notes'>>,
): Promise<void> {
  await db.applications.update(id, { ...patch, updatedAt: Date.now() });
}

/** Delete an application */
export async function deleteApplication(id: string): Promise<void> {
  await db.applications.delete(id);
}

/** Check if the user has already applied to this URL recently */
export async function findDuplicate(
  url: string,
  withinDays = 30,
): Promise<TrackedApplication | null> {
  const normalizedUrl = normalizeUrl(url);
  const cutoff = Date.now() - withinDays * 24 * 60 * 60 * 1000;
  const result = await db.applications
    .where('url')
    .equals(normalizedUrl)
    .filter((a) => a.appliedAt > cutoff)
    .first();
  return result ?? null;
}

/** Export all applications as CSV string */
export function applicationsToCSV(apps: TrackedApplication[]): string {
  const headers = ['Company', 'Role', 'URL', 'ATS', 'Status', 'Applied Date', 'Notes'];
  const rows = apps.map((a) => [
    a.company,
    a.role,
    a.url,
    a.atsType,
    a.status,
    new Date(a.appliedAt).toISOString().split('T')[0],
    a.notes,
  ]);
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`;
  return [headers.join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
}
