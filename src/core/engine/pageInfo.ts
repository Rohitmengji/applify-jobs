// Extract metadata from the current page (company name, job title).
// Runs in the content script — must NOT import Dexie or any storage module.

/** Extract company name from page metadata or title */
export function extractCompany(doc: Document): string {
  const ogSite = doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content');
  if (ogSite?.trim()) return ogSite.trim();

  const ld = doc.querySelector('script[type="application/ld+json"]');
  if (ld) {
    try {
      const data = JSON.parse(ld.textContent ?? '');
      if (data.hiringOrganization?.name) return data.hiringOrganization.name;
      if (data.name) return data.name;
    } catch { /* malformed JSON */ }
  }

  const title = doc.title.trim();
  const parts = title.split(/\s*[|\u2013\u2014-]\s*/);
  if (parts.length >= 2) return parts[parts.length - 1].trim();
  return title || doc.location.hostname;
}

/** Extract role/job title from page */
export function extractRole(doc: Document): string {
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content');
  if (ogTitle?.trim()) return ogTitle.trim();

  const h1 = doc.querySelector('h1')?.textContent?.trim();
  if (h1 && h1.length < 100) return h1;

  const title = doc.title.trim();
  const parts = title.split(/\s*[|\u2013\u2014-]\s*/);
  if (parts.length >= 2) return parts[0].trim();
  return title;
}

/** Extract job description text from the page (for cover letter generation). */
export function extractDescription(doc: Document): string {
  // Try structured data
  const ld = doc.querySelector('script[type="application/ld+json"]');
  if (ld) {
    try {
      const data = JSON.parse(ld.textContent ?? '');
      if (data.description) {
        const tmp = doc.createElement('div');
        tmp.innerHTML = data.description;
        const text = (tmp.textContent ?? '').trim();
        if (text.length > 100) return text.slice(0, 3000);
      }
    } catch { /* ignore */ }
  }

  // Try common JD containers
  const selectors = [
    '[class*="job-description"]',
    '[class*="jobDescription"]',
    '[class*="job_description"]',
    '[data-testid*="description"]',
    '[id*="job-description"]',
    '[id*="jobDescription"]',
    '.description',
    'article',
    '[class*="posting-page"]',
    '[class*="job-details"]',
    '[class*="jd-"]',
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (el?.textContent && el.textContent.trim().length > 100) {
      return el.textContent.trim().slice(0, 3000);
    }
  }
  return '';
}
