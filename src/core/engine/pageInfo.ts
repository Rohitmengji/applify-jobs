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
