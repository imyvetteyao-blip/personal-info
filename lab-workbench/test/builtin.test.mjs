import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import ExcelJS from "exceljs";
import { convertInventory, selectInventorySource } from "../inventory/convert.mjs";
import { loadBuiltinInventory } from "../src/builtin-inventory.mjs";
import { INVENTORY_COLUMNS, summaryEntries, inventoryValue } from "../src/inventory-view.mjs";
import { inventoryMapping } from "../src/inventory-config.mjs";
import { componentFromRow, blankBuffer, makeRecord, saveRecord, readRecords } from "../src/models.mjs";
import { createPreparationWorkbook } from "../src/excel.mjs";
import { calculateBufferComponent } from "../src/calculations.mjs";
import { bufferSectionRows } from "../src/excel-buffer.mjs";
const header = "Chemical Name,CAS,Barcode,MW,Company,Vendor ID,Lot Number,Location,Sub-location,Amount,Units,Temperature";
const csv = (vendor = "Demo supplier") => `${header}\nGlycine,56-40-6,DEMO-001,100,${vendor},A2485,RPJCH-OR,Shelf,A1,500,mL,−20 °C`;
const temp = async (fn) => {
  const d = await mkdtemp(join(tmpdir(), "inventory-test-"));
  try {
    return await fn(d);
  } finally {
    await rm(d, { recursive: true, force: true });
  }
};
const component = (extra) => ({
  ...componentFromRow(
    { "Chemical Name": "Glycine", CAS: "56-40-6", Barcode: "0000123", Company: "TCI", "Vendor ID": "A2485", "Lot Number": "RPJCH-OR" },
    inventoryMapping(["Chemical Name", "CAS", "Barcode", "Company", "Vendor ID", "Lot Number"]),
    "source.csv",
    "v1",
    "2026-01-01T00:00:00Z",
  ),
  form: "solid",
  mw: "100",
  target: "10",
  actualMass: "1010",
  ...extra,
});
const record = (cs) =>
  makeRecord("buffer", {
    ...blankBuffer(),
    name: "Compact buffer",
    preparationLot: "B001",
    preparationDate: "2026-01-02",
    targetPH: "7.4",
    volume: "1000",
    components: cs,
  });

test("developer conversion validates source, encoding, versions and distinct release times", async () =>
  temp(async (d) => {
    const f = join(d, "demo.csv");
    await writeFile(f, csv());
    const a = await convertInventory({ source: f, classification: "demo", updatedAt: "2026-01-01T00:00:00Z" });
    const b = await convertInventory({ source: f, classification: "demo", updatedAt: "2026-01-02T00:00:00Z" });
    assert.notEqual(a.manifest.version, b.manifest.version);
    assert.equal(a.payload.rows[0].Temperature, "−20 °C");
    assert.equal(a.payload.demo, true);
    assert.equal(a.manifest.count, 1);
    assert.equal(JSON.parse(a.data).version, a.manifest.version);
  }));
test("empty, missing-header, duplicate, malformed records and mislabeled private data fail conversion", async () =>
  temp(async (d) => {
    const f = join(d, "source.csv");
    for (const [text, pattern] of [
      [header, /empty inventory/],
      ["Name,ID\nSalt,123", /Missing required column: CAS/],
      [csv() + "\nGlycine,56-40-6,DEMO-001,100", /duplicate Barcode/],
      [csv().replace("DEMO-001", ""), /Barcode must not be empty/],
      [csv().replace("Glycine,", ","), /Chemical Name must be nonempty text/],
      [csv().replace(",100,", ",bad,"), /Molecular Weight/],
    ]) {
      await writeFile(f, text);
      await assert.rejects(() => convertInventory({ source: f, classification: "private" }), pattern);
    }
    await writeFile(f, csv().replace("DEMO-001", "COMPANY-001"));
    await assert.rejects(() => convertInventory({ source: f, classification: "demo" }), /cannot be labeled Demo/);
  }));
test("fixed-format XLSX is supported by developer conversion with no browser upload", async () =>
  temp(async (d) => {
    const w = new ExcelJS.Workbook(),
      s = w.addWorksheet("Inventory");
    s.addRow(["Chemical Name", "CAS", "Barcode"]);
    s.addRow(["Salt", "7647-14-5", "DEMO-001"]);
    const f = join(d, "source.xlsx");
    await w.xlsx.writeFile(f);
    const r = await convertInventory({ source: f, classification: "private" });
    assert.equal(r.payload.rows.length, 1);
    assert.equal(r.payload.classification, "private");
  }));
test("ordinary public build rejects private source and leaves published output unchanged", async () =>
  temp(async (d) => {
    await writeFile(join(d, "source.csv"), csv());
    await writeFile(join(d, "demo.csv"), csv());
    const selected = await selectInventorySource({ directory: d });
    assert.equal(selected.classification, "private");
    const before = await readFile("../docs/index.html");
    const r = spawnSync(process.execPath, ["build.mjs"], { cwd: process.cwd(), env: { ...process.env, LAB_INVENTORY_DIR: d }, encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /Private inventory cannot be published/);
    assert.deepEqual(await readFile("../docs/index.html"), before);
    assert.equal((await selectInventorySource({ demo: true, directory: d })).classification, "demo");
  }));
test("invalid or empty source is rejected before build overwrites public output", async () =>
  temp(async (d) => {
    await writeFile(join(d, "demo.csv"), header);
    const before = await readFile("../docs/index.html");
    const r = spawnSync(process.execPath, ["build.mjs"], { env: { ...process.env, LAB_INVENTORY_DIR: d }, encoding: "utf8" });
    assert.notEqual(r.status, 0);
    assert.deepEqual(await readFile("../docs/index.html"), before);
  }));
test("loader bypasses stale caches and treats failed, empty or mismatched loads as errors", async () =>
  temp(async (d) => {
    const f = join(d, "demo.csv");
    await writeFile(f, csv());
    const r = await convertInventory({ source: f, classification: "demo" }),
      calls = [];
    const fetcher = async (url, opts) => {
      calls.push({ url: String(url), opts });
      return String(url).includes("manifest") ? { ok: true, json: async () => r.manifest } : { ok: true, text: async () => r.data };
    };
    const loaded = await loadBuiltinInventory({ base: "https://example.test/app/", fetcher, now: 123 });
    assert.equal(loaded.version, r.payload.version);
    assert.match(calls[0].url, /refresh=123/);
    assert.ok(calls.every((c) => c.opts.cache === "no-store"));
    await assert.rejects(
      () => loadBuiltinInventory({ base: "https://example.test/", fetcher: async () => ({ ok: false, status: 503 }) }),
      /HTTP 503/,
    );
  }));
test("replaced inventory updates new searches while snapshots and saved versions remain unchanged", async () =>
  temp(async (d) => {
    const f = join(d, "demo.csv");
    await writeFile(f, csv("Vendor A"));
    const a = await convertInventory({ source: f, classification: "demo" });
    const c = componentFromRow(a.payload.rows[0], a.payload.mapping, "source.csv", a.payload.version, a.payload.updatedAt);
    const store = new Map(),
      storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
    const saved = record([c]);
    saveRecord(saved, storage);
    await writeFile(f, csv("Vendor B"));
    const b = await convertInventory({ source: f, classification: "demo" });
    assert.equal(b.payload.rows[0].Company, "Vendor B");
    const opened = readRecords(storage)[0];
    assert.equal(opened.inputs.components[0].inventory.Company, "Vendor A");
    assert.equal(opened.inputs.components[0].inventoryVersion, a.payload.version);
    assert.deepEqual(opened, saved);
  }));
test("search field order is fixed, amounts/locations merge, summary fields are hidden by name only", () => {
  assert.deepEqual(
    INVENTORY_COLUMNS.map((c) => c.label),
    ["Chemical Name", "Location", "Amount", "Company", "Barcode", "CAS", "ID", "Lot Number", "State", "Grade", "Temperature"],
  );
  const row = {
    "Chemical Name": "Salt",
    CAS: "123",
    Barcode: "0001",
    Location: "Shelf",
    "Sub-location": "A1",
    Amount: 500,
    Units: "mL",
    "Received Date": "date",
    MyChem: "yes",
    "Inventory Date (2024)": "date",
    "2023 Inventory": "date",
    "TRGS Classification": "value",
    "General Storage": "value",
    "Inventory Source": "value",
    Temperature: "−20 °C",
    Note: false,
    Count: 0,
  };
  const m = inventoryMapping(Object.keys(row));
  assert.equal(inventoryValue(row, m, "amount"), "500 mL");
  assert.equal(inventoryValue(row, m, "location"), "Shelf / A1");
  assert.deepEqual(
    summaryEntries(row).map(([k]) => k),
    ["Chemical Name", "CAS", "Barcode", "Location", "Sub-location", "Amount", "Units", "Temperature", "Note", "Count"],
  );
});
test("stock weighing error is calculated only from explicit stock target mass, never buffer target mass", () => {
  const c = component({ method: "new", target: ".1", actualMass: "101", stockVolume: "10" });
  const no = calculateBufferComponent(c, 1000, "mL");
  assert.equal(no.stockMassErrorPercent, null);
  assert.equal(no.massErrorPercent, null);
  const yes = calculateBufferComponent({ ...c, stockTargetMass: ".1", stockTargetMassUnit: "g" }, 1000, "mL");
  assert.ok(Math.abs(yes.stockMassErrorPercent - 1) < 1e-12);
  assert.equal(yes.stockMM, 101);
  assert.notEqual(yes.stockTargetMassMg, yes.requiredMg);
});
test("Excel uses A/B/C sections on one sheet, nine component columns and per-stock volumes/amounts", async () => {
  const cs = [
    component({}),
    component({ id: "stock-one", method: "new", target: ".1", actualMass: "101", stockVolume: "2", stockTargetMass: "100" }),
    component({ id: "stock-two", method: "new", target: ".2", actualMass: "200", stockVolume: "5" }),
    component({ id: "existing", form: "solution", knownConcentration: "10", knownUnit: "mmol/L", available: "1000", confirmed: true }),
  ];
  const r = record(cs),
    w = await createPreparationWorkbook(r, ExcelJS),
    bytes = await w.xlsx.writeBuffer(),
    loaded = new ExcelJS.Workbook();
  await loaded.xlsx.load(bytes);
  assert.equal(loaded.worksheets.length, 1);
  const s = loaded.getWorksheet("Preparation");
  assert.equal(s.columnCount, 9);
  assert.equal(s.getCell("A3").value, "A. Preparation Information");
  assert.equal(s.getCell("A13").value, "B. Components");
  assert.equal(s.getCell("B5").value, "B001");
  assert.deepEqual(s.getRow(14).values.slice(1), [
    "Chemical",
    "Vendor",
    "MW (g/mol)",
    "Target Conc.",
    "Density (g/mL)",
    "Target Mass (mg)",
    "Target Volume (µL)",
    "Observation",
    "Error (%)",
  ]);
  assert.match(s.getCell("B15").value, /TCI, ID A2485, Lot RPJCH-OR, Barcode 0000123/);
  assert.equal(s.getCell("I15").value, 1);
  assert.match(s.getCell("H16").value, /Stock weighing/);
  assert.equal(s.getCell("I16").value, 1);
  assert.equal(s.getCell("I17").value, null);
  assert.equal(s.getCell("H18").value, null);
  assert.equal(s.getCell("I18").value, null);
  const st = bufferSectionRows(r).stocks;
  assert.deepEqual(
    st.map((r) => r.cells[3]),
    [2000, 5000, null],
  );
  assert.deepEqual(
    st.map((r) => r.cells[4]),
    [1.01, 2, null],
  );
  assert.equal(st[2].cells[2], null);
  assert.equal(st[2].cells[5], 10);
  assert.ok(s.pageSetup.printArea.startsWith("A1:I"));
  assert.equal(s.pageSetup.fitToHeight, 0);
  assert.ok(Object.keys(s.tables).length === 2);
});
test("section Excel leaves missing values blank and labels density-derived observations", async () => {
  const r = record([
    component({ form: "pure-liquid", density: "1.01", actualLiquid: "1", liquidUnit: "mL", actualMass: "999", observationMethod: "volume" }),
    component({ id: "missing", actualMass: "", mw: "" }),
  ]);
  const w = await createPreparationWorkbook(r, ExcelJS),
    s = w.getWorksheet("Preparation");
  assert.equal(s.getCell("B11").value, "Draft");
  assert.match(s.getCell("H15").value, /calculated from density/);
  assert.equal(s.getCell("I15").value, 1);
  assert.equal(s.getCell("F16").value, null);
  assert.equal(s.getCell("I16").value, null);
});
