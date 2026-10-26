import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { mockInventory, publishedInventory, field } from "./fixture.mjs";
const secret = "LOCAL TEST COMPOUND";
const contents = `Chemical Name,CAS,Barcode,Company,Lot Number,MW\n${secret},123-45-6,00001234,Local test supplier,LOCAL-LOT,100`;
const choose = async (page) =>
  page.locator("#local-inventory-file").setInputFiles({ name: "my-local-inventory.csv", mimeType: "text/csv", buffer: Buffer.from(contents) });
test("explicit local choice replaces Demo search without any network transfer or full-inventory persistence", async ({ page }) => {
  await mockInventory(page);
  await page.goto("#buffer");
  await page.locator("#inventory-query").waitFor();
  const requests = [];
  page.on("request", (r) => requests.push({ url: r.url(), method: r.method(), body: r.postData() }));
  await choose(page);
  await expect(page.locator(".inventory-source-label")).toContainText("Local file — my-local-inventory.csv (browser only)");
  await page.locator("#inventory-query").fill(secret);
  await expect(page.locator(".inventory-results")).toContainText("LOCAL-LOT");
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("lab.inventory.v1"))).toBeNull();
  await expect(page.locator("#sheet-index,#header-row,[data-map]")).toHaveCount(0);
  await field(page, "name").fill("Local recipe");
  await field(page, "volume").fill("1000");
  await page.getByRole("button", { name: "Add Component", exact: true }).click();
  await page.getByRole("button", { name: "Save Preparation Record" }).first().click();
  const r = await page.evaluate(() => JSON.parse(localStorage.getItem("lab-preparation-workbench.records.v1"))[0]);
  expect(r.inputs.components[0].inventory["Lot Number"]).toBe("LOCAL-LOT");
  expect(r.inputs.components[0].inventoryVersion).toMatch(/^local-/);
  expect(r.demo).toBe(false);
  expect(JSON.stringify(requests)).not.toContain(secret);
  await page.reload();
  await expect(page.locator(".inventory-source-label")).toContainText("Published Demo inventory");
  await page.locator("#inventory-query").fill(secret);
  await expect(page.locator(".inventory-results")).toHaveCount(0);
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator(".component-row")).toContainText("LOCAL-LOT");
});
test("bad local file retains and clearly identifies the previous valid source", async ({ page }) => {
  await mockInventory(page);
  await page.goto("#buffer");
  await page.locator("#inventory-query").waitFor();
  await choose(page);
  await expect(page.locator(".inventory-source-label")).toContainText("my-local-inventory.csv");
  await page.locator("#local-inventory-file").setInputFiles({ name: "bad.csv", mimeType: "text/csv", buffer: Buffer.from("Name,ID\nSalt,123") });
  await expect(page.getByText(/Local inventory could not be read:/)).toContainText("Missing required column: Barcode");
  await expect(page.locator(".inventory-source-label")).toContainText("my-local-inventory.csv");
  await page.locator("#inventory-query").fill(secret);
  await expect(page.locator(".inventory-results")).toContainText(secret);
  await page
    .locator("#local-inventory-file")
    .setInputFiles({ name: "unusable.csv", mimeType: "text/csv", buffer: Buffer.from("Chemical Name,CAS,Barcode\n,123,0002") });
  await expect(page.getByText(/Local inventory could not be read:/)).toContainText("No usable inventory records");
  await expect(page.locator(".inventory-source-label")).toContainText("my-local-inventory.csv");
  await expect(page.locator(".inventory-results")).toContainText(secret);
  await page.getByRole("button", { name: "Use Published Demo Inventory" }).click();
  await expect(page.locator(".inventory-source-label")).toContainText("Published Demo inventory");
});

test("a malformed worksheet row 583 is reported without blocking search and save of valid entries", async ({ page }) => {
  await mockInventory(page);
  await page.goto("#buffer");
  await page.locator("#inventory-query").waitFor();
  const workbook = new ExcelJS.Workbook(),
    sheet = workbook.addWorksheet("Inventory");
  sheet.addRow(["Chemical Name", "CAS", "Barcode", "Company", "Lot Number"]);
  sheet.addRow([secret, "123", "000001", "Local supplier", "LOCAL-LOT"]);
  sheet.getRow(583).values = ["", "123", "INVALID-NAME"];
  sheet.getRow(584).values = ["Second valid test", "123", "000002", "Other supplier", "OTHER-LOT"];
  const requests = [];
  page.on("request", (request) => requests.push(request.url()));
  await page
    .locator("#local-inventory-file")
    .setInputFiles({
      name: "local.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: Buffer.from(await workbook.xlsx.writeBuffer()),
    });
  await expect(page.locator(".inventory-source-label")).toContainText("local.xlsx");
  await expect(page.locator(".inventory-import-notice")).toContainText("2 of 3 records imported; 1 row excluded");
  await expect(page.locator(".inventory-import-notice")).toContainText("Row 583: Chemical Name");
  await page.getByRole("button", { name: "View excluded rows" }).click();
  await expect(page.locator("#detail-content")).toHaveValue(/Worksheet: Inventory[\s\S]*Row 583: Chemical Name/);
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await page.locator("#inventory-query").fill("INVALID-NAME");
  await expect(page.locator(".inventory-results")).toHaveCount(0);
  await page.locator("#inventory-query").fill(secret);
  await expect(page.locator(".inventory-results")).toContainText("LOCAL-LOT");
  await page.getByRole("button", { name: "Add Component", exact: true }).click();
  await field(page, "name").fill("Partial import recipe");
  await page.getByRole("button", { name: "Save Preparation Record" }).first().click();
  expect(requests).toEqual([]);
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator(".component-row")).toContainText("LOCAL-LOT");
});
test("local XLSX works even when published inventory fails to load", async ({ page }) => {
  await mockInventory(page, { fail: true, current: publishedInventory() });
  await page.goto("#buffer");
  await expect(page.getByText(/Unable to load built-in inventory/)).toBeVisible();
  const w = new ExcelJS.Workbook(),
    s = w.addWorksheet("Inventory");
  s.addRow(["Chemical Name", "CAS", "Barcode"]);
  s.addRow([secret, "123", "00001234"]);
  await page.locator("#local-inventory-file").setInputFiles({
    name: "private.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(await w.xlsx.writeBuffer()),
  });
  await expect(page.locator(".inventory-source-label")).toContainText("private.xlsx");
  await page.locator("#inventory-query").fill("00001234");
  await expect(page.locator(".inventory-results")).toContainText(secret);
});
test("a slow initial Demo response cannot overwrite a later explicit local file selection", async ({ page }) => {
  const p = publishedInventory();
  let release;
  const wait = new Promise((r) => (release = r));
  await page.route("**/inventory-manifest.json?*", async (route) => {
    await wait;
    await route.fulfill({ json: p.manifest });
  });
  await page.route(/\/inventory\.[a-f0-9]{16}\.json$/, (route) => route.fulfill({ body: p.text, contentType: "application/json" }));
  await page.goto("#buffer");
  await choose(page);
  await expect(page.locator(".inventory-source-label")).toContainText("my-local-inventory.csv");
  release();
  await page.waitForResponse((r) => r.url().includes(`inventory.${p.data.version}.json`));
  await expect(page.locator(".inventory-source-label")).toContainText("my-local-inventory.csv");
  await page.locator("#inventory-query").fill(secret);
  await expect(page.locator(".inventory-results")).toContainText(secret);
});
