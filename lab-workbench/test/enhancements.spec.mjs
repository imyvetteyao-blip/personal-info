import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { mockInventory, publishedInventory, field, detailField, setupBuffer, addComponent } from "./fixture.mjs";
const row = (p) => p.locator(".component-row").first();
test("built-in inventory ignores old uploaded cache, preserves search order and combines units and sub-location", async ({ page }) => {
  await mockInventory(page);
  await page.addInitScript(() => localStorage.setItem("lab.inventory.v1", JSON.stringify({ rows: [{ Name: "STALE UPLOAD" }] })));
  await page.goto("#buffer");
  await page.locator("#inventory-query").fill("DEMO-001");
  const headers = await page.locator(".inventory-results th").allTextContents();
  expect(headers).toEqual([
    "Add Component",
    "Chemical Name",
    "Location",
    "Amount",
    "Company",
    "Barcode",
    "CAS",
    "ID",
    "Lot Number",
    "State",
    "Grade",
    "Temperature",
  ]);
  await expect(page.locator(".inventory-results")).toContainText("500 mL");
  await expect(page.locator(".inventory-results")).toContainText("Shelf / A1");
  await expect(page.locator(".inventory-results")).toContainText("−20 °C");
  for (const n of await page.locator(".inventory-results .two-line").all())
    expect(await n.evaluate((e) => e.getBoundingClientRect().height)).toBeLessThanOrEqual(36.1);
  for (const n of await page.locator(".identifier-column .two-line").all())
    expect(await n.evaluate((e) => getComputedStyle(e).whiteSpace)).toBe("nowrap");
  await expect(page.locator("#inventory-file")).toHaveCount(0);
});
test("load failure is explicit rather than empty search results and can retry", async ({ page }) => {
  const state = { current: publishedInventory(), fail: true };
  await mockInventory(page, state);
  await page.goto("#buffer");
  await expect(page.getByText(/Unable to load built-in inventory/)).toBeVisible();
  await expect(page.getByText(/No matching inventory/)).toHaveCount(0);
  await expect(page.locator("#inventory-query")).toHaveCount(0);
  state.fail = false;
  await page.getByRole("button", { name: "Retry loading" }).click();
  await expect(page.locator("#inventory-query")).toBeVisible();
});
test("compact table defaults to one row per component; summary hides named fields even with values", async ({ page }) => {
  await mockInventory(page);
  await setupBuffer(page);
  await addComponent(page, "DEMO-002");
  await expect(page.locator(".component-row")).toHaveCount(2);
  await expect(page.locator(".component-details")).toHaveCount(0);
  await expect(page.locator(".component-grid th")).toHaveText([
    "Chemical Name",
    "Vendor",
    "MW (g/mol)",
    "Target Concentration",
    "Target Mass (mg)",
    "Target Liquid Volume (µL)",
    "Observation",
    "Error (%)",
    "Preparation Method",
    "Review",
  ]);
  await row(page).getByRole("button", { name: "Details", exact: true }).click();
  const s = page.locator(".snapshot");
  for (const name of [
    "Received Date",
    "MyChem",
    "Inventory Date (2024)",
    "TRGS Classification",
    "General Storage",
    "Inventory source",
    "Inventory Source",
  ])
    await expect(s.locator("b").filter({ hasText: new RegExp("^" + name.replace(/[()]/g, "\\$&") + "$") })).toHaveCount(0);
  await expect(s).toContainText("Count0");
  await expect(s).toContainText("Flagfalse");
  await expect(s).toContainText("SOP-1");
  await expect(s).toContainText("−20 °C");
  await page.screenshot({ path: "output/playwright/compact-components.png", fullPage: true });
});
test("main and expanded editing update together without focus or scroll loss", async ({ page }) => {
  await mockInventory(page);
  await setupBuffer(page);
  await field(page, "components.0.form").selectOption("solid");
  await field(page, "components.0.target").fill("10");
  await field(page, "components.0.actualMass").fill("1010");
  await expect(row(page).locator("td").nth(7)).toContainText("+1.00");
  await row(page).getByRole("button", { name: "Details", exact: true }).click();
  await detailField(page, "components.0.actualMass").fill("990");
  await expect(field(page, "components.0.actualMass")).toHaveValue("990");
  await expect(row(page).locator("td").nth(7)).toContainText("-1.00");
  expect(await page.evaluate(() => document.activeElement.id)).toContain("-detail-");
  await detailField(page, "components.0.reviewed").check();
  await field(page, "components.0.actualMass").fill("1000");
  await expect(detailField(page, "components.0.reviewed")).not.toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
test("stock details omit optional target/error controls and still calculate from actual preparation", async ({ page }) => {
  await mockInventory(page);
  await setupBuffer(page);
  await field(page, "components.0.form").selectOption("solid");
  await field(page, "components.0.target").fill(".097992265");
  await expect(page.locator(".component-details")).toHaveCount(0);
  await row(page).getByRole("button", { name: "Details", exact: true }).click();
  await detailField(page, "components.0.actualMass").fill("100");
  await detailField(page, "components.0.stockVolume").fill("10");
  await expect(row(page).locator("td").nth(7)).toHaveText("—");
  await expect(page.locator('[data-path*="stockTargetMass"]')).toHaveCount(0);
  await expect(page.locator(".component-details")).not.toContainText("Stock Weighing Error");
  await expect(page.locator(".component-details")).toContainText("979.92");
  await expect(detailField(page, "components.0.reviewed")).toBeEnabled();
});
test("published inventory refresh updates new searches but not saved or selected snapshots", async ({ page }) => {
  const state = { current: publishedInventory() };
  await mockInventory(page, state);
  await setupBuffer(page);
  await page.getByRole("button", { name: "Save Preparation Record" }).first().click();
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("lab-preparation-workbench.records.v1"))[0]);
  state.current = publishedInventory({
    version: "2222222222222222",
    company: "Demo supplier NEW",
    lot: "DEMO-NEW",
    updatedAt: "2026-01-02T00:00:00Z",
  });
  await page.reload();
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(row(page)).toContainText("Demo supplier A");
  await page.locator("#inventory-query").fill("DEMO-001");
  await expect(page.locator(".inventory-results")).toContainText("Demo supplier NEW");
  await page.getByRole("button", { name: "Add Component", exact: true }).click();
  await expect(page.locator(".component-row")).toHaveCount(2);
  await expect(page.locator(".component-row").nth(0)).toContainText("DEMO-LOT-A");
  await expect(page.locator(".component-row").nth(1)).toContainText("DEMO-NEW");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("lab-preparation-workbench.records.v1"))[0])).toEqual(before);
  expect(before.inputs.components[0].inventoryVersion).toBe("1111111111111111");
});
test("section Excel, observations, preparation fields and saved/reopened records agree", async ({ page }) => {
  await mockInventory(page);
  await setupBuffer(page);
  await field(page, "preparationLot").fill("B261191");
  await field(page, "preparationDate").fill("2026-01-02");
  await field(page, "targetPH").fill("7.4");
  await field(page, "components.0.form").selectOption("pure-liquid");
  await field(page, "components.0.density").fill("1.01");
  await field(page, "components.0.target").fill("10");
  await field(page, "components.0.observationMethod").selectOption("volume");
  await field(page, "components.0.actualLiquid").fill("1000");
  await expect(row(page).locator("td").nth(7)).toContainText("+1.00");
  await row(page).getByRole("button", { name: "Details", exact: true }).click();
  await detailField(page, "components.0.reviewed").check();
  await page.getByRole("button", { name: "Mark Reviewed", exact: true }).click();
  await page.getByRole("button", { name: "Save Preparation Record" }).first().click();
  await page.reload();
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(page.locator(".component-details")).toHaveCount(0);
  await expect(row(page).locator("td").nth(7)).toContainText("+1.00");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Preparation Excel" }).click();
  const w = new ExcelJS.Workbook();
  await w.xlsx.readFile(await (await event).path());
  const s = w.getWorksheet("Preparation");
  expect(s.columnCount).toBe(9);
  expect(s.getCell("A13").value).toBe("B. Components");
  expect(s.getCell("B5").value).toBe("B261191");
  expect(s.getCell("B6").value).toBe("2026-01-02");
  expect(s.getCell("B10").value).toBe(7.4);
  expect(s.getCell("B11").value).toBe("Reviewed");
  expect(s.getCell("I15").value).toBeCloseTo(1, 9);
  expect(s.getCell("H15").value).toContain("mass calculated from density");
  expect(s.getCell("A15").note).toContain("1111111111111111");
});
test("narrow buffer uses adaptive rows without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInventory(page);
  await setupBuffer(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await expect(page.locator(".component-details")).toHaveCount(0);
  expect(await page.locator(".component-grid-scroll").evaluate((e) => e.scrollWidth <= e.clientWidth + 1)).toBeTruthy();
  expect(await row(page).evaluate((e) => e.getBoundingClientRect().height)).toBeLessThan(650);
});
