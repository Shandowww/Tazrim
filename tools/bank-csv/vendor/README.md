SheetJS CE 0.20.3 standalone builds, vendored for the local lab and integrated bank importer.

Official pinned sources:
- Mini (XLSX): https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.mini.min.js
- Full (lazy-loaded for XLS): https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js

Documentation: https://docs.sheetjs.com/docs/getting-started/installation/standalone/
License: Apache-2.0, retained in LICENSE. Original copyright headers are retained.

The server exposes the CommonJS files as /vendor/xlsx-mini.js and /vendor/xlsx-full.js; Node tests use the same source. The application build packages both under /bank-import/vendor. No runtime CDN request or paid service is used. Mini omits legacy XLS; full adds BIFF/CFB and HTML readers. Strict container, size, sheet, formula and macro guards remain in xlsx-reader.mjs.
