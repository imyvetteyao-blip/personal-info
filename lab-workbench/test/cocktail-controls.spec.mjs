import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { demoSIS, makeRecord } from "../src/models.mjs";
import { field } from "./fixture.mjs";
const path = (role, key) => `cocktails.0.stocks.${role}.${key}`;
const card = (page, role) => page.locator(`.stock-card[data-stock-role="${role}"][data-cocktail-index="0"]`);
const control = (page, role, kind) => card(page, role).locator(`[data-stock-field="${kind}"]`);
async function savedCocktail(page, legacy = false) {
  const appAlreadyLoaded = page.url().startsWith("http");
  const data = demoSIS();
  data.name = "Existing cocktail record";
  data.cocktails = [data.cocktails[1]];
  const record = makeRecord("sis", data);
  if (legacy) {
    delete record.results.coordinationRequired;
    delete record.calendarDates;
  }
  await page.addInitScript((r) => {
    const key = "lab-preparation-workbench.records.v1";
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify([r]));
  }, record);
  await page.goto("#records");
  if (appAlreadyLoaded) await page.reload();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  return record;
}
test("Cocktail Making replaces visible module names while old links and sis records still open", async ({ page }) => {
  await page.goto("#sis");
  await expect(page.getByRole("heading", { name: "Cocktail Making", exact: true })).toBeVisible();
  await page.goto("#cocktail");
  await expect(page.getByRole("heading", { name: "Cocktail Making", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Cocktail Making", exact: true })).toHaveAttribute("href", "#cocktail");
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Cocktail Making", exact: true })).toBeVisible();
  await expect(page.getByText("S/IS Making", { exact: true })).toHaveCount(0);
  const record = await savedCocktail(page, true);
  await expect(field(page, "name")).toHaveValue(record.name);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("lab-preparation-workbench.records.v1"))[0]);
  expect(stored).toEqual(record);
  expect(stored.kind).toBe("sis");
});
test("S and IS independently show an editable input followed by a calculated output", async ({ page }) => {
  await savedCocktail(page);
  const s = card(page, "S"),
    is = card(page, "IS");
  await expect(s.locator('[data-stock-field="volume"]')).toHaveCount(1);
  await expect(s.locator('[data-stock-field="concentration"]')).toHaveCount(1);
  await expect(control(page, "S", "volume")).toBeEditable();
  await expect(control(page, "S", "concentration")).toHaveJSProperty("tagName", "OUTPUT");
  await field(page, path("IS", "volumeMode")).selectOption("target");
  await expect(control(page, "IS", "volume")).toHaveJSProperty("tagName", "OUTPUT");
  await expect(control(page, "IS", "concentration")).toBeEditable();
  await expect(control(page, "S", "volume")).toBeEditable();
  await expect(is.getByLabel("Desired Stock Concentration (mM)", { exact: true })).toHaveValue("1");
  await expect(control(page, "IS", "volume")).toHaveText("2000.00 µL");
  expect(await is.locator(".single-stock-fields > label").evaluateAll((nodes) => nodes.slice(0, 2).map((e) => e.textContent.trim()))).toEqual([
    "Solvent",
    "Desired Stock Concentration (mM)",
  ]);
  await expect(page.locator('[data-path$=".volumeBasis"],[data-path$=".prepUnit"],[data-path$=".desiredUnit"]')).toHaveCount(0);
  await expect(page.locator(".stock-card .result-strip")).toHaveCount(0);
});
test("mode switches retain raw precision and do not duplicate fields or update cocktail targets", async ({ page }) => {
  await savedCocktail(page);
  await field(page, path("S", "source")).selectOption("weight");
  await field(page, path("S", "mass")).fill("17.6543219876543");
  await field(page, path("S", "mw")).fill("555.7");
  await control(page, "S", "volume").fill("1789.12345678901");
  const precision = Number(await control(page, "S", "concentration").getAttribute("data-value"));
  const before = await page.locator(".results-table tbody tr").allTextContents();
  for (let i = 0; i < 12; i++) {
    await field(page, path("S", "volumeMode")).selectOption("target");
    expect(Number(await control(page, "S", "concentration").inputValue())).toBe(precision);
    await field(page, path("S", "volumeMode")).selectOption("manual");
    expect(Number(await control(page, "S", "volume").inputValue())).toBe(Number("1789.12345678901"));
  }
  expect(await page.locator(".results-table tbody tr").allTextContents()).toEqual(before);
  await expect(field(page, path("S", "target"))).toHaveValue("100");
  await expect(control(page, "S", "concentration")).toHaveCount(1);
});
test("typing decimal stock inputs preserves every character and trailing zero through mode switches", async ({ page }) => {
  await savedCocktail(page);
  await control(page, "S", "volume").fill("");
  await control(page, "S", "volume").pressSequentially("1789.1234567890100");
  await expect(control(page, "S", "volume")).toHaveValue("1789.1234567890100");
  await field(page, path("S", "volumeMode")).selectOption("target");
  await control(page, "S", "concentration").fill("");
  await control(page, "S", "concentration").pressSequentially("1.2300");
  await expect(control(page, "S", "concentration")).toHaveValue("1.2300");
  await field(page, path("S", "volumeMode")).selectOption("manual");
  await field(page, path("S", "volumeMode")).selectOption("target");
  await expect(control(page, "S", "concentration")).toHaveValue("1.2300");
});
test("already sufficient IS aliquots hide coordination and allow reviewed export without redundant confirmation", async ({ page }) => {
  await savedCocktail(page, true);
  await expect(page.locator(".plan-table")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Confirm volume plan", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Mark Reviewed", exact: true }).click();
  await page.getByRole("button", { name: "Save Preparation Record", exact: true }).first().click();
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Preparation Excel" }).click();
  const download = await event;
  expect(download.suggestedFilename()).toMatch(/^demo-cocktail-/);
  const w = new ExcelJS.Workbook();
  await w.xlsx.readFile(await download.path());
  expect(w.getWorksheet("Cocktails").getCell("B5").value).toBe("Reviewed");
  await page.locator("#cocktail-volume-settings summary").click();
  await field(page, "minimum").fill("80");
  await expect(page.locator("#cocktail-volume-settings")).toHaveAttribute("open", "");
  await expect(page.locator(".plan-table")).toBeVisible();
  await field(page, "minimum").fill("20");
  await expect(page.locator(".plan-table")).toHaveCount(0);
  await page.getByRole("button", { name: "Match Batch Volumes", exact: true }).click();
  await expect(page.locator(".plan-table")).toBeVisible();
  await page.getByRole("button", { name: "Use automatic plan", exact: true }).click();
  await expect(page.locator(".plan-table")).toHaveCount(0);
});
test("desired concentration and an actual final-volume change update transfer, solvent, per-assay, saved records and Excel", async ({ page }) => {
  await savedCocktail(page);
  await field(page, path("IS", "volumeMode")).selectOption("target");
  await control(page, "IS", "concentration").fill("2");
  await expect(control(page, "IS", "volume")).toHaveText("1000.00 µL");
  let rows = page.locator(".results-table tbody tr");
  await expect(rows.nth(1).locator("td").last()).toHaveText("35.00");
  await expect(page.locator(".solvent > strong")).toHaveText("505.00");
  await field(page, path("IS", "volumeMode")).selectOption("manual");
  await control(page, "IS", "volume").fill("1500");
  await expect(control(page, "IS", "concentration")).toHaveText("1.33 mM");
  await expect(rows.nth(1).locator("td").last()).toHaveText("52.50");
  await expect(rows.nth(1).locator("td").nth(4)).toHaveText("2.63");
  await expect(page.locator(".solvent > strong")).toHaveText("487.50");
  await page.getByRole("button", { name: "Save Preparation Record" }).first().click();
  await page.reload();
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(control(page, "IS", "volume")).toHaveValue("1500");
  await expect(rows.nth(1).locator("td").last()).toHaveText("52.50");
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Preparation Excel" }).click();
  const w = new ExcelJS.Workbook();
  await w.xlsx.readFile(await (await event).path());
  const sheet = w.getWorksheet("Cocktails"),
    headers = sheet.getRow(12).values;
  expect(sheet.getCell(14, headers.indexOf("Stock Final Volume (µL)")).value).toBe(1500);
  expect(sheet.getCell(14, headers.indexOf("Stock Concentration (mM)")).value).toBeCloseTo(4 / 3, 14);
});
test("volume limits and the existing IS scaling rule work in concentration mode on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 1000 });
  await savedCocktail(page);
  await field(page, path("IS", "volumeMode")).selectOption("target");
  await control(page, "IS", "concentration").fill(".5");
  await expect(card(page, "IS")).toContainText("<3000 µL");
  await expect(page.getByRole("button", { name: "Mark Reviewed" })).toBeDisabled();
  await control(page, "IS", "concentration").fill("10");
  await expect(control(page, "IS", "volume")).toHaveText("200.00 µL");
  await expect(page.locator(".plan-table")).toBeVisible();
  await expect(page.locator(".plan-table tbody tr td").nth(5)).toHaveText("20.00");
  await page.getByRole("button", { name: "Confirm volume plan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Mark Reviewed" })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  for (const stock of await page.locator(".stock-card").all()) expect(await stock.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBeTruthy();
});
