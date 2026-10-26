import { calculateSingle, calculateSIS, volumeUL, concentrationMM, needsCocktailCoordination } from "./calculations.mjs";

const close = (a, b) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= 16 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b));
export function editableStockNumber(stock, field) {
  const value = stock[field];
  if (value == null || String(value).trim() === "") return "";
  const nativeUnit = field === "prepVolume" ? "µL" : "mmol/L";
  const unit = field === "prepVolume" ? stock.prepUnit : stock.desiredUnit;
  if (unit === nativeUnit) return String(value); // Preserve decimal points, trailing zeros and in-progress edits.
  try {
    return String(field === "prepVolume" ? volumeUL(value, stock.prepUnit) : concentrationMM(value, stock.desiredUnit));
  } catch {
    return String(value); // Keep invalid user input available for correction.
  }
}
export function switchStockMode(stock, mode) {
  if (!["manual", "target"].includes(mode)) throw new Error("Select a supported stock calculation method.");
  const result = calculateSingle(stock),
    next = { ...stock, volumeMode: mode };
  const field = mode === "manual" ? "prepVolume" : "desiredConcentration";
  const computed = mode === "manual" ? result.prepUL : result.stockMM;
  if (Number.isFinite(computed) && computed > 0) {
    const previous = editableStockNumber(stock, field);
    // Reuse an equivalent original input to prevent accumulating inverse-operation
    // floating-point drift over repeated toggles. No displayed string is read.
    next[field] = close(Number(previous), computed) ? previous : String(computed);
    next[mode === "manual" ? "prepUnit" : "desiredUnit"] = mode === "manual" ? "µL" : "mmol/L";
  }
  if (stock.volumeBasis !== "solvent" || mode === "target") next.volumeBasis = "final";
  return next;
}
export function cocktailPresentationResults(inputs, results) {
  // Archived records retain their original fields/snapshots. Re-evaluate their
  // current view so removed availability inputs and cached errors cannot apply.
  if (
    inputs.cocktails.some((c) =>
      ["S", "IS"].some((role) => Object.hasOwn(c.stocks[role], "available") || Object.hasOwn(c.stocks[role], "availableUnit")),
    )
  ) {
    results = calculateSIS(inputs);
  }
  const coordinationRequired = needsCocktailCoordination(inputs, results.plan);
  return {
    ...results,
    coordinationRequired,
    errors: (results.errors || []).filter(
      (message) => coordinationRequired || message !== "Confirm the volume plan before generating a reviewed operation sheet.",
    ),
  };
}
