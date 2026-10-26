import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { readLocalInventory } from "../src/local-inventory.mjs";
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
