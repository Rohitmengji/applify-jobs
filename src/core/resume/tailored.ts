// A JD-tailored résumé, produced by the LLM reorganizing/emphasizing the candidate's REAL
// facts (never inventing) and then validated here before we render it to a PDF. Keeping this
// pure (no jsPDF, no DOM) makes it unit-testable; the renderer lives in renderResumePdf.ts.

export interface TailoredExperience {
  title: string;
  company: string;
  dates: string;
  bullets: string[];
}
export interface TailoredEducation {
  degree: string;
  school: string;
  dates: string;
}
export interface TailoredResume {
  name: string;
  contact: string; // single line: email · phone · city · links
  summary: string;
  experience: TailoredExperience[];
  education: TailoredEducation[];
  skills: string[];
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/**
 * Coerce the LLM's JSON into a safe TailoredResume, dropping anything malformed and capping
 * sizes so a runaway response can't produce a monster document. Returns null if there's
 * nothing usable (no name and no experience), so the caller can surface an error instead of
 * rendering an empty résumé.
 */
export function normalizeTailored(raw: unknown): TailoredResume | null {
  const o = obj(raw);
  const name = str(o.name);

  const experience: TailoredExperience[] = list(o.experience)
    .map((e) => {
      const x = obj(e);
      return {
        title: str(x.title),
        company: str(x.company),
        dates: str(x.dates),
        bullets: list(x.bullets).map(str).filter(Boolean).slice(0, 8),
      };
    })
    .filter((e) => e.title || e.company)
    .slice(0, 12);

  const education: TailoredEducation[] = list(o.education)
    .map((e) => {
      const x = obj(e);
      return { degree: str(x.degree), school: str(x.school), dates: str(x.dates) };
    })
    .filter((e) => e.degree || e.school)
    .slice(0, 8);

  const skills = list(o.skills).map(str).filter(Boolean).slice(0, 40);

  if (!name && experience.length === 0) return null;

  return { name, contact: str(o.contact), summary: str(o.summary), experience, education, skills };
}

/** A readable plain-text rendering for the in-panel preview (what the user reviews). */
export function tailoredToPlainText(t: TailoredResume): string {
  const out: string[] = [];
  if (t.name) out.push(t.name);
  if (t.contact) out.push(t.contact);
  if (t.summary) out.push('', 'SUMMARY', t.summary);
  if (t.experience.length) {
    out.push('', 'EXPERIENCE');
    for (const e of t.experience) {
      const head = [e.title, e.company].filter(Boolean).join(' — ');
      out.push(e.dates ? `${head}  (${e.dates})` : head);
      for (const b of e.bullets) out.push(`  • ${b}`);
    }
  }
  if (t.education.length) {
    out.push('', 'EDUCATION');
    for (const e of t.education) {
      const head = [e.degree, e.school].filter(Boolean).join(', ');
      out.push(e.dates ? `${head}  (${e.dates})` : head);
    }
  }
  if (t.skills.length) out.push('', 'SKILLS', t.skills.join(' · '));
  return out.join('\n');
}
