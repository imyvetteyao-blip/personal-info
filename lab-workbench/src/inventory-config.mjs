// The only place to define the inventory contract. Matching is exact after
// case/spacing normalization, never fuzzy or based on cell contents.
export const INVENTORY_CONFIG = {
  headerRow: 1,
  worksheetName: null, // A unique worksheet must match this exact column contract.
  requiredFields: ["name", "cas", "barcode"],
  csvLegacyEncoding: "windows-1252", // Legacy English Excel "CSV (Comma delimited)".
  fields: {
    location: { label: "Location", aliases: ["Location"] },
    sublocation: { label: "Sub-location", aliases: ["Sub-location", "Sub Location", "Sublocation"] },
    amount: { label: "Amount", aliases: ["Amount", "Quantity"] },
    units: { label: "Units", aliases: ["Units", "Unit"] },
    state: { label: "State", aliases: ["State", "Physical State"] },
    grade: { label: "Grade", aliases: ["Grade"] },
    temperature: { label: "Temperature", aliases: ["Temperature", "Storage Temperature"] },
    name: {
      label: "Chemical Name",
      aliases: ["Chemical Name", "Chemical", "Name", "Compound", "Reagent"],
    },
    cas: { label: "CAS", aliases: ["CAS", "CAS Number", "CAS No.", "CAS #"] },
    barcode: { label: "Barcode", aliases: ["Barcode", "Bar Code"] },
    id: { label: "ID", aliases: ["ID", "Inventory ID", "Chemical ID"] },
    lot: {
      label: "Lot",
      aliases: ["Lot", "Lot Number", "Lot #", "Batch", "Batch Number"],
    },
    vendor: {
      label: "Vendor / Company",
      aliases: ["Vendor / Company", "Vendor", "Company", "Supplier", "Manufacturer"],
    },
    vendorId: {
      label: "Vendor ID",
      aliases: ["Vendor ID", "VendorID", "Catalog Number", "Catalogue Number", "Catalog #", "Product Number"],
    },
    mw: {
      label: "Molecular Weight",
      aliases: ["MW", "Molecular Weight", "MW (g/mol)", "Molecular Weight (g/mol)"],
    },
    density: { label: "Density", aliases: ["Density", "Density (g/mL)"] },
  },
};
export const normalizeHeader = (h) => String(h).trim().replace(/\s+/g, "").toLowerCase();
export function inventoryMapping(headers, config = INVENTORY_CONFIG, requireColumns = true) {
  const mapping = {},
    problems = [];
  for (const [key, field] of Object.entries(config.fields)) {
    const names = new Set(field.aliases.map(normalizeHeader));
    const matches = headers.filter((h) => names.has(normalizeHeader(h)));
    if (matches.length > 1) problems.push(`Ambiguous ${field.label} columns: ${matches.join(", ")}`);
    mapping[key] = matches.length === 1 ? matches[0] : "";
  }
  if (requireColumns)
    for (const key of config.requiredFields) if (!mapping[key]) problems.push(`Missing required column: ${config.fields[key].label}`);
  if (problems.length) throw new Error(problems.join(". ") + ".");
  return mapping;
}
export function isMeaningful(value) {
  if (value == null) return false;
  if (typeof value === "string") return !["", "—", "-"].includes(value.trim());
  return true; // 0 and false are meaningful values.
}
export function componentMapping(component) {
  const row = component.inventory || {},
    provided = component.inventoryMapping || {},
    mapping = {};
  for (const [key, field] of Object.entries(INVENTORY_CONFIG.fields)) {
    if (provided[key] && Object.hasOwn(row, provided[key])) {
      mapping[key] = provided[key];
      continue;
    }
    const names = new Set(field.aliases.map(normalizeHeader)),
      matches = Object.keys(row).filter((h) => names.has(normalizeHeader(h)));
    mapping[key] = matches.length === 1 ? matches[0] : "";
  }
  return mapping;
}
export function supplierFields(component) {
  const mapping = componentMapping(component);
  return Object.fromEntries(
    ["barcode", "cas", "vendor", "vendorId", "lot", "id"].map((k) => [
      k,
      isMeaningful(component.inventory?.[mapping[k]]) ? String(component.inventory[mapping[k]]) : null,
    ]),
  );
}
