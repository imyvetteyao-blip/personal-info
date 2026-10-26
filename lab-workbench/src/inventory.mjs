import { INVENTORY_CONFIG, inventoryMapping, isMeaningful } from "./inventory-config.mjs";
export function parseCSV(text) {
  const input = text.replace(/^\uFEFF/, "");
  const firstLine = input.split(/\r?\n/)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const rows = [];
  let row = [],
    field = "",
    quoted = false;
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
      row = [];
      field = "";
    } else field += ch;
  }
  if (quoted) throw new Error("Unclosed quoted CSV field.");
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => String(c).trim()));
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
  return {
    headers,
    rows: rows
      .slice(headerRow)
      .filter((r) => r.some((v) => v !== "" && v != null))
      .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""]))),
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
export function matchingRows(rows, mapping, query) {
  const q = query.toLocaleLowerCase().trim();
  if (!q) return [];
  return rows.filter((r) =>
    ["name", "cas", "barcode", "id"].some(
      (k) =>
        mapping[k] &&
        String(r[mapping[k]] ?? "")
          .toLocaleLowerCase()
          .includes(q),
    ),
  );
}

export function validateInventoryTable(table, config = INVENTORY_CONFIG, classification = "local") {
  if (!table.rows.length) throw new Error("Inventory has no records. An empty inventory cannot be used.");
  const seen = new Set();
  table.rows.forEach((row, i) => {
    const label = `Inventory row ${i + config.headerRow + 1}`;
    if (typeof row[table.mapping.name] !== "string" || !row[table.mapping.name].trim())
      throw new Error(`${label}: Chemical Name must be nonempty text.`);
    for (const key of ["name", "barcode"])
      if (!isMeaningful(row[table.mapping[key]])) throw new Error(`${label}: ${config.fields[key].label} must not be empty.`);
    if (classification === "demo" && !String(row[table.mapping.barcode]).startsWith("DEMO-"))
      throw new Error(`${label}: Demo releases require DEMO- barcodes; private/company inventory cannot be labeled Demo.`);
    const barcode = String(row[table.mapping.barcode]);
    if (seen.has(barcode)) throw new Error(`${label}: duplicate Barcode ${barcode}.`);
    seen.add(barcode);
    for (const key of ["mw", "density"]) {
      const h = table.mapping[key],
        v = row[h];
      if (h && isMeaningful(v) && (!Number.isFinite(Number(v)) || Number(v) <= 0))
        throw new Error(`${label}: ${config.fields[key].label} must be a positive number or blank.`);
    }
    for (const [key, v] of Object.entries(row))
      if (v != null && (!["string", "number", "boolean"].includes(typeof v) || (typeof v === "number" && !Number.isFinite(v))))
        throw new Error(`${label}: invalid value type in ${key}.`);
  });
  return table;
}
