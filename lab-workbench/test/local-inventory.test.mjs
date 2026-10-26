import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { readLocalInventory, localInventoryReportText } from "../src/local-inventory.mjs";
import { importInventory, validateInventoryTable } from "../src/inventory.mjs";
const file = (name, bytes) => ({
  name,
  size: bytes.length,
  arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});
test("local CSV is read in memory with stable version, full text identifiers and no fetch", async () => {
  const data = Buffer.from("Chemical Name,CAS,Barcode,Company,Lot Number\nLocal compound,123-45-6,00001234,Local supplier,LOCAL-LOT");
  const before = globalThis.fetch;
  globalThis.fetch = () => assert.fail("Local inventory must not call fetch");
  try {
    const a = await readLocalInventory(file("private.csv", data)),
      b = await readLocalInventory(file("private.csv", data));
    assert.equal(a.sourceType, "local");
    assert.equal(a.classification, "local");
    assert.equal(a.rows[0].Barcode, "00001234");
    assert.equal(a.version, b.version);
    assert.match(a.version, /^local-[a-f0-9]{16}$/);
    assert.equal(a.source, "private.csv");
  } finally {
    globalThis.fetch = before;
  }
});
test("local XLSX automatically selects the unique matching sheet and preserves temperature", async () => {
  const w = new ExcelJS.Workbook();
  w.addWorksheet("Notes").addRow(["Not inventory"]);
  const s = w.addWorksheet("Inventory");
  s.addRow(["Chemical Name", "CAS", "Barcode", "Temperature"]);
  s.addRow(["Local hydrate", "123", "000001", "−20 °C"]);
  const a = await readLocalInventory(file("private.xlsx", Buffer.from(await w.xlsx.writeBuffer())), undefined, ExcelJS);
  assert.equal(a.rows[0].Temperature, "−20 °C");
  assert.equal(a.rows[0].Barcode, "000001");
});
test("empty and malformed local files are rejected with concrete field errors", async () => {
  await assert.rejects(() => readLocalInventory(file("empty.csv", Buffer.alloc(0))), /empty/);
  await assert.rejects(() => readLocalInventory(file("bad.csv", Buffer.from("Name,ID\nSalt,123"))), /Missing required column: CAS/);
  await assert.rejects(() => readLocalInventory(file("header.csv", Buffer.from("Chemical Name,CAS,Barcode\n"))), /empty inventory/);
});

test("invalid names at worksheet row 583 do not block valid local records or shift reported row numbers", async () => {
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet("Inventory");
  sheet.addRow(["Chemical Name", "CAS", "Barcode", "Note", "Count"]);
  sheet.addRows(Array.from({ length: 581 }, (_, i) => [`Test compound ${i}`, "123", `TEST-${i}`, false, 0]));
  sheet.addRow(["", "123", "MISSING-NAME"]);
  sheet.addRow([1234, "123", "NUMERIC-NAME"]);
  sheet.addRow(["Last test compound", "123", "00001234"]);
  const source = file("private.xlsx", Buffer.from(await workbook.xlsx.writeBuffer()));
  const data = await readLocalInventory(source, undefined, ExcelJS);
  assert.equal(data.rows.length, 582);
  assert.equal(data.importReport.totalRows, 584);
  assert.equal(data.importReport.excludedRows, 2);
  assert.deepEqual(
    data.importReport.issues.map((issue) => issue.row),
    [583, 584],
  );
  assert.match(data.importReport.issues[0].problems[0], /missing value/);
  assert.match(data.importReport.issues[1].problems[0], /found number/);
  assert.equal(data.rows.at(-1).Barcode, "00001234");
  assert.equal(data.rowNumbers.at(-1), 585);
  assert.equal(data.rows[0].Note, false);
  assert.equal(data.rows[0].Count, 0);
  assert.match(localInventoryReportText(data), /Worksheet: Inventory/);
  assert.match(localInventoryReportText(data), /Row 583: Chemical Name/);
  // The developer publication path must still refuse incomplete datasets.
  const fullTable = await importInventory(source, undefined, ExcelJS);
  assert.throws(() => validateInventoryTable(fullTable), /Inventory row 583: Chemical Name/);
  assert.equal(fullTable.rows.length, 584);
});

test("CSV partial imports retain original line starts and exclude all duplicate barcode conflicts", async () => {
  const bytes = Buffer.from(
    'Chemical Name,CAS,Barcode,MW\r\n"First\r\ncompound",123,0001,100\r\n\r\n,123,0002,100\r\nLast compound,123,0003,100\r\nDuplicate A,123,0004,100\r\nDuplicate B,123,0004,100\r\nInvalid MW,123,0005,bad',
  );
  const data = await readLocalInventory(file("private.csv", bytes));
  assert.deepEqual(data.rowNumbers, [2, 6]);
  assert.deepEqual(
    data.importReport.issues.map((issue) => issue.row),
    [5, 7, 8, 9],
  );
  assert.equal(data.importReport.importedRows, 2);
  assert.equal(data.importReport.totalRows, 6);
  assert.equal(data.blankRowCount, 1);
  assert.equal(data.rows[0]["Chemical Name"], "First\r\ncompound");
  assert.equal(data.rows[1].Barcode, "0003");
  assert.match(localInventoryReportText(data), /Row 7: duplicate Barcode 0004/);
  assert.match(localInventoryReportText(data), /Row 8: duplicate Barcode 0004/);
  assert.match(localInventoryReportText(data), /Row 9: Molecular Weight/);
});

test("files with no usable records fail explicitly instead of selecting an empty inventory", async () => {
  const bytes = Buffer.from("Chemical Name,CAS,Barcode\n\n,123,0001\nNamed compound,123,");
  await assert.rejects(
    () => readLocalInventory(file("bad.csv", bytes)),
    /No usable inventory records\. All 2 rows failed validation\. Row 3: Chemical Name.*Row 4: Barcode/,
  );
});
