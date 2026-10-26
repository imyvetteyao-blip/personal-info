import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, basename } from "node:path";
import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { importInventory } from "../src/inventory.mjs";
import { INVENTORY_CONFIG, isMeaningful } from "../src/inventory-config.mjs";
export const INVENTORY_DIR = fileURLToPath(new URL("./", import.meta.url));
export async function selectInventorySource({ demo = false, source, directory = process.env.LAB_INVENTORY_DIR || INVENTORY_DIR } = {}) {
  if (source) return { path: resolve(source), classification: "private" };
  if (demo) return { path: resolve(directory, "demo.csv"), classification: "demo" };
  const candidates = (await readdir(directory)).filter((n) => /^source\./i.test(n));
  if (candidates.some((n) => !/^source\.(csv|tsv|xlsx)$/i.test(n)))
    throw new Error("Unsupported source file format. Use inventory/source.csv, source.tsv, or source.xlsx.");
  const files = candidates;
  if (files.length > 1) throw new Error("More than one inventory/source file exists. Keep exactly one CSV/TSV/XLSX source.");
  if (files.length && !demo) return { path: resolve(directory, files[0]), classification: "private" };
  return { path: resolve(directory, "demo.csv"), classification: "demo" };
}
export async function convertInventory({ source, classification = "private", updatedAt = new Date().toISOString(), config = INVENTORY_CONFIG } = {}) {
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error("Inventory update timestamp is invalid.");
  const bytes = await readFile(source);
  const file = {
    name: basename(source),
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
  const table = await importInventory(file, config, ExcelJS);
  if (!table.rows.length) throw new Error("Inventory has no records. An empty inventory cannot be released.");
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
  const version = createHash("sha256").update(JSON.stringify({ table, classification, updatedAt })).digest("hex").slice(0, 16);
  const payload = { schema: "lab-inventory", schemaVersion: 1, version, updatedAt, classification, demo: classification === "demo", ...table };
  payload.demo = classification === "demo";
  const data = JSON.stringify(payload);
  const manifest = {
    schema: "lab-inventory-manifest",
    version,
    updatedAt,
    count: table.rows.length,
    file: `inventory.${version}.json`,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
  return { payload, manifest, data };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2),
      source = args.includes("--source") ? args[args.indexOf("--source") + 1] : undefined;
    const selected = await selectInventorySource({ source, demo: args.includes("--demo") });
    const result = await convertInventory({ source: selected.path, classification: selected.classification });
    if (!args.includes("--validate")) {
      const out = new URL("../generated/", import.meta.url);
      await mkdir(out, { recursive: true });
      await writeFile(new URL("inventory.json", out), result.data);
      await writeFile(new URL("inventory-manifest.json", out), JSON.stringify(result.manifest));
    }
    console.log(`Inventory valid: ${result.manifest.count} entries; classification ${selected.classification}; version ${result.manifest.version}.`);
  } catch (e) {
    console.error(`Inventory validation failed: ${e.message}`);
    process.exitCode = 1;
  }
}
