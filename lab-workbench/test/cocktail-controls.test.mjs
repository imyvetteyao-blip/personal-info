import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { calculateSingle, calculateSIS } from "../src/calculations.mjs";
import { blankStock, blankSIS, blankCocktail, makeRecord, saveRecord, readRecords } from "../src/models.mjs";
import { switchStockMode, editableStockNumber, cocktailPresentationResults } from "../src/cocktail-controls.mjs";
import { createPreparationWorkbook, exportStatus } from "../src/excel.mjs";
const near = (a, b) => assert.ok(Math.abs(a - b) <= 1e-12 * Math.max(Math.abs(a), Math.abs(b), 1), `${a} != ${b}`);
const stock = (extra = {}) => ({
  ...blankStock("S"),
  name: "Test compound",
  lot: "TEST-LOT",
  date: "2026-10-26",
  solvent: "Water",
  mw: "555.7",
  mass: "17.6543219876543",
  prepVolume: "1789.12345678901",
  ...extra,
});
const mixed = () => {
  const s = blankSIS(),
    c = blankCocktail();
  s.name = "Mixed stock methods";
  s.cocktails = [c];
  Object.assign(c, { name: "Cocktail A", volume: "600", assayVolume: "30" });
  c.stocks.S = stock({ mw: "500", mass: "5", prepVolume: "1000", target: "100" });
  c.stocks.IS = stock({ role: "IS", source: "qnmr-amount", amount: "1", volumeMode: "target", desiredConcentration: "1", target: "50" });
  return s;
};
test("mass, qNMR amount and legacy qNMR concentration yield equivalent volume/concentration directions", () => {
  for (const source of [
    {},
    { source: "qnmr-amount", amount: ".123456789876543", mw: "" },
    { source: "qnmr-concentration", qConcentration: "23.456789", sampleVolume: "777.123456", mw: "" },
  ]) {
    const manual = stock(source),
      a = calculateSingle(manual),
      target = switchStockMode(manual, "target"),
      b = calculateSingle(target);
    assert.deepEqual(a.errors, []);
    assert.deepEqual(b.errors, []);
    near(a.prepUL, b.prepUL);
    assert.equal(a.stockMM, b.stockMM);
    near(a.amountUmol, b.amountUmol);
    near(b.stockMM, (b.amountUmol / b.prepUL) * 1000);
    near(b.prepUL, (b.amountUmol / b.stockMM) * 1000);
    if (manual.source === "weight") near(a.amountUmol, (Number(manual.mass) / Number(manual.mw)) * 1000);
  }
});
test("repeated direction changes reuse full-precision valid inputs without accumulated drift", () => {
  let current = stock();
  const baseline = calculateSingle(current);
  for (let i = 0; i < 200; i++) {
    current = switchStockMode(current, "target");
    const target = calculateSingle(current);
    assert.equal(target.stockMM, baseline.stockMM);
    near(target.prepUL, baseline.prepUL);
    current = switchStockMode(current, "manual");
    const manual = calculateSingle(current);
    assert.equal(manual.prepUL, baseline.prepUL);
    assert.equal(manual.stockMM, baseline.stockMM);
  }
  assert.notEqual(current.desiredConcentration, baseline.stockMM.toFixed(2));
  const changed = { ...current, mass: "19.87654321" };
  assert.equal(calculateSingle(switchStockMode(changed, "target")).stockMM, calculateSingle(changed).stockMM);
});
test("only the active input direction is validated and legacy units convert to fixed UI units", () => {
  assert.deepEqual(calculateSingle(stock({ desiredConcentration: "invalid" })).errors, []);
  assert.deepEqual(calculateSingle(stock({ volumeMode: "target", desiredConcentration: "20", prepVolume: "invalid" })).errors, []);
  near(Number(editableStockNumber(stock({ prepVolume: "1.23456789", prepUnit: "mL" }), "prepVolume")), 1234.56789);
  near(Number(editableStockNumber(stock({ desiredConcentration: "1234.56789", desiredUnit: "µmol/L" }), "desiredConcentration")), 1.23456789);
  const tiny = switchStockMode(stock({ source: "qnmr-amount", amount: ".000001", prepVolume: "1000" }), "target");
  assert.equal(Number(tiny.desiredConcentration), 0.000001);
});
test("editable stock values preserve decimal text, trailing zeros and exponent input across mode switches", () => {
  for (const value of ["1.", "1.2300", "1789.1234567890100", "1e", "1e3"]) {
    assert.equal(editableStockNumber(stock({ prepVolume: value }), "prepVolume"), value);
    assert.equal(editableStockNumber(stock({ desiredConcentration: value }), "desiredConcentration"), value);
  }
  const manual = stock({ prepVolume: "1789.1234567890100" });
  assert.equal(switchStockMode(switchStockMode(manual, "target"), "manual").prepVolume, manual.prepVolume);
  const target = stock({ volumeMode: "target", desiredConcentration: "1.2300" });
  assert.equal(switchStockMode(switchStockMode(target, "manual"), "target").desiredConcentration, "1.2300");
});
test("mixed independent stock methods feed transfer, solvent and per-assay results without unnecessary coordination", async () => {
  const inputs = mixed(),
    r = calculateSIS(inputs);
  assert.deepEqual(r.errors, []);
  assert.equal(r.coordinationRequired, false);
  assert.equal(inputs.confirmed, false);
  const c = r.cocktails[0];
  near(c.rows[0].transferUL, 6);
  near(c.rows[1].transferUL, 30);
  near(c.solventUL, 564);
  near(c.rows[0].perAssayUL, 0.3);
  near(c.rows[1].perAssayUL, 1.5);
  near(c.rows[0].massUG, 1.5);
  inputs.cocktails[0].stocks.S = switchStockMode(inputs.cocktails[0].stocks.S, "target");
  inputs.cocktails[0].stocks.IS = switchStockMode(inputs.cocktails[0].stocks.IS, "manual");
  const after = calculateSIS(inputs);
  near(after.cocktails[0].solventUL, c.solventUL);
  after.cocktails[0].rows.forEach((row, i) => {
    near(row.transferUL, c.rows[i].transferUL);
    near(row.perAssayUL, c.rows[i].perAssayUL);
  });
  const record = makeRecord("sis", inputs, "Reviewed");
  assert.equal(exportStatus(record), "Reviewed");
  const data = new Map(),
    storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  saveRecord(record, storage);
  assert.deepEqual(readRecords(storage)[0], record);
  const workbook = await createPreparationWorkbook(record, ExcelJS),
    sheet = workbook.getWorksheet("Cocktails");
  const headers = sheet.getRow(12).values,
    volume = headers.indexOf("Stock Final Volume (µL)"),
    concentration = headers.indexOf("Stock Concentration (mM)");
  assert.equal(sheet.getCell(13, volume).value, 1000);
  assert.equal(sheet.getCell(14, concentration).value, 1);
  assert.equal(sheet.getCell("B5").value, "Reviewed");
});
test("an actual volume change updates stock concentration and all downstream values", () => {
  const inputs = mixed(),
    is = inputs.cocktails[0].stocks.IS;
  inputs.cocktails[0].stocks.IS = { ...switchStockMode(is, "manual"), prepVolume: "2000" };
  const r = calculateSIS(inputs);
  near(r.cocktails[0].rows[1].stock.stockMM, 0.5);
  near(r.cocktails[0].rows[1].transferUL, 60);
  near(r.cocktails[0].rows[1].perAssayUL, 3);
  near(r.cocktails[0].solventUL, 534);
  assert.equal(r.coordinationRequired, false);
});
test("strict stock volume and IS minimum boundaries and explicit matching remain enforced", () => {
  const at = calculateSingle(stock({ source: "qnmr-amount", amount: "3", volumeMode: "target", desiredConcentration: "1" }));
  assert.ok(at.errors.some((e) => e.includes("<3000")));
  assert.deepEqual(calculateSingle(stock({ prepVolume: "2999.999999" })).errors, []);
  const inputs = mixed();
  inputs.cocktails[0].stocks.IS.target = "33.333333333333336";
  assert.equal(calculateSIS(inputs).coordinationRequired, false);
  inputs.cocktails[0].stocks.IS.target = "33";
  let r = calculateSIS(inputs);
  assert.equal(r.coordinationRequired, true);
  assert.ok(r.errors.some((e) => e.includes("Confirm the volume plan")));
  inputs.confirmed = true;
  assert.deepEqual(calculateSIS(inputs).errors, []);
  inputs.cocktails[0].stocks.IS.target = "50";
  inputs.match = true;
  r = calculateSIS(inputs);
  assert.equal(r.coordinationRequired, true);
});
test("legacy sufficient-volume snapshots keep their results while obsolete confirmation errors leave the view", () => {
  const inputs = mixed(),
    r = calculateSIS(inputs);
  delete r.coordinationRequired;
  r.errors.push("Confirm the volume plan before generating a reviewed operation sheet.");
  const before = structuredClone(r),
    view = cocktailPresentationResults(inputs, r);
  assert.equal(view.coordinationRequired, false);
  assert.deepEqual(view.errors, []);
  assert.deepEqual(r, before);
  assert.equal(cocktailPresentationResults({ ...inputs, minimum: "" }, r).coordinationRequired, true);
  assert.equal(cocktailPresentationResults(inputs, { ...r, plan: undefined }).coordinationRequired, true);
});
