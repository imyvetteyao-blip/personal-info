import { importInventory, validateInventoryTable } from "./inventory.mjs";
import { INVENTORY_CONFIG } from "./inventory-config.mjs";
// Browser-only reads. This module contains no fetch, upload, or persistence code.
export async function readLocalInventory(file, config = INVENTORY_CONFIG, Excel = globalThis.ExcelJS) {
  if (file.size === 0) throw new Error("Local inventory file is empty.");
  const table = await importInventory(file, config, Excel);
  validateInventoryTable(table, config, "local");
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  const version =
    "local-" +
    Array.from(new Uint8Array(digest))
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, 16);
  return { ...table, sourceType: "local", classification: "local", demo: false, version, updatedAt: new Date().toISOString() };
}
