// Vite `?url` asset imports — used to bundle the pdf.js worker and hand its URL to
// pdfjs.GlobalWorkerOptions.workerSrc. Declared specifically so it doesn't collide with
// any generic `*?url` declaration from vite/client.
declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const src: string;
  export default src;
}
