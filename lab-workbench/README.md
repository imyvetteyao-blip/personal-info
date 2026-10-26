# Lab Preparation Workbench

Buffer Making and S/IS Making on the existing GitHub Pages site. Preparation records stay in the current browser. The built-in inventory is maintained by developers and currently contains **Demo data only**. Existing repository reports are not part of the Pages site.

## Development and deployment

Requires Node.js 20+ and Python 3 for browser-test serving.

```sh
cd lab-workbench
npm ci
npm run inventory:validate -- --demo
npm test
npm run build -- --demo
LAB_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
```

Browser tests start a local server automatically. On a machine without system Chromium, run `npx playwright install chromium` and omit `LAB_CHROMIUM_PATH`. To test a deployed site set `LAB_BASE_URL` to its URL. For manual development, serve `../docs` with a local HTTP server; directly opening index.html cannot load the versioned inventory.

Commit and push the validated `docs/` output to main. GitHub Pages uses main:/docs. The live site is `https://imyvetteyao-blip.github.io/personal-info/`; verify the actual deployment before claiming a new version is live.

## Inventory updates and access

See [the developer inventory guide](INVENTORY.md) for the exact source paths, CSV/XLSX conversion, validation, versioning, publication guard and refresh behavior. Users can explicitly choose a local CSV/XLSX inventory file, which is parsed only in browser memory; no inventory file is sent to the server. The UI shows the active search source. Refreshing requires reselecting the local file, while saved component snapshots remain. No shared-inventory editing controls exist. The public site is **not access controlled**, and frontend inventory can be downloaded. Confidential company inventory is not included and must not be committed to this public repository or release.

## Compact component workflow

Each buffer component is one comparison row. Chemical Name stays in the first column and is sticky at desktop widths. Narrow screens use contained horizontal scrolling without a pinned-column overlay. Rows expose MW, target, observation/basis, error and preparation method, with contained scrolling and sticky headers. Details is collapsed by default and opens the retained inventory summary, stock preparation fields, formulas and review controls. Main-row and detail edits update the same input model and invalidate review.

The search table shows Chemical Name, Location (with Sub-location), Amount (with Units), Company, Barcode, CAS, ID, Lot Number, State, Grade and Temperature. It omits SOP/PHS Label columns, clamps display to two lines and keeps identifiers on one line. Full values can be opened/copied. Summary fields are hidden by name: Received Date, MyChem, yearly Inventory dates, TRGS, General Storage, Inventory Source. Raw snapshots remain intact, including valid 0/false values.

Typed and pasted searches share search-only normalization for Unicode compatibility, whitespace, invisible clipboard formatting and equivalent hyphens. Paste is handled before a single-line input can join words across copied line breaks; insertion/replacement keeps the selection and surrounding text. Original names, identifiers and snapshots are never normalized or rewritten.

## Calculations and records

The final buffer volume includes every stock/liquid addition. Stock remains required below 100 mg; exactly 100 mg allows direct preparation. Pure-liquid observations use the explicitly selected mass/volume basis. Solution mass is never treated as solute mass. Stock concentration and transfer use the observed mass and each stock's own final volume.

Target Mass is calculated automatically in mg as soon as MW, Target Concentration and Target Volume are supplied, before observations or stock preparation inputs. New preparations default to µL for Target Volume; mL and L remain available and saved record units stay unchanged. Units are converted for the calculation and no numeric volume is assumed. A missing target prerequisite has a direct link from its Target Mass cell, and invalid inputs show a specific explanation. This buffer target is distinct from the optional, explicitly supplied Stock Target Mass.

Direct weighing Error is `(observed mass − target mass) / target mass × 100%`; volume-based pure liquids use density-derived mass with an explicit label. Stock weighing Error is separate and is calculated **only** when Stock Target Mass is explicitly supplied. It is never presented as a final-buffer concentration error. Existing stocks have no fabricated weighing observation or error. There are no acceptance thresholds.

S/IS unit conversions, independent stock details, minimum IS and scale-up coordination remain unchanged. Results display two decimals without rounding stored inputs/results; small nonzero values show `<0.01` with full precision available. Records retain selected inventory snapshots/versions. Legacy saved calculations remain intact until explicit recalculation; new rule version is 1.2.0.

## Sectioned Buffer Excel

One Preparation worksheet contains:

- **A. Preparation Information:** name, preparation Lot, date, target volume/unit, volume basis, optional pH, status.
- **B. Components:** nine columns, one component per row; consolidated supplier/ID/Lot/Barcode, explicit target units, applicable observations and signed Error. No unrelated inventory columns.
- **C. Stock Solutions:** only stocks; each stock's actual mass, individual final volume, amount (mmol), actual concentration and transfer. Existing-stock unknown mass/amount/final volume remain blank.

Notes explain density-derived observations and stock error scope. Numeric calculations stay numeric, with two-decimal display. Tables have borders, restrained fills, wrapping and filters; printing is one page wide with unlimited height and normal 11-point body text. No blank Instruments or procedure sections are added. Excel export and Save Preparation Record remain separate. Legacy JSON import is retained for old records; Excel is not a record-import format. S/IS retains its separate cocktail/batch exports because its per-assay semantics differ from a buffer recipe.

ExcelJS 4.4.0 is MIT licensed; the license is included in `docs/EXCELJS-LICENSE.txt`.
