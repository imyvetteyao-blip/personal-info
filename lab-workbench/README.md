# Lab Preparation Workbench

This directory contains the source of the Buffer Making and S/IS Making web app. The generated, self-contained site is published from the repository's `docs/` directory. Existing repository reports are not part of the Pages site.

## Development

Requires Node.js 20+.

```sh
cd lab-workbench
npm ci
npm test
npm run build
python3 -m http.server 4182 --bind 127.0.0.1 --directory ../docs
```

Build output is `../docs/index.html`, with all JavaScript, styles, and the ExcelJS XLSX reader embedded. No backend or external runtime scripts are required.

For browser checks, keep the local server running, then run:

```sh
LAB_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

On a computer without system Chromium, run `npx playwright install chromium` and omit `LAB_CHROMIUM_PATH`. `LAB_BASE_URL` overrides the test server address.

## GitHub Pages deployment

Repository Settings → Pages → Build and deployment:

- Source: **Deploy from a branch**
- Branch: **main**
- Folder: **/docs**

Only `docs/` is published. `docs/.nojekyll` selects static serving. After the initial Pages activation, pushing updated output to main triggers a new deployment. Generate output with `npm run build`; do not edit it manually.

The expected address after successful deployment is `https://imyvetteyao-blip.github.io/personal-info/`. A commit alone does not establish that Pages is enabled or the website is live.

## Behavior and limitations

- Buffer recipes share a final volume that includes all stocks and liquids. Stock preparation is required below 100 mg; exactly 100 mg permits direct preparation. Inventory imports retain complete selected rows and explicit MW/form/density inputs.
- S/IS supports Weight/MW, qNMR amount, and qNMR concentration with its corresponding sample volume. Every cocktail uses its own confirmed final volume for S, IS, and solvent calculations. The minimum IS and scale-up threshold remain independent.
- Drafts can be incomplete. Reviewed records require valid inputs, sufficient stock, calculation checks, and a confirmed S/IS volume plan. Edits reset review.
- Records and imported inventory are stored only in the browser on the current origin. Export preparation Excel workbooks for documentation. Moving from a local copy to the deployed site does not transfer browser storage; export/import JSON explicitly. There is no company-system integration or backend.
- Other Preparation remains **Coming soon**. Demo data is labeled and stays separate from real-record status. Shared physical stock depletion across separate preparations is not managed.
- CSV/TSV and XLSX are supported; legacy XLS is not. Spreadsheet formulas are not executed. Unsupported concentration conventions are rejected.
- Export Preparation Excel creates a real .xlsx workbook for either module, including metadata, measured inputs, calculated results, volume decisions and adjustment reasons. Excel export and local record saving are separate actions.

The calculation engine is isolated in `src/calculations.mjs`. The independent tests cover unit conversion, threshold boundaries, A/B/C coordination, availability, negative solvent, invalid inputs, inventory parsing, and record round trips. The browser tests cover real import flows, review, reopening, export, desktop/mobile layout, and print output.

ExcelJS 4.4.0 is MIT licensed; its license is included with the generated site in `docs/EXCELJS-LICENSE.txt`.

## Inventory import contract

`src/inventory-config.mjs` centrally configures worksheet selection, header row, explicit column aliases, required fields and the legacy CSV encoding. There are no worksheet/header/mapping selectors in the UI. The current contract uses header row 1, requires Chemical Name, CAS and Barcode (MW/Density optional), and selects only a unique matching worksheet. Set `worksheetName` to an exact name when the actual workbook template is supplied. Multiple matches, ambiguous aliases and missing required columns produce explicit errors rather than guessing. ID is never silently treated as Barcode. The actual inventory workbook was not attached to this change request; automatic import has been verified using generated contract-matching CSV/XLSX fixtures.

CSV bytes are decoded strictly as UTF-8 (including BOM), BOM-declared UTF-16, or the centrally configured legacy English Excel encoding, Windows-1252. The UI reports the decoder used. Change `csvLegacyEncoding` if the source inventory uses another declared encoding, or set it to null to require UTF-8/BOM-declared Unicode. Invalid declared encodings fail explicitly; no global character replacement or mojibake substitution is performed. Already-damaged source text cannot be reconstructed by a decoder.

Search values and headers are display-clamped to two lines. Identifier columns and Add component stay on one line, and a horizontally scrolling table preserves practical column widths. Hover or click a cell to inspect and copy its full value. Component summaries hide only missing values; full inventory snapshots (including empty fields) remain in saved records.

## Observations, precision and Excel

Pure liquids offer By Mass and By Volume. Both measurements may be retained, but the selected basis alone determines the actual concentration and error. Density-derived values are explicitly labeled. Commodity solutions use known solution concentration and, for mass observations, solution density; solution mass is not solute mass. New-stock preparation requires stock actual mass and final solution volume. The observed transfer is optional: its absence does not hide the theoretical transfer, but actual final concentration remains blank until an observation is recorded.

Direct preparations show signed mass deviation and mass error without an acceptance threshold. No observed mass means no fabricated 0% error. Internal precision and input strings are preserved. Results display two decimal places; nonzero magnitudes below 0.005 display `<0.01`, with full precision available by click. Calculated buffer stock transfers are converted to µL before display and export.

Excel exports keep identifiers as text and calculation cells as numbers. The preparation sheet has record metadata, one component per row, full supplier fields, measured-versus-derived observation fields, distinct target/stock mass, errors, review status, column widths/wrapping, frozen headers and filters. Incomplete exports remain Draft with empty missing cells. Small nonzero numeric cells use an explicit display format and a precision note. Blank irrelevant inventory columns are omitted. S/IS exports retain the independent standards and batch volume decisions. JSON export and print buttons have been removed; legacy JSON import remains available to recover existing records. Excel is a documentation export, not an automatic record-import format.

Record rule version 1.1.0 adds observation provenance and method-specific validation without changing the stock/molar/coordination formulas. Old saved results are retained read-only until explicit recalculation; they are not silently overwritten. Reopened current records preserve their observation method and signed error results.

## Verification of the updated release

On 2026-10-25, 51 independent tests and 13 Chromium browser tests passed. Browser checks downloaded real `.xlsx` files and reopened them to verify record metadata, numeric cells, complete supplier fields, identifier strings, observation provenance and signed errors. The desktop search table and pure-liquid observation panel were also visually inspected. Existing S/IS, 100 mg stock threshold, IS minimum and A/B/C coordination cases remain covered.

Pure-liquid new-stock preparation also supports a separate By Mass / By Volume choice (default By Mass for existing stock-preparation data). Measured stock compound mass and measured stock compound volume are retained separately; only the selected basis determines stock concentration. Excel distinguishes target buffer mass, stock mass used, measured stock observations and density-derived stock quantities.
