import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { cleanInventorySearchText, matchingRows } from "../src/inventory.mjs";
import { calculateBufferComponent } from "../src/calculations.mjs";
import { inventoryMapping } from "../src/inventory-config.mjs";
import { blankBuffer, componentFromRow, makeRecord, saveRecord, readRecords } from "../src/models.mjs";
import { createPreparationWorkbook } from "../src/excel.mjs";
const original = { "Chemical Name": "Sodium taurocholate hydrate", CAS: "145-42-6", Barcode: "00001234", ID: "INV-123", MW: "555.7" };
const mapping = inventoryMapping(Object.keys(original));
const chemical = () => ({ ...componentFromRow(original, mapping, "local.csv"), form: "solid", target: "14", targetUnit: "mmol/L" });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("pasted and typed inventory names match despite invisible formatting, Unicode spaces and line breaks", () => {
  const rows = [structuredClone(original)],
    before = JSON.stringify(rows);
  for (const query of [
    original["Chemical Name"],
    "\ufeffSodium\u00a0tauro\u200bcholate\r\n hydrate\t",
    "Ｓｏｄｉｕｍ  taurocholate hydrate",
    "sodium\u202ftaurocholate\u00ad hydrate",
  ]) {
    assert.deepEqual(matchingRows(rows, mapping, query), rows);
  }
  assert.equal(JSON.stringify(rows), before);
  assert.equal(cleanInventorySearchText("\tSodium\n hydrate\u2060 "), "Sodium hydrate");
  assert.equal(cleanInventorySearchText("taurocholate ", { trim: false }), "taurocholate ");
  assert.deepEqual(matchingRows(rows, mapping, "\u200b\ufeff\t"), []);
  assert.deepEqual(matchingRows(rows, mapping, "Sodium taurocholate anhydrous"), []);
});
test("normalization applies to inventory values and identifiers without discarding chemical punctuation or leading zeroes", () => {
  const row = { ...original, "Chemical Name": "(R)-Test\u00a0\u00a0hydrate", CAS: "145\u201142\u20116" };
  for (const query of ["(R)\u2010Test hydrate", "145-42-6", "00001234", "inv\u2011123"]) assert.deepEqual(matchingRows([row], mapping, query), [row]);
  assert.deepEqual(matchingRows([row], mapping, "(S)-Test hydrate"), []);
  assert.equal(row.Barcode, "00001234");
});
test("target weight is automatic before observations, with real µL/mL/L volume conversion and no assumed volume", () => {
  const c = chemical();
  for (const [volume, unit] of [
    [100, "mL"],
    [100000, "µL"],
    [0.1, "L"],
  ]) {
    const r = calculateBufferComponent(c, volume, unit);
    near(r.requiredMg, 777.98);
    assert.equal(r.actualMM, null);
    assert.equal(r.massErrorPercent, null);
    assert.ok(r.errors.includes("Observed mass is required."));
  }
  const low = calculateBufferComponent(c, 10000, "µL");
  near(low.requiredMg, 77.798);
  assert.equal(low.method, "new");
  assert.equal(low.stockMM, null);
  const missing = calculateBufferComponent(c, "", "µL");
  assert.equal(missing.requiredMg, undefined);
  assert.match(missing.errors[0], /Final buffer volume is required/);
});
test("automatic target weight stays numeric and consistent in draft records and preparation Excel", async () => {
  const r = makeRecord("buffer", { ...blankBuffer(), name: "Automatic target", volume: "100000", volumeUnit: "µL", components: [chemical()] });
  const values = new Map(),
    storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  saveRecord(r, storage);
  const reopened = readRecords(storage)[0];
  near(reopened.results.rows[0].requiredMg, 777.98);
  assert.equal(reopened.inputs.components[0].actualMass, "");
  const w = await createPreparationWorkbook(reopened, ExcelJS),
    s = w.getWorksheet("Preparation");
  assert.equal(typeof s.getCell("F15").value, "number");
  near(s.getCell("F15").value, 777.98);
  assert.equal(s.getCell("H15").value, null);
  assert.equal(s.getCell("I15").value, null);
});
