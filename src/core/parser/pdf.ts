import * as pdfjs from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

// IMPLEMENTATION.md §M8 — extract text from an uploaded PDF résumé so parseResumeText /
// extractResumeWithLLM can seed the profile. Runs in the options page (a DOM context);
// not unit-tested here (needs a real PDF + the worker) — verified via the build + a live
// upload. The worker asset is bundled by WXT/Vite via the `?url` import above.
pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export function isPdf(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

export async function extractPdfText(file: File): Promise<string> {
  const data = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data }).promise;
  try {
    const parts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      parts.push(content.items.map((it) => ('str' in it ? it.str : '')).join(' '));
    }
    return parts
      .join('\n')
      .replace(/[ \t]+/g, ' ')
      .trim();
  } finally {
    await pdf.destroy();
  }
}
