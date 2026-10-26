import { massMg, volumeUL, concentrationMM } from "./calculations.mjs";
import { vendorDescription } from "./inventory-view.mjs";
import { formatResult, excelResultFormat } from "./format.mjs";
import { calendarDateInfo } from "./calendar-date.mjs";
const number = (v) => (v == null || String(v).trim() === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const positive = (v) => (number(v) > 0 ? number(v) : null);
const converted = (v, u, fn) => {
  try {
    return fn(v, u);
  } catch {
    return null;
  }
};
function stockMass(c, r) {
  if (r.stockActualMassMg != null) return r.stockActualMassMg;
  if (c.form === "pure-liquid" && c.stockObservationMethod === "volume") {
    const v = converted(c.actualLiquid, c.liquidUnit, volumeUL),
      d = positive(c.density);
    return v != null && d != null ? v * d : null;
  }
  return converted(c.actualMass, c.massUnit, massMg);
}
function observation(c, r) {
  const method = r.method || c.method;
  if (method === "existing") return null;
  if (method === "new") {
    const mass = stockMass(c, r);
    if (mass == null) return null;
    return c.form === "pure-liquid" && c.stockObservationMethod === "volume"
      ? `Stock preparation: ${formatResult(positive(c.actualLiquid))} ${c.liquidUnit}; ${formatResult(mass)} mg calculated from density`
      : `Stock weighing: ${formatResult(positive(c.actualMass))} ${c.massUnit}`;
  }
  if (c.form === "pure-liquid" && (c.observationMethod || "volume") === "volume")
    return positive(c.actualLiquid) == null ? null : `${formatResult(Number(c.actualLiquid))} ${c.liquidUnit} (mass calculated from density)`;
  return positive(c.actualMass) == null ? null : `${formatResult(Number(c.actualMass))} ${c.massUnit}`;
}
export function bufferSectionRows(record) {
  const components = [],
    stocks = [];
  for (const c of record.inputs.components) {
    const r = record.results.rows?.find((x) => x.id === c.id) || {},
      method = r.method || c.method;
    components.push({
      id: c.id,
      cells: [
        c.name,
        vendorDescription(c),
        positive(c.mw),
        positive(c.target) == null ? null : `${c.target} ${c.targetUnit}`,
        c.form === "solid" ? null : positive(c.density),
        r.requiredMg ?? null,
        r.requiredLiquidUL ?? null,
        observation(c, r),
        method === "direct" ? (r.massErrorPercent ?? null) : null,
      ],
    });
    if (method === "new" || method === "existing") {
      const mass = method === "new" ? stockMass(c, r) : null,
        mw = positive(c.mw);
      let concentration = r.stockMM ?? null;
      if (concentration == null && method === "existing")
        try {
          concentration = concentrationMM(c.knownConcentration, c.knownUnit, c.mw);
        } catch {
          /* Missing inputs remain blank. */
        }
      stocks.push({
        id: c.id,
        cells: [
          c.name,
          mw,
          mass,
          method === "new" ? converted(c.stockVolume, c.stockVolumeUnit, volumeUL) : null,
          mass != null && mw != null ? mass / mw : null,
          concentration,
          r.stockTransferUL ?? (r.transferML == null ? null : r.transferML * 1000),
        ],
      });
    }
  }
  return { components, stocks };
}
export function writeBufferPreparation(wb, record, status) {
  const ws = wb.addWorksheet("Preparation"),
    rows = bufferSectionRows(record);
  [31, 43, 14, 23, 17, 20, 23, 40, 17].forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });
  const border = { style: "thin", color: { argb: "FFD1DFE4" } };
  function section(row, text) {
    ws.mergeCells(row, 1, row, 9);
    const c = ws.getCell(row, 1);
    c.value = text;
    c.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF173047" } };
    ws.getRow(row).height = 25;
  }
  ws.mergeCells("A1:I1");
  ws.getCell("A1").value = "Lab Preparation Workbench";
  ws.getCell("A1").font = { bold: true, size: 17 };
  ws.getRow(1).height = 29;
  section(3, "A. Preparation Information");
  const information = [
    ["Preparation Name", record.inputs.name || null],
    ["Preparation Lot", record.inputs.preparationLot || null],
    ["Date", record.inputs.preparationDate || null],
    ["Target Volume", positive(record.inputs.volume)],
    ["Volume Unit", record.inputs.volumeUnit],
    ["Volume Basis", "Final volume includes all stocks and liquids; bring to the final volume."],
    ["Target pH", number(record.inputs.targetPH)],
    ["Record Status", status],
    ["Day of Year", calendarDateInfo(record.inputs.preparationDate)?.dayOfYear ?? null],
  ];
  information.forEach(([label, value], i) => {
    const row = i + 4;
    ws.getCell(row, 1).value = label;
    ws.getCell(row, 1).font = { bold: true };
    ws.mergeCells(row, 2, row, 9);
    ws.getCell(row, 2).value = value;
    ws.getCell(row, 2).alignment = { wrapText: true, vertical: "middle" };
    ws.getRow(row).height = i === 5 ? 29 : 21;
  });
  const dateInfo = calendarDateInfo(record.inputs.preparationDate);
  if (dateInfo) ws.getCell("B12").numFmt = `"Day "0" of ${dateInfo.year}"`;
  ws.getCell("A1").note = `Record ID: ${record.id}\nRule version: ${record.ruleVersion}\n${record.demo ? "Demo data" : "User preparation"}`;
  const compHeader = 14;
  section(compHeader - 1, "B. Components");
  function table(name, header, headers, data, calculated, signed = []) {
    if (data.length)
      ws.addTable({
        name,
        ref: `A${header}`,
        headerRow: true,
        style: { theme: "TableStyleLight9", showRowStripes: true },
        columns: headers.map((name) => ({ name, filterButton: true })),
        rows: data.map((r) => r.cells),
      });
    else ws.getRow(header).values = headers;
    ws.getRow(header).height = 42;
    headers.forEach((_, i) => {
      const c = ws.getCell(header, i + 1);
      c.font = { bold: true, size: 11, color: { argb: "FF173047" } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE1EFEE" } };
      c.alignment = { wrapText: true, vertical: "middle" };
      c.border = { top: border, bottom: border, left: border, right: border };
    });
    data.forEach((r, i) => {
      const row = ws.getRow(header + i + 1);
      let lines = 2;
      headers.forEach((_, j) => {
        const c = row.getCell(j + 1),
          v = c.value;
        c.font = { size: 11 };
        c.alignment = { wrapText: true, vertical: "top" };
        c.border = { top: border, bottom: border, left: border, right: border };
        if (typeof v === "number") {
          c.numFmt = calculated.includes(j) ? excelResultFormat(v, signed.includes(j)) : "0.###############";
          c.note = `Full precision: ${v}`;
        } else c.numFmt = "@";
        if (v != null) lines = Math.max(lines, Math.ceil(String(v).length / Math.max(8, ws.getColumn(j + 1).width - 2)));
      });
      row.height = Math.min(409, lines * 14 + 7);
      const component = record.inputs.components.find((c) => c.id === r.id);
      row.getCell(1).note = `Inventory snapshot version: ${component?.inventoryVersion || "Unversioned snapshot"}`;
      if (name === "Components" && row.getCell(8).value != null)
        row.getCell(8).note =
          `Original recorded mass: ${component?.actualMass || "not recorded"} ${component?.massUnit || ""}\nOriginal recorded volume: ${component?.actualLiquid || "not recorded"} ${component?.liquidUnit || ""}\nOnly the selected observation basis is used; displayed values are rounded, recorded inputs are not.`;
    });
  }
  table(
    "Components",
    compHeader,
    ["Chemical", "Vendor", "MW (g/mol)", "Target Conc.", "Density (g/mL)", "Target Mass (mg)", "Target Volume (µL)", "Observation", "Error (%)"],
    rows.components,
    [5, 6, 8],
    [8],
  );
  let cursor = compHeader + rows.components.length + 2;
  function note(text) {
    ws.mergeCells(cursor, 1, cursor, 9);
    const c = ws.getCell(cursor, 1);
    c.value = text;
    c.alignment = { wrapText: true, vertical: "top" };
    c.font = { size: 10, color: { argb: "FF4F6775" } };
    ws.getRow(cursor).height = Math.max(27, Math.ceil(text.length / 150) * 14 + 7);
    cursor++;
  }
  note(
    "Direct preparations: positive Error means more mass than target; negative means less. Volume-based pure-liquid errors use mass calculated from density. No acceptance threshold is applied.",
  );
  if (rows.stocks.length)
    note(
      "Stock weighing observations refer to stock preparation; stock Error is left blank. Stock concentration and transfer use the actual stock preparation inputs. Existing-stock mass observations remain blank.",
    );
  cursor++;
  section(cursor++, "C. Stock Solutions");
  const stockHeader = cursor;
  if (rows.stocks.length) {
    table(
      "StockSolutions",
      stockHeader,
      [
        "Chemical",
        "MW (g/mol)",
        "Observed Mass (mg)",
        "Stock Final Volume (µL)",
        "Amount (mmol)",
        "Actual Stock Conc. (mM)",
        "Stock Volume to Transfer (µL)",
      ],
      rows.stocks,
      [2, 3, 4, 5, 6],
    );
    cursor += rows.stocks.length + 2;
  } else {
    note("No stock solutions used.");
  }
  if (
    record.inputs.components.some(
      (c) =>
        c.form === "pure-liquid" &&
        c.stockObservationMethod === "volume" &&
        (record.results.rows?.find((r) => r.id === c.id)?.method || c.method) === "new",
    )
  )
    note(
      "For volume-based pure-liquid stock preparation, the stock mass is calculated from observed volume and density; it is not a measured weighing.",
    );
  if (record.demo) note("Demo data — not company inventory.");
  if (record.results.errors?.length) note("Draft — incomplete inputs: " + record.results.errors.join(" "));
  ws.views = [{ state: "frozen", ySplit: compHeader }];
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:I${cursor}`,
    margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
  };
  ws.headerFooter.oddFooter = "Lab Preparation Workbench · &P / &N";
  return ws;
}
