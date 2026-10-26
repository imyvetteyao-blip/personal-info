import { importInventory, inspectInventoryTable } from "./inventory.mjs";
import { INVENTORY_CONFIG } from "./inventory-config.mjs";
// Browser-only reads. This module contains no fetch, upload, or persistence code.
export async function readLocalInventory(file, config = INVENTORY_CONFIG, Excel = globalThis.ExcelJS) {
  if (file.size === 0) throw new Error("Local inventory file is empty.");
  const table = await importInventory(file, config, Excel);
  if (!table.rows.length) throw new Error("Inventory has no records. An empty inventory cannot be used.");
  const { issues, validIndexes } = inspectInventoryTable(table, config, "local");
  if (!validIndexes.length)
    throw new Error(
      `No usable inventory records. All ${table.rows.length} rows failed validation. ${issues
        .slice(0, 3)
        .map((issue) => `Row ${issue.row}: ${issue.problems.join(" ")}`)
        .join(" ")}`,
    );
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const version =
    "local-" +
    Array.from(new Uint8Array(digest))
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  return {
    ...table,
    rows: validIndexes.map((i) => table.rows[i]),
    rowNumbers: validIndexes.map((i) => table.rowNumbers[i]),
    importReport: { totalRows: table.rows.length, importedRows: validIndexes.length, excludedRows: issues.length, issues },
    sourceType: "local",
    classification: "local",
    demo: false,
    version,
    updatedAt: new Date().toISOString(),
  };
}

export function localInventoryReportText(inventory) {
  const report = inventory.importReport;
  return [
    `File: ${inventory.source}`,
    ...(inventory.worksheet ? [`Worksheet: ${inventory.worksheet}`] : []),
    `Imported ${report.importedRows} of ${report.totalRows} records; ${report.excludedRows} rows excluded.`,
    "Row numbers refer to original worksheet rows or CSV line starts. Blank rows are ignored. Excluded rows are not available for search. No source values were modified.",
    "",
    ...report.issues.map((issue) => `Row ${issue.row}: ${issue.problems.join(" ")}`),
  ].join("\n");
}
