import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { blankStock, blankSIS, blankCocktail, makeRecord, saveRecord, readRecords } from "../src/models.mjs";
import { calculateSingle, calculateSIS, calculateCocktail } from "../src/calculations.mjs";
import { cocktailPresentationResults } from "../src/cocktail-controls.mjs";
import { createPreparationWorkbook } from "../src/excel.mjs";
const stock = (extra = {}) => ({
  ...blankStock("S"),
  name: "Test stock",
  lot: "TEST-LOT",
  date: "2026-10-26",
  solvent: "Water",
  source: "qnmr-amount",
  amount: "2",
  mw: "500",
  prepVolume: "2000",
  target: "100",
  ...extra,
});
const recipe = () => {
  const inputs = blankSIS(),
    c = blankCocktail();
  inputs.name = "Folded cocktail";
  inputs.cocktails = [c];
  Object.assign(c, { name: "A", volume: "600", assayVolume: "30", stocks: { S: stock(), IS: stock({ role: "IS" }) } });
  return inputs;
};
test("2 µmol drives only the selected direction, with one formula and independent cocktail targets", () => {
  const target = calculateSingle(stock({ volumeMode: "target", desiredConcentration: "2", prepVolume: "invalid" }));
  assert.equal(target.prepUL, 1000);
  assert.equal(target.stockMM, 2);
  assert.deepEqual(target.errors, []);
  assert.equal(target.formulas.length, 2);
  assert.match(target.formulas[1], /V = n \/ C × 1000/);
  assert.ok(!target.formulas.join(" ").includes("C = n / V"));
  const manual = calculateSingle(stock({ prepVolume: "4000", desiredConcentration: "invalid" }));
  assert.equal(manual.stockMM, 0.5);
  assert.equal(manual.prepUL, 4000);
  assert.deepEqual(manual.errors, ["Single-standard preparation volume must be <3000 µL."]);
  assert.equal(manual.formulas.length, 2);
  assert.match(manual.formulas[1], /C = n \/ V × 1000/);
  assert.ok(!manual.formulas.join(" ").includes("V = n / C"));
  for (const value of ["", "invalid", "999"]) {
    const r = calculateSingle(stock({ target: value, volumeMode: "target", desiredConcentration: "2" }));
    assert.equal(r.prepUL, 1000);
    assert.equal(r.stockMM, 2);
    assert.deepEqual(r.formulas, target.formulas);
    assert.deepEqual(r.errors, []);
  }
});
test("retired availability values and units never block calculations or review", () => {
  assert.equal(Object.hasOwn(blankStock("S"), "available"), false);
  for (const value of ["", "0", "-1", "invalid", ".001", "900000"]) {
    const inputs = recipe();
    for (const role of ["S", "IS"]) Object.assign(inputs.cocktails[0].stocks[role], { available: value, availableUnit: "invalid" });
    const result = calculateSIS(inputs);
    assert.deepEqual(result.errors, []);
    assert.equal(result.cocktails[0].rows[0].stock.stockMM, 1);
    assert.equal(result.cocktails[0].rows[0].stock.prepUL, 2000);
    assert.equal(Object.hasOwn(result.cocktails[0].rows[0].stock, "availableUL"), false);
    assert.equal(makeRecord("sis", inputs, "Reviewed").status, "Reviewed");
  }
});
test("Stock Final Volume still constrains prepared quantity independently of retired availability", () => {
  const inputs = recipe(),
    c = inputs.cocktails[0];
  c.stocks.S.target = "4000";
  const result = calculateCocktail(c, 600);
  assert.ok(result.errors.some((e) => e.includes("exceeds Stock Final Volume")));
  assert.ok(!result.errors.some((e) => /available/i.test(e)));
});
test("legacy cached availability failures are recalculated for current views and Excel without mutating stored records", async () => {
  const inputs = recipe();
  for (const role of ["S", "IS"]) Object.assign(inputs.cocktails[0].stocks[role], { available: "invalid", availableUnit: "invalid" });
  const archived = makeRecord("sis", inputs);
  archived.results.errors = ["A: S: Volume must be a finite number."];
  archived.results.cocktails[0].errors = ["S: Volume must be a finite number."];
  archived.results.cocktails[0].rows[0].stock = { errors: ["Volume must be a finite number."], warnings: [] };
  archived.results.cocktails[0].rows[0].transferUL = null;
  const before = structuredClone(archived),
    view = cocktailPresentationResults(archived.inputs, archived.results);
  assert.deepEqual(view.errors, []);
  assert.equal(view.cocktails[0].rows[0].stock.stockMM, 1);
  assert.equal(view.cocktails[0].rows[0].transferUL, 60);
  assert.deepEqual(archived, before);
  const values = new Map(),
    storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  saveRecord(archived, storage);
  assert.deepEqual(readRecords(storage)[0], before);
  const workbook = await createPreparationWorkbook(archived, ExcelJS),
    sheet = workbook.getWorksheet("Cocktails"),
    headers = sheet.getRow(12).values;
  assert.equal(sheet.getCell(13, headers.indexOf("Stock Final Volume (µL)")).value, 2000);
  assert.equal(sheet.getCell(13, headers.indexOf("Stock Concentration (mM)")).value, 1);
  assert.equal(sheet.getCell(13, headers.indexOf("Stock Volume to Transfer (µL)")).value, 60);
  assert.deepEqual(archived, before);
});
