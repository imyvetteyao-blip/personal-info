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
- Records and imported inventory are stored only in the browser on the current origin. Export JSON for backup. Moving from a local copy to the deployed site does not transfer browser storage; export/import JSON explicitly. There is no company-system integration or backend.
- Other Preparation remains **Coming soon**. Demo data is labeled and stays separate from real-record status. Shared physical stock depletion across separate preparations is not managed.
- CSV/TSV and XLSX are supported; legacy XLS is not. Spreadsheet formulas are not executed. Unsupported concentration conventions are rejected.
- Browser print / Save as PDF provides operation sheets with volume decisions and adjustment reasons.

The calculation engine is isolated in `src/calculations.mjs`. The 32 independent tests cover unit conversion, threshold boundaries, A/B/C coordination, availability, negative solvent, invalid inputs, inventory parsing, and record round trips. The seven browser tests cover real import flows, review, reopening, export, desktop/mobile layout, and print output.

ExcelJS 4.4.0 is MIT licensed; its license is included with the generated site in `docs/EXCELJS-LICENSE.txt`.
