import { isMeaningful, componentMapping, supplierFields, INVENTORY_CONFIG, normalizeHeader } from "./inventory-config.mjs";
export const INVENTORY_COLUMNS = [
  ["name", "Chemical Name", 265],
  ["location", "Location", 145],
  ["amount", "Amount", 95],
  ["vendor", "Company", 155],
  ["barcode", "Barcode", 145],
  ["cas", "CAS", 120],
  ["id", "ID", 100],
  ["lot", "Lot Number", 130],
  ["state", "State", 85],
  ["grade", "Grade", 100],
  ["temperature", "Temperature", 115],
].map(([key, label, width]) => ({ key, label, width, identifier: ["barcode", "cas", "id", "lot"].includes(key) }));
export function inventoryValue(row, mapping, key) {
  const get = (k) => row[mapping[k]];
  if (key === "location") return [get("location"), get("sublocation")].filter(isMeaningful).join(" / ");
  if (key === "amount") return [get("amount"), get("units")].filter(isMeaningful).join(" ");
  return isMeaningful(get(key)) ? String(get(key)) : "";
}
const normalize = (k) =>
  String(k)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function summaryFieldVisible(key) {
  const n = normalize(key);
  if (["receiveddate", "datereceived", "generalstorage", "inventorysource"].includes(n) || n.includes("mychem") || n.includes("trgs")) return false;
  return !/^(?:(?:19|20)\d{2}inventory(?:date)?|inventory(?:date)?(?:19|20)\d{2}(?:date)?|dateofinventory(?:19|20)\d{2})$/.test(n);
}
export function summaryEntries(row) {
  return Object.entries(row).filter(([k, v]) => summaryFieldVisible(k) && isMeaningful(v));
}
export function vendorDescription(c) {
  const f = supplierFields(c),
    row = c.inventory || {};
  function ambiguous(key) {
    const names = new Set(INVENTORY_CONFIG.fields[key].aliases.map(normalizeHeader));
    return Object.entries(row)
      .filter(([k, v]) => names.has(normalizeHeader(k)) && isMeaningful(v))
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ");
  }
  return [
    f.vendor || ambiguous("vendor"),
    f.vendorId ? `ID ${f.vendorId}` : ambiguous("vendorId"),
    f.lot ? `Lot ${f.lot}` : null,
    f.barcode ? `Barcode ${f.barcode}` : null,
  ]
    .filter(isMeaningful)
    .join(", ");
}
