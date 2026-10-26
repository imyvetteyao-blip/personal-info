# Developer-maintained inventory

The public site currently uses **Demo inventory only**, as requested. There is no inventory upload, mapping, editing, replacement, or administrator interface for ordinary users.

## Public Demo update: replace → validate/build → publish

1. Replace `inventory/demo.csv` with the updated Demo dataset, preserving the fixed header contract and `DEMO-` barcodes. CSV is supported; developer conversion also supports XLSX/TSV.
2. From `lab-workbench`, run:

   ```sh
   npm run inventory:validate -- --demo
   npm test
   npm run build -- --demo
   LAB_CHROMIUM_PATH=/usr/bin/chromium npm run test:browser
   ```

3. Commit the source and the complete generated `docs/` release, then push main. GitHub Pages serves main:/docs. Do not publish an old artifact after a failed build.

`npm run build` automatically validates and converts before writing any public output. No extra conversion step is required. `npm run inventory:convert` is available to inspect structured output in the ignored `generated/` directory.

## Confidential source location and publication guard

The reserved real-source locations are **`inventory/source.csv`**, **`inventory/source.tsv`**, or **`inventory/source.xlsx`**. Keep exactly one. These paths are Git-ignored, as are generated intermediates. An external path can be validated without copying it into the repository:

```sh
npm run inventory:validate -- --source /path/to/confidential-inventory.xlsx
```

A real `source.*` is classified as private. **The normal public build refuses it before writing output.** `npm run build -- --demo` explicitly selects only the Demo source even when a private source is present. Demo builds reject non-DEMO barcodes. These checks prevent accidental publication; they do not make a public repository or website private.

Do not upload company inventory through GitHub's web uploader, force-add ignored sources, or commit generated confidential files. The current personal GitHub Pages site has **no authentication or access restrictions**. Its JSON data, website files, and public Git history can be downloaded. A private Git repository also does not automatically make a Pages site private. Confidential live inventory requires an access-controlled hosting design and must not be added to this public release.

## Fixed source contract

`src/inventory-config.mjs` centralizes the header row, exact worksheet name (optional), aliases and encoding. Current required headers are Chemical Name, CAS, Barcode; MW and Density are optional. The default header row is 1. With no exact worksheet name configured, exactly one sheet must match all required columns; multiple matches fail. Name and Barcode values must be nonempty, barcodes unique, and any supplied MW/Density positive numeric values. Missing optional values remain missing.

UTF-8, UTF-8 BOM and BOM-declared UTF-16 are decoded strictly. The configured legacy English Excel CSV decoder is Windows-1252. Set the actual source encoding in the central configuration when another legacy format is used. There is no blanket character replacement. Incorrect headers, invalid records, malformed encodings, unsupported formats and empty inventories stop conversion with specific errors.

## Versioning, refresh and records

Each build generates a version identifier and UTC update time. `docs/inventory-manifest.json` identifies the matching `inventory.<version>.json` and its SHA-256 checksum. The browser fetches the manifest with `cache: no-store` and a refresh query, then loads that exact versioned file and checks its metadata/checksum. Old browser-uploaded inventory is never read or allowed to override it. A load failure is an explicit error with Retry loading, not zero search results.

Each selected component stores its full inventory row, version and update time. Existing selections and saved preparations do not consult current inventory to change supplier, Lot, Barcode, or other snapshot fields. An updated release affects new searches/selections only. Removed old generated data files are not needed to reopen saved snapshots. Data already committed to a public Git history is not made secret by deleting a later JSON file.
