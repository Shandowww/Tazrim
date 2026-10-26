PDF.js 6.4.299 legacy browser builds (Apache-2.0). Lazy-loaded locally only for the integrated One Zero PDF importer. Sources are the unmodified legacy/build/pdf.min.mjs and legacy/build/pdf.worker.min.mjs from the official npm package:
https://registry.npmjs.org/pdfjs-dist/-/pdfjs-dist-6.4.299.tgz

Verified package integrity:
sha512-AVl138zALtfaAPvADulE0PZThbYzCBS79nL4pOSL/6Sm/4AH5A21BD9VHt97OlCuzJuCpmeZtAtkinisF4Vb1g==

Official API documentation: https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html
The standalone app worker reads text only; no viewer, eval, XFA, image rendering, external URL or CDN fetch is enabled. Limits and independent financial checks remain in pdf-reader.mjs. The Node test supplies a dummy DOMMatrix for importing the text-only reader; optional canvas-rendering dependencies are not required for app/worker text extraction.
