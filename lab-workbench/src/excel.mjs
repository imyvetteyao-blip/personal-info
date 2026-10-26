import { writeBufferPreparation } from "./excel-buffer.mjs";
import { calendarDateInfo } from "./calendar-date.mjs";
import { bufferPresentationResults } from "./buffer-view.mjs";
import { cocktailPresentationResults } from "./cocktail-controls.mjs";
import { RULE_VERSION, massMg, volumeUL, calculateSingle } from "./calculations.mjs";
import { isMeaningful, supplierFields, componentMapping } from "./inventory-config.mjs";
import { excelResultFormat } from "./format.mjs";
const numeric = (v) => {
  if (v == null || String(v).trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const convert = (v, u, fn) => {
  try {
    return fn(v, u);
  } catch {
    return null;
  }
};
const col = (key, header, width = 18, calculated = false, signed = false) => ({
  key,
  header,
  width,
  calculated,
  signed,
});
export function exportStatus(record) {
  return record.status === "Reviewed" &&
    !record.results.errors?.length &&
    (record.kind !== "buffer" || record.inputs.components.every((c) => c.reviewed)) &&
    (record.kind !== "sis" || !cocktailPresentationResults(record.inputs, record.results).coordinationRequired || record.inputs.confirmed)
    ? "Reviewed"
    : "Draft";
}
function sheet(workbook, name, record, columns, rows) {
  const ws = workbook.addWorksheet(name);
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  ws.mergeCells("A1:F1");
  ws.getCell("A1").value = "Lab Preparation Workbench";
  ws.getCell("A1").font = { bold: true, size: 17, color: { argb: "FF173047" } };
  const meta = [
    ["Preparation Name", record.inputs.name || "Untitled preparation"],
    ["Record ID", record.id],
    ["Preparation Date (UTC)", record.createdAt],
    ["Record Status", exportStatus(record)],
    ["Preparation Volume", record.kind === "buffer" ? numeric(record.inputs.volume) : "See Batch Volumes"],
    ["Volume Unit", record.kind === "buffer" ? record.inputs.volumeUnit : "µL"],
    ["Volume Basis", "Final volume includes all stocks and liquid additions; bring to the final volume."],
    ["Rule Version", record.ruleVersion],
    ["Data Classification", record.demo ? "Demo data" : "User preparation"],
  ];
  meta.forEach(([k, v], i) => {
    ws.getCell(i + 2, 1).value = k;
    ws.getCell(i + 2, 1).font = { bold: true };
    ws.getCell(i + 2, 2).value = v ?? null;
    if (i !== 4) ws.mergeCells(i + 2, 2, i + 2, 6);
  });
  const header = 12;
  ws.getRow(header).values = columns.map((c) => c.header);
  ws.getRow(header).height = 62;
  ws.getRow(header).eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF173047" },
    };
    c.alignment = { vertical: "middle", wrapText: true };
  });
  rows.forEach((row, i) => {
    const excelRow = ws.getRow(header + 1 + i);
    excelRow.values = columns.map((c) => row[c.key] ?? null);
    let lines = 2;
    columns.forEach((c, j) => {
      const cell = excelRow.getCell(j + 1),
        value = cell.value;
      cell.alignment = { vertical: "top", wrapText: true };
      if (typeof value === "number") {
        if (c.calculated) {
          cell.numFmt = excelResultFormat(value, c.signed);
          cell.note = `Full precision: ${value}`;
        } else cell.numFmt = "0.###############";
      } else cell.numFmt = "@";
      if (value != null) lines = Math.max(lines, Math.ceil(String(value).length / Math.max(8, c.width - 2)));
    });
    excelRow.height = Math.min(409, lines * 14 + 8);
    if (i % 2 === 1)
      excelRow.eachCell((c) => {
        c.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF1F7F7" },
        };
      });
  });
  ws.views = [{ state: "frozen", ySplit: header, xSplit: 1 }];
  ws.autoFilter = {
    from: { row: header, column: 1 },
    to: { row: Math.max(header, header + rows.length), column: columns.length },
  };
  ws.properties.defaultRowHeight = 20;
  ws.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  if (record.results.errors?.length) {
    const notes = workbook.getWorksheet("Validation") || workbook.addWorksheet("Validation");
    notes.getCell("A1").value = "Draft — missing or invalid preparation inputs";
    notes.getColumn(1).width = 105;
    record.results.errors.forEach((e, i) => {
      notes.getCell(i + 2, 1).value = e;
      notes.getCell(i + 2, 1).alignment = { wrapText: true };
    });
  }
  return ws;
}
export function bufferRows(record) {
  return record.inputs.components.map((c) => {
    const r = record.results.rows?.find((x) => x.id === c.id) || {},
      method = r.method || c.method;
    const direct = method === "direct",
      solution = c.form === "solution",
      supplier = supplierFields(c);
    const measuredMass = direct || solution ? convert(c.actualMass, c.massUnit, massMg) : null;
    const measuredVolume = direct
      ? c.form === "pure-liquid"
        ? convert(c.actualLiquid, c.liquidUnit, volumeUL)
        : null
      : convert(c.actualTransfer, c.transferUnit, volumeUL);
    return {
      name: c.name,
      ...supplier,
      mw: numeric(c.mw),
      density: c.form === "solid" ? null : numeric(c.density),
      target: numeric(c.target),
      targetUnit: c.targetUnit,
      targetMass: r.requiredMg ?? null,
      targetLiquid: r.requiredLiquidUL ?? null,
      observedMass: measuredMass,
      observedVolume: measuredVolume,
      massDeviation: r.massDeviationMg ?? null,
      massError: r.massErrorPercent ?? null,
      massErrorBasis: r.massErrorBasis ?? null,
      stockMass:
        method === "new"
          ? (r.stockActualMassMg ??
            (c.form === "pure-liquid" && c.stockObservationMethod === "volume" ? null : convert(c.actualMass, c.massUnit, massMg)))
          : null,
      stockMeasuredMass: method === "new" ? convert(c.actualMass, c.massUnit, massMg) : null,
      stockMeasuredVolume: method === "new" && c.form === "pure-liquid" ? convert(c.actualLiquid, c.liquidUnit, volumeUL) : null,
      stockMassBasis: r.stockMassBasis ?? null,
      stockObservationMethod: method === "new" ? (c.form === "pure-liquid" && c.stockObservationMethod === "volume" ? "By Volume" : "By Mass") : null,
      stockCalculatedMass: r.stockCalculatedMassMg ?? null,
      stockCalculatedVolume: r.stockCalculatedVolumeUL ?? null,
      stockVolume: method === "new" ? convert(c.stockVolume, c.stockVolumeUnit, volumeUL) : null,
      stockMM: r.stockMM ?? null,
      transfer: r.stockTransferUL ?? (r.transferML == null ? null : r.transferML * 1000),
      actualMM: r.actualMM ?? null,
      observationMethod:
        direct && c.form === "solid"
          ? "By Mass"
          : direct || solution
            ? (c.observationMethod || "volume") === "mass"
              ? "By Mass"
              : "By Volume"
            : null,
      observationBasis: r.actualConcentrationBasis ?? null,
      calculatedMass: r.calculatedMassMg ?? null,
      calculatedVolume: r.calculatedVolumeUL ?? null,
      basisMass: r.basisMassMg ?? null,
      method,
      form: c.form,
      review: c.reviewed && !r.errors?.length ? "Checked" : "Needs recheck",
      inventorySource: c.inventorySource,
      _inventory: c.inventory || {},
      _mapping: c.inventoryMapping || {},
    };
  });
}
export async function createPreparationWorkbook(record, Excel = globalThis.ExcelJS) {
  if (record.kind === "buffer") record = { ...record, results: bufferPresentationResults(record.results) };
  else record = { ...record, results: cocktailPresentationResults(record.inputs, record.results) };
  if (!Excel?.Workbook) throw new Error("Excel export is unavailable. Reload the workbench.");
  const wb = new Excel.Workbook();
  wb.creator = "Lab Preparation Workbench";
  wb.created = new Date();
  wb.modified = new Date();
  wb.description = `Preparation ${record.id}; rules ${record.ruleVersion}; ${exportStatus(record)}`;
  if (record.kind === "buffer") {
    writeBufferPreparation(wb, record, exportStatus(record));
  } else {
    const rows = [];
    for (const c of record.inputs.cocktails) {
      const cr = record.results.cocktails?.find((r) => r.id === c.id) || {};
      ["S", "IS"].forEach((role, i) => {
        const s = c.stocks[role],
          r = cr.rows?.find((r) => r.role === role) || {},
          stock = r.stock || {};
        rows.push({
          cocktail: c.name,
          role,
          name: s.name,
          lot: s.lot,
          date: s.date,
          dayOfYear: calendarDateInfo(s.date)?.label ?? null,
          solvent: s.solvent,
          mw: numeric(s.mw),
          source: s.source,
          mass: s.source === "weight" ? convert(s.mass, s.massUnit, massMg) : null,
          amount: s.source === "qnmr-amount" ? numeric(s.amount) : null,
          amountUnit: s.source === "qnmr-amount" ? s.amountUnit : null,
          qConcentration: s.source === "qnmr-concentration" ? numeric(s.qConcentration) : null,
          qUnit: s.source === "qnmr-concentration" ? s.qUnit : null,
          sampleVolume: s.source === "qnmr-concentration" ? convert(s.sampleVolume, s.sampleUnit, volumeUL) : null,
          prepVolume: stock.prepUL ?? null,
          volumeBasis:
            s.volumeBasis === "solvent"
              ? "Solvent Added — volume approximation"
              : s.volumeMode === "target"
                ? "Final Solution Volume — planned"
                : "Final Solution Volume",
          stockMM: stock.stockMM ?? null,
          target: r.targetUM ?? null,
          massUG: r.massUG ?? null,
          perAssay: r.perAssayUL ?? null,
          transfer: r.transferUL ?? null,
          final: cr.finalUL ?? null,
          assay: cr.assayUL ?? null,
          solventVolume: i === 0 ? (cr.solventUL ?? null) : null,
          review: record.status,
          reason: cr.plan?.reason ?? null,
        });
      });
    }
    sheet(
      wb,
      "Cocktails",
      record,
      [
        col("cocktail", "Cocktail", 24),
        col("role", "Role", 12),
        col("name", "Compound", 36),
        col("lot", "Lot", 22),
        col("date", "Preparation Date", 20),
        col("dayOfYear", "Day of Year", 22),
        col("solvent", "Solvent", 28),
        col("mw", "MW (g/mol)", 18),
        col("source", "Stock Data Source", 24),
        col("mass", "Actual Mass (mg)", 20),
        col("amount", "qNMR Amount", 20),
        col("amountUnit", "qNMR Amount Unit", 20),
        col("qConcentration", "qNMR Concentration", 22),
        col("qUnit", "qNMR Concentration Unit", 22),
        col("sampleVolume", "qNMR Sample Volume (µL)", 24),
        col("prepVolume", "Stock Final Volume (µL)", 24, true),
        col("volumeBasis", "Stock Volume Basis", 36),
        col("stockMM", "Stock Concentration (mM)", 24, true),
        col("target", "Target Concentration in Cocktail (µM)", 28, true),
        col("massUG", "Compound Mass per Assay (µg)", 26, true),
        col("perAssay", "Stock Volume per Assay (µL)", 26, true),
        col("transfer", "Stock Volume to Transfer (µL)", 26, true),
        col("final", "Final Cocktail Volume (µL)", 24, true),
        col("assay", "Cocktail Volume per Assay (µL)", 26, true),
        col("solventVolume", "Solvent Volume to Add (µL)", 24, true),
        col("reason", "Volume Adjustment Reason", 65),
      ],
      rows,
    );
    sheet(
      wb,
      "Batch Volumes",
      record,
      [
        col("name", "Cocktail", 25),
        col("originalVolume", "Original Volume (µL)", 23, true),
        col("proposedVolume", "Proposed Volume (µL)", 23, true),
        col("selectedVolume", "Selected Final Volume (µL)", 25, true),
        col("originalIS", "Original IS Aliquot (µL)", 25, true),
        col("finalIS", "Final IS Aliquot (µL)", 25, true),
        col("reason", "Adjustment Reason", 65),
      ],
      record.inputs.cocktails.map((c) => ({
        name: c.name,
        ...record.results.plan?.find((p) => p.id === c.id),
      })),
    );
  }
  return wb;
}
