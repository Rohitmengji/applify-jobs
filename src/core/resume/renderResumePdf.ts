import { jsPDF } from 'jspdf';
import type { TailoredResume } from './tailored';

// Deterministically render a TailoredResume to a clean single-column PDF. The LLM only
// produces the structured CONTENT (validated in tailored.ts); layout is fixed here, so the
// output is predictable and can't be hijacked by model formatting. Runs in a DOM context
// (side panel); lazy-imported so jsPDF isn't in the panel's initial bundle.
export function renderResumePdf(t: TailoredResume, filename = 'resume.pdf'): File {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const M = 54; // margin
  const W = doc.internal.pageSize.getWidth() - M * 2;
  const PH = doc.internal.pageSize.getHeight();
  let y = M;

  const ensure = (h: number) => {
    if (y + h > PH - M) {
      doc.addPage();
      y = M;
    }
  };

  const write = (
    s: string,
    size: number,
    opts: { bold?: boolean; gap?: number; color?: [number, number, number] } = {},
  ) => {
    if (!s) return;
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const c = opts.color ?? [20, 20, 20];
    doc.setTextColor(c[0], c[1], c[2]);
    const lineH = size * 1.28;
    for (const ln of doc.splitTextToSize(s, W)) {
      ensure(lineH);
      doc.text(ln, M, y);
      y += lineH;
    }
    y += opts.gap ?? 0;
  };

  const heading = (s: string) => {
    y += 8;
    ensure(18);
    write(s.toUpperCase(), 10.5, { bold: true, color: [90, 90, 90] });
    doc.setDrawColor(205);
    doc.line(M, y - 3, M + W, y - 3);
    y += 5;
  };

  write(t.name || 'Résumé', 20, { bold: true, gap: 1 });
  if (t.contact) write(t.contact, 9, { color: [95, 95, 95], gap: 2 });

  if (t.summary) {
    heading('Summary');
    write(t.summary, 10, { gap: 2 });
  }

  if (t.experience.length) {
    heading('Experience');
    for (const e of t.experience) {
      const head = [e.title, e.company].filter(Boolean).join(' — ');
      write(head, 10.5, { bold: true });
      if (e.dates) write(e.dates, 8.5, { color: [120, 120, 120], gap: 1 });
      for (const b of e.bullets) write(`•  ${b}`, 9.5);
      y += 5;
    }
  }

  if (t.education.length) {
    heading('Education');
    for (const e of t.education) {
      write([e.degree, e.school].filter(Boolean).join(', '), 10);
      if (e.dates) write(e.dates, 8.5, { color: [120, 120, 120], gap: 2 });
    }
  }

  if (t.skills.length) {
    heading('Skills');
    write(t.skills.join(' · '), 9.5);
  }

  return new File([doc.output('blob')], filename, { type: 'application/pdf' });
}
