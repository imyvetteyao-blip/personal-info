import { INVENTORY_CONFIG, inventoryMapping, isMeaningful } from "./inventory-config.mjs";
export function parseCSV(text) {
  const input = text.replace(/^\uFEFF/, "");
  const firstLine = input.split(/\r?\n/)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows = [],
    sourceRowNumbers = [];
  let row = [],
    field = "",
    quoted = false,
    line = 1,
    recordLine = 1;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (quoted || field === "") quoted = !quoted;
      else throw new Error("Invalid quote in CSV.");
    } else if (ch === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      sourceRowNumbers.push(recordLine);
      row = [];
      field = "";
      recordLine = ++line;
    } else {
      field += ch;
      if (ch === "\n" || (ch === "\r" && input[i + 1] !== "\n")) line++;
    }
  }
  if (quoted) throw new Error("Unclosed quoted CSV field.");
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
    sourceRowNumbers.push(recordLine);
  }
  // Preserve source line numbers, including blank lines and quoted newlines.
  Object.defineProperty(rows, "sourceRowNumbers", { value: sourceRowNumbers });
  return rows;
}
export function tableFromRows(rows, headerRow = 1) {
  if (!Number.isInteger(headerRow) || headerRow < 1 || headerRow > rows.length) throw new Error("Choose a valid header row.");
  if (rows.length > 50000) throw new Error("Inventory exceeds 50,000 rows.");
  const width = Math.max(...rows.map((r) => r.length));
  if (width > 500 || rows.length > 50000) throw new Error("Inventory exceeds 50,000 rows or 500 columns.");
  const seen = new Map();
  const headers = Array.from({ length: width }, (_, i) => {
    const raw = String(rows[headerRow - 1][i] ?? "").trim() || `Column ${i + 1}`,
      n = (seen.get(raw) || 0) + 1;
    seen.set(raw, n);
    return n === 1 ? raw : `${raw} (${n})`;
  });
  const entries = rows
    .slice(headerRow)
    .map((r, i) => ({
      values: r,
      number: rows.sourceRowNumbers?.[headerRow + i] ?? headerRow + i + 1,
    }))
    .filter(({ values }) => values.some((v) => v != null && (typeof v !== "string" || v.trim() !== "")));
  return {
    headers,
    rows: entries.map(({ values }) => Object.fromEntries(headers.map((h, i) => [h, values[i] ?? ""]))),
    rowNumbers: entries.map(({ number }) => number),
    blankRowCount: rows.length - headerRow - entries.length,
  };
}
export async function readInventoryFile(file, config = INVENTORY_CONFIG, Excel = globalThis.ExcelJS) {
  if (file.size > 10e6) throw new Error("Inventory file exceeds 10 MB.");
  if (/\.(csv|tsv)$/i.test(file.name)) {
    const decoded = decodeCSV(await file.arrayBuffer(), config.csvLegacyEncoding);
    return [{ name: "CSV", rows: parseCSV(decoded.text), encoding: decoded.encoding }];
  }
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Select a CSV, TSV, or XLSX file. Legacy XLS is not supported.");
  if (!Excel) throw new Error("XLSX reader is unavailable. Reload the page or use CSV.");
  const workbook = new Excel.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  return workbook.worksheets.map((sheet) => {
    if (sheet.rowCount > 50000 || sheet.columnCount > 500) throw new Error("Worksheet exceeds 50,000 rows or 500 columns.");
    const rows = [];
    for (let n = 1; n <= sheet.rowCount; n++) {
      const row = [];
      for (let i = 1; i <= sheet.columnCount; i++) {
        const cell = sheet.getRow(n).getCell(i),
          v = cell.value;
        row.push(
          v == null
            ? ""
            : v instanceof Date
              ? v.toISOString()
              : typeof v !== "object"
                ? v
                : v.formula || v.sharedFormula
                  ? (v.result ?? `=${v.formula || v.sharedFormula}`)
                  : v.richText
                    ? v.richText.map((t) => t.text).join("")
                    : (v.text ?? JSON.stringify(v)),
        );
      }
      rows.push(row);
    }
    return { name: sheet.name, rows };
  });
}
export function suggestMapping(headers) {
  return inventoryMapping(headers, INVENTORY_CONFIG, false);
}
export function decodeCSV(buffer, legacyEncoding = INVENTORY_CONFIG.csvLegacyEncoding) {
  const bytes = new Uint8Array(buffer);
  const decode = (encoding) => new TextDecoder(encoding, { fatal: true }).decode(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return { text: decode("utf-16le"), encoding: "UTF-16 LE" };
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return { text: decode("utf-16be"), encoding: "UTF-16 BE" };
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    try {
      return { text: decode("utf-8"), encoding: "UTF-8 BOM" };
    } catch {
      throw new Error("The CSV declares UTF-8 BOM but contains invalid UTF-8 bytes. Re-export the source file.");
    }
  }
  try {
    const text = decode("utf-8");
    if (text.includes("\0")) throw new Error("Unexpected null bytes");
    return { text, encoding: "UTF-8" };
  } catch {
    if (!legacyEncoding) throw new Error("CSV is not valid UTF-8. The source encoding must be declared in inventory-config.mjs.");
    try {
      const text = decode(legacyEncoding);
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/.test(text)) throw new Error("Invalid control character");
      return { text, encoding: legacyEncoding };
    } catch {
      throw new Error(`CSV cannot be decoded as UTF-8 or configured ${legacyEncoding}. Re-export as UTF-8 or confirm the source encoding.`);
    }
  }
}
export async function importInventory(file, config = INVENTORY_CONFIG, Excel = globalThis.ExcelJS) {
  const sheets = await readInventoryFile(file, config, Excel);
  if (/\.(csv|tsv)$/i.test(file.name)) {
    const table = tableFromRows(sheets[0].rows, config.headerRow);
    return {
      ...table,
      mapping: inventoryMapping(table.headers, config),
      source: file.name,
      encoding: sheets[0].encoding,
      demo: false,
    };
  }
  const candidates = [],
    failures = [];
  for (const sheet of sheets) {
    if (config.worksheetName && sheet.name !== config.worksheetName) continue;
    try {
      const table = tableFromRows(sheet.rows, config.headerRow);
      candidates.push({
        ...table,
        mapping: inventoryMapping(table.headers, config),
        source: file.name,
        worksheet: sheet.name,
        demo: false,
      });
    } catch (e) {
      failures.push(`${sheet.name}: ${e.message}`);
    }
  }
  if (candidates.length > 1)
    throw new Error("More than one worksheet matches the inventory template. Set its exact worksheetName in inventory-config.mjs.");
  if (!candidates.length)
    throw new Error(failures.length ? failures.join(" ") : `Required worksheet not found: ${config.worksheetName || "inventory template"}.`);
  return candidates[0];
}
// Search-only normalization; inventory values and component snapshots stay intact.
// Clipboard text from spreadsheets/PDFs can contain hidden characters and line breaks.
export function cleanInventorySearchText(value, { trim = true } = {}) {
  const text = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u00ad\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, "")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s+/g, " ");
  return trim ? text.trim() : text;
}
export function matchingRows(rows, mapping, query) {
  const q = cleanInventorySearchText(query).toLowerCase();
  if (!q) return [];
  return rows.filter((r) =>
    ["name", "cas", "barcode", "id"].some((k) => mapping[k] && cleanInventorySearchText(r[mapping[k]]).toLowerCase().includes(q)),
  );
}

export function inspectInventoryTable(table, config = INVENTORY_CONFIG, classification = "local") {
  const barcodeCounts = new Map(),
    issues = [],
    validIndexes = [];
  for (const row of table.rows) {
    const value = row[table.mapping.barcode];
    if (isMeaningful(value)) {
      const barcode = String(value);
      barcodeCounts.set(barcode, (barcodeCounts.get(barcode) || 0) + 1);
    }
  }
  table.rows.forEach((row, i) => {
    const problems = [],
      name = row[table.mapping.name];
    if (typeof name !== "string" || !isMeaningful(name))
      problems.push(`Chemical Name must be nonempty text (${!isMeaningful(name) ? "missing value" : `found ${typeof name}`}).`);
    if (!isMeaningful(row[table.mapping.barcode])) problems.push("Barcode must not be empty.");
    if (classification === "demo" && !String(row[table.mapping.barcode]).startsWith("DEMO-"))
      problems.push("Demo releases require DEMO- barcodes; private/company inventory cannot be labeled Demo.");
    const barcode = String(row[table.mapping.barcode]);
    // Exclude every conflicting row rather than arbitrarily choosing a supplier/Lot.
    if (barcodeCounts.get(barcode) > 1) problems.push(`duplicate Barcode ${barcode}. All rows sharing this barcode are excluded.`);
    for (const key of ["mw", "density"]) {
      const h = table.mapping[key],
        v = row[h];
      if (h && isMeaningful(v) && (!Number.isFinite(Number(v)) || Number(v) <= 0))
        problems.push(`${config.fields[key].label} must be a positive number or blank.`);
    }
    for (const [key, v] of Object.entries(row))
      if (v != null && (!["string", "number", "boolean"].includes(typeof v) || (typeof v === "number" && !Number.isFinite(v))))
        problems.push(`Invalid value type in ${key}.`);
    if (problems.length) issues.push({ row: table.rowNumbers?.[i] ?? i + config.headerRow + 1, problems });
    else validIndexes.push(i);
  });
  return { issues, validIndexes };
}

export function validateInventoryTable(table, config = INVENTORY_CONFIG, classification = "local") {
  if (!table.rows.length) throw new Error("Inventory has no records. An empty inventory cannot be used.");
  const { issues } = inspectInventoryTable(table, config, classification);
  if (issues.length) throw new Error(`Inventory row ${issues[0].row}: ${issues[0].problems.join(" ")}`);
  return table;
}
