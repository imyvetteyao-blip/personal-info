import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { calendarDateInfo } from "../src/calendar-date.mjs";
import { bufferPresentationResults } from "../src/buffer-view.mjs";
import { blankBuffer, makeRecord, saveRecord, readRecords } from "../src/models.mjs";
import { createPreparationWorkbook } from "../src/excel.mjs";

test("day of year uses the selected calendar date, validates dates and handles leap centuries", () => {
  for (const [date, day] of [
    ["2026-01-01", 1],
    ["2026-10-26", 299],
    ["2028-12-31", 366],
    ["2028-02-29", 60],
    ["1900-03-01", 60],
    ["2000-03-01", 61],
  ]) {
    const info = calendarDateInfo(date);
    assert.equal(info.dayOfYear, day);
    assert.equal(info.label, `Day ${day} of ${date.slice(0, 4)}`);
  }
  for (const value of ["", null, "2026-02-29", "2026-13-01", "2026-04-31", "0000-01-01"]) assert.equal(calendarDateInfo(value), null);
});
test("calendar date calculation is independent of time zones and DST", () => {
  const before = process.env.TZ;
  try {
    for (const zone of ["UTC", "America/Los_Angeles", "Pacific/Kiritimati", "Europe/Berlin"]) {
      process.env.TZ = zone;
      assert.equal(calendarDateInfo("2026-10-26").dayOfYear, 299);
      assert.equal(calendarDateInfo("2026-03-09").dayOfYear, 68);
      assert.equal(calendarDateInfo("2028-12-31").dayOfYear, 366);
    }
  } finally {
    if (before === undefined) delete process.env.TZ;
    else process.env.TZ = before;
  }
});
test("saved dates and day numbers round-trip and export numerically without moving Excel component rows", async () => {
  const record = makeRecord("buffer", { ...blankBuffer(), name: "Calendar draft", preparationDate: "2026-10-26" });
  const values = new Map(),
    storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  saveRecord(record, storage);
  const reopened = readRecords(storage)[0];
  assert.equal(reopened.inputs.preparationDate, "2026-10-26");
  assert.equal(reopened.calendarDates.preparation.dayOfYear, 299);
  const workbook = await createPreparationWorkbook(reopened, ExcelJS),
    s = workbook.getWorksheet("Preparation");
  assert.equal(s.getCell("B6").value, "2026-10-26");
  assert.equal(s.getCell("B12").value, 299);
  assert.match(s.getCell("B12").numFmt, /2026/);
  assert.equal(s.getCell("A13").value, "B. Components");
  assert.equal(s.getCell("B11").value, "Draft");
  const legacy = structuredClone(record);
  delete legacy.calendarDates;
  saveRecord(legacy, storage);
  assert.deepEqual(readRecords(storage)[0], legacy);
});
test("retiring optional stock checks preserves raw snapshots and unrelated validation errors", () => {
  const original = {
    errors: ["Component 1: Stock target mass must be greater than zero.", "Final buffer volume is required."],
    rows: [
      {
        errors: ["Stock target mass is required.", "Stock actual mass is required."],
        formulas: ["Stock weighing error (%) = legacy", "Stock concentration (mM) = retained"],
        stockMassErrorPercent: 999,
      },
    ],
  };
  const before = structuredClone(original),
    view = bufferPresentationResults(original);
  assert.deepEqual(view.errors, ["Final buffer volume is required."]);
  assert.deepEqual(view.rows[0].errors, ["Stock actual mass is required."]);
  assert.deepEqual(view.rows[0].formulas, ["Stock concentration (mM) = retained"]);
  assert.deepEqual(original, before);
});
