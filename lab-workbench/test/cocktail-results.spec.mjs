import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { blankSIS, blankCocktail, blankStock, makeRecord } from "../src/models.mjs";
import { field } from "./fixture.mjs";
const stock = (page) => page.locator('.stock-card[data-stock-role="S"][data-cocktail-index="0"]');
const quantity = (page, kind) => stock(page).locator(`[data-stock-field="${kind}"]`);
const calc = (page) => page.locator(".cocktail-calculation").first();
const worksheet = (page) => page.locator(".transfer-worksheet").first();
async function load(page, legacy = false) {
  const inputs = blankSIS(),
    c = blankCocktail();
  inputs.name = "Cocktail fold test";
  inputs.cocktails = [c];
  Object.assign(c, { name: "A", volume: "600", assayVolume: "30" });
  for (const role of ["S", "IS"])
    c.stocks[role] = {
      ...blankStock(role),
      name: `Test ${role}`,
      source: "qnmr-amount",
      amount: "2",
      mw: "500",
      lot: "TEST-LOT",
      date: "2026-10-26",
      solvent: "Water",
      prepVolume: "2000",
      target: "100",
    };
  const record = makeRecord("sis", inputs);
  if (legacy) {
    for (const role of ["S", "IS"]) Object.assign(record.inputs.cocktails[0].stocks[role], { available: "invalid", availableUnit: "invalid" });
    record.results.errors = ["A: S: Available stock volume cannot exceed prepared volume."];
    record.results.cocktails[0].errors = ["S: Available stock volume cannot exceed prepared volume."];
  }
  await page.addInitScript((r) => {
    const key = "lab-preparation-workbench.records.v1";
    if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify([r]));
  }, record);
  await page.goto("#records");
  await page.getByRole("button", { name: "Open", exact: true }).click();
  return record;
}
test("single-stock input precedes a non-input result and each formula has only the active direction", async ({ page }) => {
  await load(page);
  await expect(page.locator('[data-path$=".available"],[data-path$=".availableUnit"]')).toHaveCount(0);
  await expect(page.getByText(/No inventory confirmation is required for Cocktail Making/)).toHaveCount(0);
  await field(page, "cocktails.0.stocks.S.volumeMode").selectOption("target");
  await quantity(page, "concentration").fill("2");
  await expect(quantity(page, "volume")).toHaveJSProperty("tagName", "OUTPUT");
  await expect(quantity(page, "volume")).toHaveAttribute("data-value", "1000");
  await expect(quantity(page, "volume")).toHaveText("1000.00 µL");
  await expect(stock(page).locator("input[data-stock-field]")).toHaveCount(1);
  expect(
    await stock(page)
      .locator(".single-stock-fields")
      .evaluate(
        (e) => e.querySelector("input[data-stock-field]").compareDocumentPosition(e.querySelector("output")) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
  ).toBeTruthy();
  await stock(page).locator("details summary").click();
  await expect(stock(page).locator(".formulas p")).toHaveCount(2);
  await expect(stock(page).locator(".formulas")).toContainText("V = n / C × 1000");
  await expect(stock(page).locator(".formulas")).not.toContainText("C = n / V");
  await field(page, "cocktails.0.stocks.S.target").fill("150");
  await expect(quantity(page, "volume")).toHaveAttribute("data-value", "1000");
  await expect(quantity(page, "concentration")).toHaveValue("2");
  await field(page, "cocktails.0.stocks.S.volumeMode").selectOption("manual");
  await quantity(page, "volume").fill("4000");
  await expect(quantity(page, "concentration")).toHaveJSProperty("tagName", "OUTPUT");
  await expect(quantity(page, "concentration")).toHaveAttribute("data-value", "0.5");
  await expect(quantity(page, "concentration")).toHaveText("0.50 mM");
  await expect(stock(page).locator(".notice.error li")).toHaveCount(1);
  await expect(stock(page).locator(".notice.error")).toContainText("Single-standard preparation volume must be <3000 µL.");
  await stock(page).locator("details summary").click();
  await expect(stock(page).locator(".formulas p")).toHaveCount(2);
  await expect(stock(page).locator(".formulas")).toContainText("C = n / V × 1000");
  await expect(stock(page).locator(".formulas")).not.toContainText("V = n / C");
});
test("A/B/C calculations and worksheets fold independently without changing saved data or review", async ({ page }) => {
  await page.goto("#cocktail");
  await page.getByRole("button", { name: "Load A / B / C demo" }).click();
  await page.getByRole("button", { name: "Confirm volume plan", exact: true }).click();
  await page.getByRole("button", { name: "Mark Reviewed", exact: true }).click();
  await page.getByRole("button", { name: "Save Preparation Record" }).first().click();
  const before = await page.evaluate(() => localStorage.getItem("lab-preparation-workbench.records.v1"));
  await expect(page.locator(".cocktail-calculation")).toHaveCount(3);
  await expect(page.locator(".transfer-worksheet")).toHaveCount(3);
  for (const body of await page.locator(".cocktail-fold-body").all()) await expect(body).toBeHidden();
  for (const [i, v] of ["1200.00", "600.00", "1200.00"].entries())
    await expect(page.locator(".cocktail-calculation").nth(i).locator(".cocktail-fold-summary")).toContainText(v);
  await calc(page).getByRole("button", { name: "Expand A Calculations", exact: true }).click();
  await expect(calc(page).locator(".cocktail-fold-body")).toBeVisible();
  await expect(worksheet(page).locator(".cocktail-fold-body")).toBeHidden();
  const b = page.locator(".transfer-worksheet").nth(1);
  await b.getByRole("button", { name: "Expand B Transfer Worksheet", exact: true }).click();
  await expect(b.locator(".cocktail-fold-body")).toBeVisible();
  await expect(page.locator(".cocktail-calculation").nth(1).locator(".cocktail-fold-body")).toBeHidden();
  await calc(page).getByRole("button", { name: "Collapse A Calculations", exact: true }).click();
  await expect(b.locator(".cocktail-fold-body")).toBeVisible();
  await expect(page.locator(".title-row .badge").first()).toHaveText("Reviewed");
  await expect(page.getByText("Unsaved changes", { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("lab-preparation-workbench.records.v1"))).toBe(before);
});
test("collapsed results update from upstream inputs and remain complete in saved records, reopened views and Excel", async ({ page }) => {
  await load(page);
  await expect(calc(page).locator(".cocktail-fold-body")).toBeHidden();
  await expect(worksheet(page).locator(".cocktail-fold-body")).toBeHidden();
  await field(page, "cocktails.0.stocks.S.volumeMode").selectOption("target");
  await quantity(page, "concentration").fill("2");
  await field(page, "cocktails.0.volume").fill("800");
  await expect(calc(page).locator(".cocktail-fold-summary")).toContainText("800.00");
  await expect(worksheet(page).locator(".results-table tbody tr").first().locator("td").last()).toHaveText("40.00");
  await expect(worksheet(page).locator(".solvent > strong")).toHaveText("680.00");
  await expect(worksheet(page).locator(".cocktail-fold-body")).toBeHidden();
  await page.getByRole("button", { name: "Mark Reviewed", exact: true }).click();
  await page.getByRole("button", { name: "Save Preparation Record" }).first().click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab-preparation-workbench.records.v1"))[0]);
  expect(saved.results.cocktails[0].rows[0].transferUL).toBe(40);
  expect(saved.results.cocktails[0].rows[0].stock.prepUL).toBe(1000);
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Preparation Excel" }).click();
  const w = new ExcelJS.Workbook();
  await w.xlsx.readFile(await (await event).path());
  const sheet = w.getWorksheet("Cocktails"),
    headers = sheet.getRow(12).values;
  expect(sheet.getCell(13, headers.indexOf("Stock Final Volume (µL)")).value).toBe(1000);
  expect(sheet.getCell(13, headers.indexOf("Stock Volume to Transfer (µL)")).value).toBe(40);
  expect(sheet.getCell(13, headers.indexOf("Solvent Volume to Add (µL)")).value).toBe(680);
  await page.reload();
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(calc(page).locator(".cocktail-fold-body")).toBeHidden();
  await expect(worksheet(page).locator(".cocktail-fold-body")).toBeHidden();
  await worksheet(page).getByRole("button", { name: "Expand A Transfer Worksheet", exact: true }).click();
  await expect(worksheet(page).locator(".solvent > strong")).toHaveText("680.00");
});
test("legacy availability errors disappear from the current workflow while original records remain intact", async ({ page }) => {
  const original = await load(page, true);
  await expect(page.locator('[data-path$=".available"],[data-path$=".availableUnit"]')).toHaveCount(0);
  await expect(quantity(page, "concentration")).toHaveText("1.00 mM");
  await expect(page.getByRole("button", { name: "Mark Reviewed", exact: true })).toBeEnabled();
  const raw = await page.evaluate(() => JSON.parse(localStorage.getItem("lab-preparation-workbench.records.v1"))[0]);
  expect(raw).toEqual(original);
  await page.getByRole("button", { name: "Mark Reviewed", exact: true }).click();
  await page.getByRole("button", { name: "Save Preparation Record" }).first().click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab-preparation-workbench.records.v1"))[0]);
  expect(saved.status).toBe("Reviewed");
  expect(saved.results.errors).toEqual([]);
});
