import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { calculateBufferComponent, massError, RULE_VERSION } from "../src/calculations.mjs";
import { blankBuffer, componentFromRow, makeRecord, saveRecord, readRecords, decodeRecord } from "../src/models.mjs";
import { decodeCSV, importInventory } from "../src/inventory.mjs";
import { isMeaningful, inventoryMapping, INVENTORY_CONFIG } from "../src/inventory-config.mjs";
import { formatResult } from "../src/format.mjs";
import { createPreparationWorkbook } from "../src/excel.mjs";
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const component = (extra) => ({
  ...componentFromRow(
    {
      "Chemical Name": "A very long exact chemical hydrate",
      Barcode: "000123456789",
      CAS: "000-12-3",
      "Vendor / Company": "Complete Supplier Company",
      "Vendor ID": "000987",
      Lot: "000LOT",
      Temperature: "−20 °C",
      Note: "",
      "Column 18": "",
    },
    inventoryMapping(["Chemical Name", "Barcode", "CAS", "Vendor / Company", "Vendor ID", "Lot"]),
    "inventory.csv",
  ),
  mw: "100",
  form: "solid",
  target: "10",
  actualMass: "1010",
  ...extra,
});
const record = (c, status = "Draft") =>
  makeRecord(
    "buffer",
    {
      ...blankBuffer(),
      name: "Buffer example",
      volume: "1000",
      volumeUnit: "mL",
      components: [c],
    },
    status,
  );
function file(name, bytes) {
  return {
    name,
    size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  };
}
function cellByHeader(ws, name, row = 13) {
  const idx = ws.getRow(12).values.indexOf(name);
  assert.ok(idx > 0, `Missing ${name}`);
  return ws.getCell(row, idx);
}

test("result presentation rounds only at display, preserves signs and small nonzero values", () => {
  assert.equal(formatResult(17.654567), "17.65");
  assert.equal(formatResult(85.718888), "85.72");
  assert.equal(formatResult(0.97992265 * 1000), "979.92");
  assert.equal(formatResult(0.00499), "<0.01");
  assert.equal(formatResult(-0.0001), "-<0.01");
  assert.equal(formatResult(0), "0.00");
  assert.equal(formatResult(null), "—");
  assert.equal(formatResult(1, { signed: true }), "+1.00");
});
test("direct-solid mass errors retain positive, negative, and missing states", () => {
  const over = calculateBufferComponent(component({}), 1000, "mL");
  near(over.requiredMg, 1000);
  near(over.massDeviationMg, 10);
  near(over.massErrorPercent, 1);
  near(over.actualMM, 10.1);
  const under = calculateBufferComponent(component({ actualMass: ".99", massUnit: "g" }), 1000, "mL");
  near(under.massDeviationMg, -10);
  near(under.massErrorPercent, -1);
  const missing = calculateBufferComponent(component({ actualMass: "" }), 1000, "mL");
  assert.equal(missing.massErrorPercent, null);
  assert.equal(missing.actualMM, null);
  assert.throws(() => massError(10, 0), /greater than zero/);
});
test("pure liquid By Mass and By Volume use the selected measured basis without averaging", () => {
  const c = component({
    form: "pure-liquid",
    density: "1.01",
    observationMethod: "mass",
    actualMass: "1.01",
    massUnit: "g",
    actualLiquid: "123",
    liquidUnit: "µL",
  });
  const m = calculateBufferComponent(c, 1000, "mL");
  near(m.requiredLiquidUL, 1000 / 1.01);
  near(m.observedMassMg, 1010);
  near(m.observedVolumeUL, 123);
  near(m.actualMM, 10.1);
  near(m.calculatedVolumeUL, 1000);
  near(m.massErrorPercent, 1);
  assert.equal(m.actualConcentrationBasis, "Measured mass");
  const v = calculateBufferComponent(
    {
      ...c,
      observationMethod: "volume",
      actualLiquid: "1",
      liquidUnit: "mL",
      actualMass: "999",
      massUnit: "mg",
    },
    1000,
    "mL",
  );
  near(v.observedMassMg, 999);
  near(v.calculatedMassMg, 1010);
  near(v.actualMM, 10.1);
  near(v.massErrorPercent, 1);
  assert.equal(v.massErrorBasis, "Calculated from observed volume");
});
test("inactive direct-liquid observation fields do not produce missing-volume errors", () => {
  const r = calculateBufferComponent(
    component({
      form: "pure-liquid",
      density: "1",
      observationMethod: "mass",
      actualMass: "1000",
      actualLiquid: "",
    }),
    1000,
    "mL",
  );
  assert.deepEqual(r.errors, []);
  near(r.actualMM, 10);
  const v = calculateBufferComponent(
    component({
      form: "pure-liquid",
      density: "1",
      observationMethod: "volume",
      actualMass: "not used",
      actualLiquid: "1000",
      liquidUnit: "µL",
    }),
    1000,
    "mL",
  );
  assert.deepEqual(v.errors, []);
  near(v.actualMM, 10);
});
test("new stock needs actual mass and final volume, not an unrecorded measured transfer", () => {
  const c = component({
    method: "new",
    target: ".097992265",
    actualMass: "100",
    stockVolume: "10",
    stockVolumeUnit: "mL",
    actualTransfer: "",
    actualLiquid: "ignored",
  });
  const r = calculateBufferComponent(c, 1000, "mL");
  assert.deepEqual(r.errors, []);
  near(r.transferML, 0.97992265);
  near(r.stockTransferUL, 979.92265);
  assert.equal(r.actualMM, null);
  assert.equal(formatResult(r.stockTransferUL), "979.92");
  const missing = calculateBufferComponent({ ...c, stockVolume: "" }, 1000, "mL");
  assert.ok(missing.errors.includes("Stock final solution volume is required."));
});
test("commodity solution measured mass requires solution density and known concentration", () => {
  const c = component({
    form: "solution",
    observationMethod: "mass",
    knownConcentration: "10",
    knownUnit: "mmol/L",
    confirmed: true,
    available: "1000",
    density: "1",
    actualMass: "1000",
  });
  const r = calculateBufferComponent(c, 1000, "mL");
  near(r.calculatedVolumeUL, 1000);
  near(r.actualMM, 0.01);
  assert.equal(r.massErrorPercent, null);
  assert.equal(r.stockActualMassMg, null);
  const missing = calculateBufferComponent({ ...c, density: "" }, 1000, "mL");
  assert.ok(missing.errors.some((e) => e.includes("Solution density")));
  assert.equal(missing.actualMM, null);
  const noConc = calculateBufferComponent({ ...c, knownConcentration: "" }, 1000, "mL");
  assert.ok(noConc.errors.some((e) => e.includes("Known stock concentration")));
});
test("nonempty snapshots retain 0, false and NO, hide only defined missing values", () => {
  for (const x of [null, undefined, "", "  ", "—", "-", " - "]) assert.equal(isMeaningful(x), false);
  for (const x of [0, false, "NO", "0", "false", "−20 °C"]) assert.equal(isMeaningful(x), true);
});
test("CSV decoding preserves UTF-8/BOM and legacy Excel degree symbols without replacements", () => {
  const source = "Chemical Name,CAS,Barcode,Temperature\nSalt,123,0001,−20 °C";
  for (const bytes of [Buffer.from(source), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(source)])])
    assert.equal(decodeCSV(bytes).text, source);
  const ansi = Buffer.concat([Buffer.from("Chemical Name,CAS,Barcode,Temperature\nSalt,123,0001,-20 "), Buffer.from([0xb0]), Buffer.from("C")]);
  assert.equal(decodeCSV(ansi).text, "Chemical Name,CAS,Barcode,Temperature\nSalt,123,0001,-20 °C");
  assert.equal(decodeCSV(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(source, "utf16le")])).text, source);
  assert.throws(() => decodeCSV(Buffer.from([0xef, 0xbb, 0xbf, 0xb0])), /invalid UTF-8/);
  assert.throws(() => decodeCSV(ansi, null), /source encoding/);
});
test("fixed CSV import maps exact headers automatically, MW and density optional, ID is not Barcode", async () => {
  const inv = await importInventory(file("inventory.csv", Buffer.from("Chemical Name,CAS,Barcode,Vendor ID\nHydrate,1,00001,00002")));
  assert.equal(inv.mapping.name, "Chemical Name");
  assert.equal(inv.mapping.barcode, "Barcode");
  assert.equal(inv.mapping.mw, "");
  assert.equal(inv.rows[0].Barcode, "00001");
  assert.equal(inv.source, "inventory.csv");
  assert.equal(inv.worksheet, undefined);
  await assert.rejects(() => importInventory(file("bad.csv", Buffer.from("Chemical Name,CAS,ID\nSalt,1,999"))), /Missing required column: Barcode/);
  assert.throws(() => inventoryMapping(["Chemical", "Name", "CAS", "Barcode"]), /Ambiguous Chemical Name/);
});
test("fixed XLSX import selects only a uniquely matching configured template and retains full fields", async () => {
  globalThis.ExcelJS = ExcelJS;
  const w = new ExcelJS.Workbook();
  w.addWorksheet("Instructions").addRow(["Not an inventory"]);
  const s = w.addWorksheet("Chemical Inventory");
  s.addRow(["Chemical Name", "CAS", "Barcode", "Extra"]);
  s.addRow(["Exact hydrate", "001-22", "000123", "Full original value"]);
  const inv = await importInventory(file("inventory.xlsx", Buffer.from(await w.xlsx.writeBuffer())));
  assert.equal(inv.worksheet, "Chemical Inventory");
  assert.equal(inv.rows[0].Extra, "Full original value");
  const dup = w.addWorksheet("Duplicate");
  dup.addRows(s.getSheetValues().slice(1));
  const duplicateBytes = Buffer.from(await w.xlsx.writeBuffer());
  await assert.rejects(() => importInventory(file("duplicate.xlsx", duplicateBytes)), /More than one worksheet/);
  const named = await importInventory(file("named.xlsx", Buffer.from(await w.xlsx.writeBuffer())), {
    ...INVENTORY_CONFIG,
    worksheetName: "Chemical Inventory",
  });
  assert.equal(named.worksheet, "Chemical Inventory");
});
test("legacy records without observationMethod still open without altering their saved results", () => {
  const r = record(component({}));
  r.ruleVersion = "1.0.0";
  delete r.inputs.components[0].observationMethod;
  delete r.inputs.components[0].inventoryMapping;
  r.results.legacy = "preserved";
  const opened = decodeRecord(JSON.stringify(r));
  assert.equal(opened.results.legacy, "preserved");
  assert.equal(opened.ruleVersion, "1.0.0");
  assert.equal(RULE_VERSION, "1.2.0");
});
