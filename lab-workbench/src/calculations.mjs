export const RULE_VERSION = "1.2.0";
// Relative tolerance only for floating-point comparisons at decision boundaries; results stay unrounded.
export const below = (a, b) => a < b && b - a > 16 * Number.EPSILON * Math.max(Math.abs(a), Math.abs(b), 1);
export const above = (a, b) => below(b, a);
export const RULES = {
  version: RULE_VERSION,
  stockBelowMg: 100,
  minimumISuL: 20,
  thresholdISuL: 100,
  singleStockVolumeLimitUL: 3000,
  volumeBasis: "Final volume includes all stocks and liquids",
};
export function positive(value, label = "Value") {
  if (value === "" || value == null || (typeof value === "string" && !value.trim())) throw new Error(`${label} is required.`);
  if (!["number", "string"].includes(typeof value) || !Number.isFinite(Number(value))) throw new Error(`${label} must be a finite number.`);
  const n = Number(value);
  if (n <= 0) throw new Error(`${label} must be greater than zero.`);
  return n;
}
function finite(n) {
  if (!Number.isFinite(n) || n <= 0) throw new Error("Calculation is outside the supported numeric range.");
  return n;
}
function factor(unit, units) {
  if (!Object.hasOwn(units, unit)) throw new Error(`Unsupported unit: ${unit}.`);
  return units[unit];
}
export const massMg = (v, u) => finite(positive(v, "Mass") * factor(u, { g: 1000, mg: 1, µg: 0.001 }));
export const volumeUL = (v, u) => finite(positive(v, "Volume") * factor(u, { L: 1e6, mL: 1000, µL: 1 }));
export function concentrationMM(v, u, mw) {
  const n = positive(v, "Concentration");
  if (u === "g/L" || u === "mg/mL") return finite((n * 1000) / positive(mw, "Molecular weight"));
  return finite(n * factor(u, { "mol/L": 1000, "mmol/L": 1, "µmol/L": 0.001 }));
}
export function stockFromWeight(mg, mw, ul) {
  return finite((positive(mg, "Mass") / positive(mw, "Molecular weight") / positive(ul, "Preparation volume")) * 1e6);
}
export function stockFromAmount(umol, ul) {
  return finite((positive(umol, "Amount") / positive(ul, "Preparation volume")) * 1000);
}
export function amountFromQNMR(concentration, unit, sampleUL) {
  return finite((concentrationMM(concentration, unit) * positive(sampleUL, "qNMR sample volume")) / 1000);
}
export function requiredBufferMass(targetMM, finalML, mw) {
  return finite((positive(targetMM) * positive(finalML) * positive(mw, "Molecular weight")) / 1000);
}
export const needsStock = (mg) => below(positive(mg), 100);
export function aliquot(targetUM, stockMM, finalUL) {
  return finite((positive(targetUM, "Target concentration") / (positive(stockMM, "Stock concentration") * 1000)) * positive(finalUL, "Final volume"));
}
export function assayMass(targetUM, assayUL, mw) {
  return finite((positive(targetUM) * positive(assayUL) * positive(mw, "Molecular weight")) / 1e6);
}
function attempt(fn) {
  try {
    return fn();
  } catch (e) {
    return { errors: [e.message], warnings: [] };
  }
}
export function calculateSingle(s) {
  return attempt(() => {
    if (!["manual", "target"].includes(s.volumeMode)) throw new Error("Select a supported preparation calculation.");
    if (!["final", "solvent"].includes(s.volumeBasis)) throw new Error("Select Final Solution Volume or Solvent Added.");
    let amount, formula;
    if (s.source === "weight") {
      amount = (massMg(s.mass, s.massUnit) / positive(s.mw, "Molecular weight")) * 1000;
      formula = `Amount (µmol) = ${massMg(s.mass, s.massUnit)} mg / ${s.mw} g/mol × 1000 = ${amount}`;
    } else if (s.source === "qnmr-amount") {
      amount = positive(s.amount, "qNMR amount") * factor(s.amountUnit, { µmol: 1, nmol: 0.001 });
      formula = `qNMR amount = ${amount} µmol (amount, not concentration)`;
    } else if (s.source === "qnmr-concentration") {
      const sampleUL = volumeUL(s.sampleVolume, s.sampleUnit);
      amount = amountFromQNMR(s.qConcentration, s.qUnit, sampleUL);
      formula = `Amount (µmol) = ${concentrationMM(s.qConcentration, s.qUnit)} mM × ${sampleUL} µL / 1000 = ${amount}`;
    } else throw new Error("Select a supported stock data source.");
    // Only the selected direction supplies an input; never feed a rounded result back.
    const desiredMM = s.volumeMode === "target" ? concentrationMM(s.desiredConcentration, s.desiredUnit) : null;
    const prepUL = s.volumeMode === "target" ? finite((amount * 1000) / desiredMM) : volumeUL(s.prepVolume, s.prepUnit);
    const stockMM = s.volumeMode === "target" ? desiredMM : stockFromAmount(amount, prepUL);
    const errors = [],
      warnings = [];
    if (prepUL >= 3000) errors.push("Single-standard preparation volume must be <3000 µL.");
    if (s.volumeBasis === "solvent")
      warnings.push("Volume approximation: concentration uses solvent added as an approximation of final solution volume.");
    if (!s.name?.trim()) errors.push("Compound name is required.");
    if (!s.lot?.trim()) errors.push("Lot is required.");
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(s.date || "") ||
      !Number.isFinite(Date.parse(s.date)) ||
      (Number.isFinite(Date.parse(s.date)) && new Date(s.date).toISOString().slice(0, 10) !== s.date)
    )
      errors.push("Preparation date is required.");
    if (!s.solvent?.trim()) errors.push("Solvent is required.");
    if (s.mw !== "" && s.mw != null) positive(s.mw, "Molecular weight");
    return {
      amountUmol: amount,
      prepUL,
      stockMM,
      errors,
      warnings,
      formulas: [
        formula,
        s.volumeMode === "target"
          ? `Required stock final volume (µL): V = n / C × 1000 = ${amount} µmol / ${stockMM} mM × 1000 = ${prepUL}`
          : `Calculated stock concentration (mM): C = n / V × 1000 = ${amount} µmol / ${prepUL} µL × 1000 = ${stockMM}`,
      ],
    };
  });
}
export function coordinateVolumes(batches, minimum = 20, threshold = 100, match = false) {
  const min = positive(minimum, "Minimum IS aliquot"),
    limit = positive(threshold, "IS scale-up threshold");
  if (min < 20) throw new Error("Minimum IS Aliquot must be ≥20 µL.");
  if (!batches.length) throw new Error("Add at least one cocktail.");
  const rows = batches.map((b) => {
    const original = positive(b.volume, "Original volume"),
      stock = positive(b.stockMM, "IS stock concentration"),
      target = positive(b.targetUM, "IS target concentration");
    return {
      ...b,
      original,
      originalIS: aliquot(target, stock, original),
      minimumVolume: finite((min * stock * 1000) / target),
    };
  });
  const same = rows.every((r) => r.original === rows[0].original);
  const deficient = rows.some((r) => below(r.originalIS, min));
  const common = Math.max(...rows.map((r) => Math.max(r.original, r.minimumVolume)));
  return rows.map((r) => {
    let selected = r.original,
      reason = "Original volume retained: minimum IS aliquot already satisfied.";
    const proposed = (same && deficient) || match ? common : r.original;
    const proposedIS = aliquot(r.targetUM, r.stockMM, proposed);
    if (!same && !match) reason = "Different original volumes: use Match Batch Volumes to preview an explicit plan.";
    else if ((same && deficient) || match) {
      if (!above(proposedIS, limit)) {
        selected = proposed;
        reason =
          selected === r.original ? "Original volume already matches the common volume." : "Common volume adopted to meet the minimum IS aliquot.";
      } else if (!below(r.originalIS, min)) reason = `Original volume retained: scaled IS aliquot would exceed ${limit} µL.`;
      else {
        selected = Math.max(r.original, r.minimumVolume);
        reason = "Scaled to the minimum required volume to satisfy the IS minimum.";
      }
    }
    return {
      id: r.id,
      originalVolume: r.original,
      proposedVolume: proposed,
      selectedVolume: selected,
      originalIS: r.originalIS,
      finalIS: aliquot(r.targetUM, r.stockMM, selected),
      reason,
    };
  });
}
export function calculateCocktail(c, selectedVolume) {
  return attempt(() => {
    const finalUL = positive(selectedVolume, "Final cocktail volume"),
      assayUL = volumeUL(c.assayVolume, c.assayUnit),
      errors = [],
      warnings = [],
      rows = [];
    if (assayUL > finalUL) errors.push("Cocktail volume per assay exceeds the final cocktail volume.");
    for (const role of ["S", "IS"]) {
      const s = c.stocks[role],
        stock = calculateSingle(s);
      errors.push(...stock.errors.map((e) => `${role}: ${e}`));
      warnings.push(...stock.warnings.map((e) => `${role}: ${e}`));
      const targetUM = concentrationMM(s.target, s.targetUnit) * 1000;
      if (!stock.stockMM) {
        rows.push({ role, name: s.name, stock, targetUM });
        continue;
      }
      const transferUL = aliquot(targetUM, stock.stockMM, finalUL),
        perAssayUL = aliquot(targetUM, stock.stockMM, assayUL);
      const massUG = s.mw === "" || s.mw == null ? null : assayMass(targetUM, assayUL, s.mw);
      if (above(transferUL, stock.prepUL)) errors.push(`${role}: required stock transfer exceeds Stock Final Volume (${stock.prepUL} µL).`);
      rows.push({
        role,
        name: s.name,
        stock,
        targetUM,
        transferUL,
        perAssayUL,
        massUG,
        formulas: [
          `Stock volume per assay = ${targetUM} µM / (${stock.stockMM} mM × 1000) × ${assayUL} µL = ${perAssayUL} µL`,
          `Stock volume to transfer = ${targetUM} µM / (${stock.stockMM} mM × 1000) × ${finalUL} µL = ${transferUL} µL`,
          massUG == null
            ? "Compound mass per assay: Missing MW."
            : `Compound mass per assay = ${targetUM} µM × ${assayUL} µL × ${s.mw} g/mol / 1000000 = ${massUG} µg`,
        ],
      });
    }
    const complete = rows.every((r) => r.transferUL != null);
    const solventUL = complete ? finalUL - rows.reduce((sum, r) => sum + r.transferUL, 0) : null;
    if (solventUL != null && below(solventUL, 0)) errors.push("Stock transfer volumes exceed final cocktail volume. Solvent volume is negative.");
    return {
      finalUL,
      assayUL,
      rows,
      solventUL,
      errors,
      warnings,
      formulas: solventUL == null ? [] : [`Solvent volume = ${finalUL} − (${rows.map((r) => r.transferUL).join(" + ")}) = ${solventUL} µL`],
    };
  });
}
function namedVolume(value, unit, label) {
  positive(value, label);
  return volumeUL(value, unit);
}
function namedMass(value, unit, label) {
  positive(value, label);
  return massMg(value, unit);
}
const supplied = (value) => value != null && String(value).trim() !== "";
function optionalMeasurement(value, unit, convert) {
  if (!supplied(value)) return null;
  try {
    return convert(value, unit);
  } catch {
    return null;
  }
}
export function massError(observedMg, targetMg) {
  positive(targetMg, "Target mass");
  positive(observedMg, "Observed mass");
  const deviationMg = observedMg - targetMg;
  const errorPercent = (deviationMg / targetMg) * 100;
  if (!Number.isFinite(errorPercent)) throw new Error("Mass error is outside the supported numeric range.");
  return { deviationMg, errorPercent };
}
export function calculateBufferComponent(c, volume, unit) {
  return attempt(() => {
    const mw = positive(c.mw, "Molecular weight");
    const finalML = namedVolume(volume, unit, "Final buffer volume") / 1000;
    const targetMM = concentrationMM(c.target, c.targetUnit, mw);
    const requiredMg = requiredBufferMass(targetMM, finalML, mw);
    const errors = [],
      warnings = [],
      formulas = [`Target mass (mg) = ${targetMM} mM × ${finalML} mL × ${mw} g/mol / 1000 = ${requiredMg}`];
    const forcedStock = needsStock(requiredMg);
    const method = c.form === "solution" ? "existing" : forcedStock && c.method === "direct" ? "new" : c.method;
    const observationMethod =
      c.form === "solid"
        ? "mass"
        : method === "new" && c.form === "pure-liquid"
          ? c.stockObservationMethod || "mass"
          : c.observationMethod || "volume";
    const r = {
      requiredMg,
      forcedStock,
      method,
      targetMM,
      stockTargetMassMg: null,
      stockMassDeviationMg: null,
      stockMassErrorPercent: null,
      stockMM: null,
      transferML: null,
      stockTransferUL: null,
      actualMM: null,
      liquidML: null,
      requiredLiquidUL: null,
      observedMassMg: null,
      observedVolumeUL: null,
      calculatedMassMg: null,
      calculatedVolumeUL: null,
      basisMassMg: null,
      stockActualMassMg: null,
      stockFinalVolumeUL: null,
      massDeviationMg: null,
      massErrorPercent: null,
      observationMethod,
      massErrorBasis: null,
      actualConcentrationBasis: null,
      errors,
      warnings,
      formulas,
    };
    if (!["solid", "pure-liquid", "solution"].includes(c.form)) {
      errors.push("Physical form is required; do not infer it from the compound name.");
      return r;
    }
    let density = null;
    if (c.form === "pure-liquid") {
      try {
        density = positive(c.density, "Pure-liquid density (g/mL)");
        r.requiredLiquidUL = finite(requiredMg / density);
        formulas.push(`Target liquid volume (µL) = ${requiredMg} mg / ${density} g/mL = ${r.requiredLiquidUL}`);
      } catch (e) {
        errors.push(e.message);
      }
    }
    try {
      if (method === "direct") {
        if (!["mass", "volume"].includes(observationMethod)) throw new Error("Select By Mass or By Volume for Observation Method.");
        r.observedMassMg = optionalMeasurement(c.actualMass, c.massUnit, massMg);
        if (c.form === "pure-liquid") r.observedVolumeUL = optionalMeasurement(c.actualLiquid, c.liquidUnit, volumeUL);
        if (observationMethod === "mass") {
          r.observedMassMg = namedMass(c.actualMass, c.massUnit, "Observed mass");
          r.basisMassMg = r.observedMassMg;
          r.actualConcentrationBasis = "Measured mass";
          r.massErrorBasis = "Measured mass";
          if (c.form === "pure-liquid" && density) {
            r.calculatedVolumeUL = finite(r.basisMassMg / density);
            r.liquidML = r.calculatedVolumeUL / 1000;
          } else if (c.form === "solid") r.liquidML = 0;
        } else {
          r.observedVolumeUL = namedVolume(c.actualLiquid, c.liquidUnit, "Observed pure-liquid volume");
          if (!density) return r;
          r.calculatedMassMg = finite(r.observedVolumeUL * density);
          r.basisMassMg = r.calculatedMassMg;
          r.liquidML = r.observedVolumeUL / 1000;
          r.actualConcentrationBasis = "Calculated from observed volume";
          r.massErrorBasis = "Calculated from observed volume";
          formulas.push(`Mass (mg) = ${r.observedVolumeUL} µL × ${density} g/mL = ${r.calculatedMassMg}`);
        }
        r.actualMM = finite((r.basisMassMg * 1000) / (mw * finalML));
        const deviation = massError(r.basisMassMg, requiredMg);
        r.massDeviationMg = deviation.deviationMg;
        r.massErrorPercent = deviation.errorPercent;
        formulas.push(
          `Actual final concentration (mM) = ${r.basisMassMg} mg × 1000 / (${mw} × ${finalML} mL) = ${r.actualMM}`,
          `Mass deviation (mg) = ${r.basisMassMg} − ${requiredMg} = ${r.massDeviationMg}`,
          `Mass error (%) = (${r.basisMassMg} − ${requiredMg}) / ${requiredMg} × 100 = ${r.massErrorPercent}`,
        );
      } else {
        let availableUL = null;
        if (method === "new") {
          r.stockMeasuredMassMg = optionalMeasurement(c.actualMass, c.massUnit, massMg);
          if (c.form === "pure-liquid") r.stockMeasuredVolumeUL = optionalMeasurement(c.actualLiquid, c.liquidUnit, volumeUL);
          if (c.form === "pure-liquid" && observationMethod === "volume") {
            const observed = namedVolume(c.actualLiquid, c.liquidUnit, "Observed pure-liquid volume for stock preparation");
            if (!density) return r;
            r.stockActualMassMg = finite(observed * density);
            r.stockCalculatedMassMg = r.stockActualMassMg;
            r.stockMassBasis = "Calculated from observed pure-liquid volume and density";
            formulas.push(`Stock compound mass (mg) = ${observed} µL × ${density} g/mL = ${r.stockActualMassMg}`);
          } else {
            if (c.form === "pure-liquid" && observationMethod !== "mass")
              throw new Error("Select By Mass or By Volume for stock Observation Method.");
            r.stockActualMassMg = namedMass(c.actualMass, c.massUnit, "Stock actual mass");
            r.stockMassBasis = "Measured mass";
            if (c.form === "pure-liquid" && density) r.stockCalculatedVolumeUL = finite(r.stockActualMassMg / density);
          }
          r.stockFinalVolumeUL = namedVolume(c.stockVolume, c.stockVolumeUnit, "Stock final solution volume");
          r.stockMM = stockFromWeight(r.stockActualMassMg, mw, r.stockFinalVolumeUL);
          availableUL = r.stockFinalVolumeUL;
          formulas.push(`Stock concentration (mM) = ${r.stockActualMassMg} mg × 1000000 / (${mw} × ${r.stockFinalVolumeUL} µL) = ${r.stockMM}`);
        } else if (method === "existing") {
          positive(c.knownConcentration, "Known stock concentration");
          r.stockMM = concentrationMM(c.knownConcentration, c.knownUnit, mw);
          if (!c.confirmed) errors.push("Confirm the existing stock concentration.");
          // Availability is independent of concentration and transfer calculation.
          try {
            availableUL = namedVolume(c.available, c.availableUnit, "Available existing stock volume");
          } catch (e) {
            errors.push(e.message);
          }
          formulas.push(`Known stock concentration = ${r.stockMM} mM`);
        } else throw new Error("Select a preparation method.");
        r.transferML = finite((targetMM / r.stockMM) * finalML);
        r.stockTransferUL = finite(r.transferML * 1000);
        if (above(r.transferML, finalML)) errors.push("Stock transfer volume exceeds final buffer volume.");
        if (availableUL != null && above(r.stockTransferUL, availableUL)) errors.push("Required stock volume exceeds available volume.");
        formulas.push(`Stock transfer volume (µL) = ${targetMM} / ${r.stockMM} × ${finalML} mL × 1000 = ${r.stockTransferUL}`);
        r.liquidML = r.transferML;
        if (c.form === "solution") {
          r.requiredLiquidUL = r.stockTransferUL;
          r.observedMassMg = optionalMeasurement(c.actualMass, c.massUnit, massMg);
          r.observedVolumeUL = optionalMeasurement(c.actualTransfer, c.transferUnit, volumeUL);
          if (observationMethod === "mass") {
            const solutionDensity = positive(c.density, "Solution density (g/mL) for By Mass");
            r.observedMassMg = namedMass(c.actualMass, c.massUnit, "Observed solution mass");
            r.calculatedVolumeUL = finite(r.observedMassMg / solutionDensity);
            r.liquidML = r.calculatedVolumeUL / 1000;
            r.actualConcentrationBasis = "Known solution concentration × volume calculated from measured solution mass and solution density";
            formulas.push(
              `Solution volume (µL) = ${r.observedMassMg} mg / ${solutionDensity} g/mL = ${r.calculatedVolumeUL}; solution mass is not solute mass.`,
            );
          } else if (observationMethod !== "volume") throw new Error("Select By Mass or By Volume for Observation Method.");
          else if (supplied(c.actualTransfer)) {
            r.observedVolumeUL = namedVolume(c.actualTransfer, c.transferUnit, "Observed stock transfer volume");
            r.liquidML = r.observedVolumeUL / 1000;
            r.actualConcentrationBasis = "Known solution concentration and measured volume";
          }
        } else if (supplied(c.actualTransfer)) {
          r.observedVolumeUL = namedVolume(c.actualTransfer, c.transferUnit, "Observed stock transfer volume");
          r.liquidML = r.observedVolumeUL / 1000;
          r.actualConcentrationBasis = "Stock concentration and measured transfer volume";
        }
        // Actual concentration is an observed result, never fabricated from a planned transfer.
        if (r.actualConcentrationBasis) {
          if (availableUL != null && above(r.liquidML * 1000, availableUL)) errors.push("Observed transfer exceeds available stock volume.");
          r.actualMM = finite((r.stockMM * r.liquidML) / finalML);
          formulas.push(`Actual final concentration (mM) = ${r.stockMM} × ${r.liquidML} / ${finalML} = ${r.actualMM}`);
        }
      }
    } catch (e) {
      errors.push(e.message);
    }
    if (r.liquidML != null && above(r.liquidML, finalML)) errors.push("Liquid additions exceed final buffer volume.");
    return r;
  });
}
export function calculateBuffer(b) {
  const errors = [],
    rows = b.components.map((c) => ({
      id: c.id,
      ...calculateBufferComponent(c, b.volume, b.volumeUnit),
    }));
  if (!b.name?.trim()) errors.push("Preparation name is required.");
  if (b.targetPH != null && String(b.targetPH).trim() !== "" && !Number.isFinite(Number(b.targetPH)))
    errors.push("Target pH must be a finite number.");
  if (!rows.length) errors.push("Add at least one inventory component.");
  try {
    positive(b.volume, "Final buffer volume");
    volumeUL(b.volume, b.volumeUnit);
  } catch (e) {
    errors.push(e.message);
  }
  rows.forEach((r, i) => errors.push(...r.errors.map((e) => `Component ${i + 1}: ${e}`)));
  const liquidML = rows.every((r) => r.liquidML != null) ? rows.reduce((a, r) => a + r.liquidML, 0) : null;
  try {
    if (liquidML != null && liquidML > volumeUL(b.volume, b.volumeUnit) / 1000) errors.push("Combined liquid additions exceed final buffer volume.");
  } catch {
    /* Volume error is reported above. */
  }
  return { rows, liquidML, errors, warnings: [], rules: RULES };
}
function validPositiveOrNull(value) {
  try {
    return positive(value);
  } catch {
    return null;
  }
}
export function needsCocktailCoordination(s, plan) {
  if (!Array.isArray(plan) || !plan.length || plan.length !== s.cocktails.length) return true;
  const minimum = Number(s.minimum);
  if (!Number.isFinite(minimum) || minimum < 20) return true;
  return !!s.match || plan.some((row) => !Number.isFinite(row?.originalIS) || below(row.originalIS, minimum));
}
export function calculateSIS(s) {
  const errors = [],
    warnings = [];
  if (!s.name?.trim()) errors.push("Preparation name is required.");
  let plan = [];
  try {
    plan = coordinateVolumes(
      s.cocktails.map((c) => ({
        id: c.id,
        volume: volumeUL(c.volume, c.volumeUnit),
        stockMM: calculateSingle(c.stocks.IS).stockMM,
        targetUM: concentrationMM(c.stocks.IS.target, c.stocks.IS.targetUnit) * 1000,
      })),
      s.minimum,
      s.threshold,
      s.match,
    );
  } catch (e) {
    errors.push(e.message);
  }
  const cocktails = s.cocktails.map((c) => {
    const p = plan.find((r) => r.id === c.id);
    const result = calculateCocktail(c, p?.selectedVolume);
    if (!c.name?.trim()) errors.push("Cocktail name is required.");
    errors.push(...result.errors.map((e) => `${c.name || "Cocktail"}: ${e}`));
    if (p && below(p.finalIS, Number(s.minimum))) errors.push(`${c.name}: IS aliquot is below ${s.minimum} µL.`);
    return { id: c.id, name: c.name, plan: p, ...result };
  });
  if (plan.length && new Set(plan.map((p) => p.selectedVolume)).size > 1)
    warnings.push("Different final volumes: follow the selected final volume for each cocktail.");
  const coordinationRequired = needsCocktailCoordination(s, plan);
  if (coordinationRequired && !s.confirmed) errors.push("Confirm the volume plan before generating a reviewed operation sheet.");
  return {
    cocktails,
    plan,
    coordinationRequired,
    errors,
    warnings,
    rules: {
      ...RULES,
      minimumISuL: validPositiveOrNull(s.minimum),
      thresholdISuL: validPositiveOrNull(s.threshold),
    },
  };
}
