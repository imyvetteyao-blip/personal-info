# Lab Preparation Workbench

Buffer Making and Cocktail Making on the existing GitHub Pages site. Preparation records stay in the current browser. The built-in inventory is maintained by developers and currently contains **Demo data only**. Existing repository reports are not part of the Pages site.

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

Wide screens use compact comparison tables. At smaller widths the same rows become labelled, adaptive fields, retaining every control without horizontal scrolling. Expanded component details use the available page width. Inventory, components, S/IS coordination, transfer tables and saved records all follow this layout. Details remains collapsed by default; main-row and detail edits share the same input model and invalidate review.

The search table begins with Add Component, then Chemical Name, Location (with Sub-location), Amount (with Units), Company, Barcode, CAS, ID, Lot Number, State, Grade and Temperature. It omits SOP/PHS Label columns, clamps display to two lines and keeps identifiers on one line. Full values can be opened/copied. Summary fields are hidden by name: Received Date, MyChem, yearly Inventory dates, TRGS, General Storage, Inventory Source. Raw snapshots remain intact, including valid 0/false values.

Typed and pasted searches share search-only normalization for Unicode compatibility, whitespace, invisible clipboard formatting and equivalent hyphens. Paste is handled before a single-line input can join words across copied line breaks; insertion/replacement keeps the selection and surrounding text. Original names, identifiers and snapshots are never normalized or rewritten.

## Calculations and records

The final buffer volume includes every stock/liquid addition. Stock remains required below 100 mg; exactly 100 mg allows direct preparation. Pure-liquid observations use the explicitly selected mass/volume basis. Solution mass is never treated as solute mass. Stock concentration and transfer use the observed mass and each stock's own final volume.

Target Mass is calculated automatically in mg as soon as MW, Target Concentration and Target Volume are supplied, before observations or stock preparation inputs. New preparations default to mL for Target Volume; µL and L remain available and saved record units stay unchanged. Units are converted for the calculation and no numeric volume is assumed. A missing target prerequisite has a direct link from its Target Mass cell, and invalid inputs show a specific explanation. No numeric volume is inferred from the chemical name.

Direct weighing Error is `(observed mass − target mass) / target mass × 100%`; volume-based pure liquids use density-derived mass with an explicit label. Stock Target Mass and Stock Weighing Error have been retired. New stock details retain actual mass, individual final solution volume, calculated concentration and calculated transfer in µL; optional observed transfer has one entry point. Existing stocks retain known concentration and availability inputs. Stock Error remains blank, and legacy optional stock-target values cannot block review. Saved raw legacy snapshots remain intact. There are no acceptance thresholds.

Preparation dates display a civil-calendar day number (Jan 1 = Day 1), independent of time zones/DST. Saved record calendar metadata and Excel retain the selected date, year and Day of Year; empty dates have no invented day number. S/IS stock preparation dates follow the same rule.

Cocktail Making keeps the legacy `#sis` link and `sis` record kind, and also accepts `#cocktail`. Navigation, titles and record lists use the new display name. Saved records and their original calculation snapshots remain intact until explicit edits.

Each S and IS stock independently selects **Enter Stock Volume** or **Set Stock Concentration**. One volume/concentration pair switches editable/read-only states; no duplicate result cards are created. Solvent sits next to Stock Final Volume. Volumes use µL, stock concentrations use mM, and Volume Basis is fixed to Final Solution Volume. Legacy units are converted for display; legacy solvent-added records retain an explicit approximation warning until the final-volume workflow is confirmed by editing the final volume or setting a concentration.

With amount n in µmol, C (mM) = n / V (µL) × 1000 and V = n / C × 1000. Mass input supplies n = mass (mg) / MW × 1000. qNMR amount and legacy qNMR concentration/sample-volume sources use the same amount-based engine. Only the selected direction is evaluated. A deliberate mode switch uses raw model calculations and retains equivalent original inputs within floating-point precision, avoiding drift from repeatedly inverting rounded display values. Editable values are not rounded; read-only results show two decimals with full precision available. Concentration-mode volumes are explicitly planned values in the UI and Excel volume basis. Entering an actual final volume recalculates stock concentration, transfer, solvent and per-assay results.

The <3000 µL stock limit, ≥20 µL minimum IS aliquot and existing multi-cocktail coordination/threshold rules remain enforced. When all original IS aliquots already satisfy the minimum and explicit Match Batch Volumes is off, the coordination panel and redundant confirmation are omitted. Minimum/threshold and explicit matching controls remain under **Cocktail volume settings**. Adjustments and explicit matching still require plan confirmation. Results, saved records, reopened records and Excel share the same calculations.

Results display two decimals without rounding stored inputs/results; small nonzero values show `<0.01` with full precision available. Records retain selected inventory snapshots/versions. Existing saved calculations remain intact until explicit recalculation; the scientific rule version remains 1.2.0.

## Sectioned Buffer Excel

One Preparation worksheet contains:

- **A. Preparation Information:** name, preparation Lot, date, target volume/unit, volume basis, optional pH, status.
- **B. Components:** nine columns, one component per row; consolidated supplier/ID/Lot/Barcode, explicit target units, applicable observations and signed Error. No unrelated inventory columns.
- **C. Stock Solutions:** only stocks; each stock's actual mass, individual final volume, amount (mmol), actual concentration and transfer. Existing-stock unknown mass/amount/final volume remain blank.

Notes explain density-derived observations and stock error scope. Numeric calculations stay numeric, with two-decimal display. Tables have borders, restrained fills, wrapping and filters; printing is one page wide with unlimited height and normal 11-point body text. No blank Instruments or procedure sections are added. Excel export and Save Preparation Record remain separate. Legacy JSON import is retained for old records; Excel is not a record-import format. Cocktail Making retains its separate cocktail/batch exports because its per-assay semantics differ from a buffer recipe.

ExcelJS 4.4.0 is MIT licensed; the license is included in `docs/EXCELJS-LICENSE.txt`.
