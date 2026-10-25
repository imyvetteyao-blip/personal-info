import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
const field = (p, path) => p.locator(`[data-path="${path}"]`);
const chemical =
  "A fully specified chemical hydrate with a very long name that must never lose its complete original value in inventory snapshots or Excel exports";
const headers = [
  "Chemical Name",
  "ID",
  "CAS",
  "Barcode",
  "Vendor / Company",
  "Vendor ID",
  "Lot",
  "MW",
  "Temperature",
  "Flammable Storage?",
  "Poison/Toxic Storage?",
  "SOP",
  "Note",
  "Column 18",
  "Count",
  "Boolean value",
];
const values = [
  chemical,
  "INVENTORY-1234567890123456",
  "000-12-3",
  "000012345678901234567890",
  "The Full Supplier Company Name With Extra Information",
  "00009999",
  "LOT-0000000001234567890",
  "100",
  "−20 °C",
  "",
  "NO",
  "—",
  "  ",
  "-",
  "0",
  "false",
];
const csv = () => headers.join(",") + "\n" + values.join(",");
async function load(p) {
  await p.goto("#buffer");
  await field(p, "name").fill("Measured buffer");
  await field(p, "volume").fill("1000");
  await p.locator("#inventory-file").setInputFiles({
    name: "inventory.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv()),
  });
  await p.locator("#inventory-query").fill("000012345");
}
async function add(p) {
  await load(p);
  await p.getByRole("button", { name: "Add component", exact: true }).click();
}
const metric = (p, label) =>
  p
    .locator(".component-panel .result-strip > div")
    .filter({ has: p.getByText(label, { exact: true }) })
    .locator("strong");
const excelCell = (s, header, row = 13) => s.getCell(row, s.getRow(12).values.indexOf(header));

test("search table clamps values and headings to two lines, identifiers and action stay single-line, full content is copyable", async ({ page }) => {
  await load(page);
  await expect(page.locator("#sheet-index,#header-row,[data-map]")).toHaveCount(0);
  const spans = page.locator(".inventory-results .two-line");
  for (const el of await spans.all()) {
    expect(await el.evaluate((n) => n.getBoundingClientRect().height)).toBeLessThanOrEqual(36.1);
  }
  for (const el of await page.locator(".inventory-results .identifier-column .two-line").all()) {
    expect(await el.evaluate((n) => getComputedStyle(n).whiteSpace)).toBe("nowrap");
  }
  const b = page.getByRole("button", { name: "Add component", exact: true });
  expect(await b.evaluate((n) => getComputedStyle(n).whiteSpace)).toBe("nowrap");
  expect(await b.evaluate((n) => n.getBoundingClientRect().width)).toBeGreaterThanOrEqual(130);
  expect(await page.locator(".inventory-results-wrap").evaluate((n) => n.scrollWidth > n.clientWidth)).toBeTruthy();
  await page.locator('.inventory-results tbody [data-header="Chemical Name"]').click();
  await expect(page.locator("#detail-content")).toHaveValue(chemical);
  await expect(page.getByRole("button", { name: "Copy full content" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Add component", exact: true }).click();
  const snap = page.locator(".snapshot");
  await expect(snap).toContainText(chemical);
  await expect(snap).toContainText("−20 °C");
  await expect(snap.locator("b", { hasText: "Flammable Storage?" })).toHaveCount(0);
  await expect(snap.locator("b", { hasText: /^(SOP|Note|Column 18)$/ })).toHaveCount(0);
  await expect(snap).toContainText("NO");
  await expect(snap).toContainText("Count0");
  await expect(snap).toContainText("Boolean valuefalse");
  await page.locator(".inventory-results-wrap").screenshot({ path: "output/playwright/lab/inventory-two-lines.png" });
});
test("legacy CSV temperature is decoded using actual bytes and missing columns are specific", async ({ page }) => {
  await page.goto("#buffer");
  const buf = Buffer.concat([Buffer.from("Chemical Name,CAS,Barcode,Temperature\nSalt,123,00001,-20 "), Buffer.from([0xb0]), Buffer.from("C")]);
  await page.locator("#inventory-file").setInputFiles({
    name: "excel-ansi.csv",
    mimeType: "text/csv",
    buffer: buf,
  });
  await page.locator("#inventory-query").fill("Salt");
  await expect(page.locator(".inventory-results")).toContainText("-20 °C");
  await expect(page.getByText(/Decoded as windows-1252/)).toBeVisible();
  await page.locator("#inventory-file").setInputFiles({
    name: "missing.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Chemical Name,CAS,ID\nSalt,123,123"),
  });
  await expect(page.locator("#toast")).toContainText("Missing required column: Barcode");
});
test("new stock computes µL and exports a Draft without requiring optional observed transfer", async ({ page }) => {
  await add(page);
  await field(page, "components.0.form").selectOption("solid");
  await field(page, "components.0.target").fill(".097992265");
  await field(page, "components.0.actualMass").fill("100");
  await field(page, "components.0.stockVolume").fill("10");
  await expect(metric(page, "Calculated Stock Transfer Volume")).toHaveText("979.92 µL");
  await expect(page.locator(".component-panel .notice.error")).toHaveCount(0);
  await expect(metric(page, "Actual Final Concentration")).toHaveText("— mM");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Preparation Excel", exact: true }).click();
  const d = await event;
  expect(d.suggestedFilename()).toMatch(/\.xlsx$/);
  const w = new ExcelJS.Workbook();
  await w.xlsx.readFile(await d.path());
  const s = w.getWorksheet("Preparation");
  expect(s.getCell("B5").value).toBe("Draft");
  expect(excelCell(s, "Barcode").value).toBe(values[3]);
  expect(excelCell(s, "Vendor / Company").value).toBe(values[4]);
  expect(excelCell(s, "Stock Transfer Volume (µL)").value).toBeCloseTo(979.92265, 7);
  expect(excelCell(s, "Actual Final Concentration (mM)").value).toBeNull();
  expect(excelCell(s, "Component Name").value).toBe(chemical);
  expect(await page.evaluate(() => localStorage.getItem("lab-preparation-workbench.records.v1"))).toBeNull();
});
test("liquid basis switching, signed mass error, saving/reopening and real Excel all agree", async ({ page }) => {
  await add(page);
  await field(page, "components.0.form").selectOption("pure-liquid");
  await field(page, "components.0.density").fill("1.01");
  await field(page, "components.0.target").fill("10");
  await field(page, "components.0.observationMethod").selectOption("mass");
  await field(page, "components.0.massUnit").selectOption("g");
  await field(page, "components.0.actualMass").fill("1.01");
  await expect(metric(page, "Target Mass (Required Mass)")).toHaveText("1000.00 mg");
  await expect(metric(page, "Actual Final Concentration")).toHaveText("10.10 mM");
  await expect(metric(page, "Mass Deviation")).toHaveText("+10.00 mg");
  await expect(metric(page, "Mass Error (%)")).toHaveText("+1.00%");
  await expect(page.locator(".component-panel .notice.error")).toHaveCount(0);
  await field(page, "components.0.actualMass").fill(".99");
  await expect(metric(page, "Mass Error (%)")).toHaveText("-1.00%");
  await field(page, "components.0.actualMass").fill("");
  await expect(metric(page, "Mass Error (%)")).toHaveText("—%");
  await field(page, "components.0.observationMethod").selectOption("volume");
  await field(page, "components.0.liquidUnit").selectOption("mL");
  await field(page, "components.0.actualLiquid").fill("1");
  await field(page, "components.0.massUnit").selectOption("mg");
  await field(page, "components.0.actualMass").fill("999");
  await expect(metric(page, "Actual Final Concentration")).toHaveText("10.10 mM");
  await expect(metric(page, "Mass Error (%)")).toHaveText("+1.00%");
  await expect(page.getByText(/Mass error is calculated from observed volume/)).toBeVisible();
  await field(page, "components.0.reviewed").check();
  await page.getByRole("button", { name: "Mark Reviewed", exact: true }).click();
  await page.getByRole("button", { name: "Save Preparation Record", exact: true }).first().click();
  const record = await page.evaluate(() => JSON.parse(localStorage.getItem("lab-preparation-workbench.records.v1"))[0]);
  expect(record.inputs.components[0].observationMethod).toBe("volume");
  expect(record.inputs.components[0].inventory["Flammable Storage?"]).toBe("");
  expect(record.results.rows[0].massErrorPercent).toBeCloseTo(1, 10);
  await page.reload();
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(field(page, "components.0.actualMass")).toHaveValue("999");
  await expect(field(page, "components.0.actualLiquid")).toHaveValue("1");
  await expect(metric(page, "Mass Error (%)")).toHaveText("+1.00%");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Preparation Excel", exact: true }).click();
  const w = new ExcelJS.Workbook();
  await w.xlsx.readFile(await (await event).path());
  const s = w.getWorksheet("Preparation");
  expect(s.getCell("B5").value).toBe("Reviewed");
  expect(excelCell(s, "Observed Mass — Measured (mg)").value).toBe(999);
  expect(excelCell(s, "Mass Calculated from Density (mg)").value).toBe(1010);
  expect(excelCell(s, "Mass Error (%)").value).toBeCloseTo(1, 10);
  expect(excelCell(s, "Mass Error Basis").value).toBe("Calculated from observed volume");
  expect(s.getRow(12).values).not.toContain("Inventory: Flammable Storage?");
  await page.locator(".component-panel").screenshot({ path: "output/playwright/lab/liquid-observation.png" });
});
test("small values show <0.01 and full precision is available by click", async ({ page }) => {
  await add(page);
  await field(page, "components.0.form").selectOption("solid");
  await field(page, "components.0.target").fill(".00000123456789");
  const value = metric(page, "Target Mass (Required Mass)");
  await expect(value).toHaveText("<0.01 mg");
  await value.locator(".calculated-value").click();
  expect(Number(await page.locator("#detail-content").inputValue())).toBeCloseTo(0.000123456789, 15);
});

test("pure-liquid new stock supports both observation methods without confusing stock mass and target mass", async ({ page }) => {
  await add(page);
  await field(page, "components.0.form").selectOption("pure-liquid");
  await field(page, "components.0.density").fill("1.1");
  await field(page, "components.0.target").fill(".097992265");
  await field(page, "components.0.actualMass").fill("100");
  await field(page, "components.0.stockVolume").fill("10");
  await expect(field(page, "components.0.stockObservationMethod")).toHaveValue("mass");
  await expect(metric(page, "Stock Concentration")).toHaveText("100.00 mM");
  await expect(metric(page, "Calculated Stock Transfer Volume")).toHaveText("979.92 µL");
  await field(page, "components.0.stockObservationMethod").selectOption("volume");
  await field(page, "components.0.actualLiquid").fill("100");
  await field(page, "components.0.actualMass").fill("999");
  await expect(metric(page, "Stock Concentration")).toHaveText("110.00 mM");
  await expect(metric(page, "Stock Mass — Calculated from Density")).toHaveText("110.00 mg");
  await expect(page.locator(".component-panel .notice.error")).toHaveCount(0);
});
