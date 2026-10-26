import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { mockInventory, publishedInventory, setupBuffer, field, detailField } from "./fixture.mjs";

async function noHorizontalOverflow(page) {
  const failures = await page.evaluate(() => {
    const containers = [
      ...document.querySelectorAll(
        ".shell,.workspace,.panel,.panel-body,.table-wrap,.component-grid-scroll,table,.component-details,.stock-card,.snapshot,.actions,.nav,.grid,.result-strip,.solvent,dialog[open]",
      ),
    ];
    return containers
      .filter((e) => e.getClientRects().length)
      .flatMap((e) => {
        const r = e.getBoundingClientRect(),
          css = getComputedStyle(e);
        const issue = r.left < -1 || r.right > innerWidth + 1 || e.scrollWidth > e.clientWidth + 1 || ["hidden", "clip"].includes(css.overflowX);
        return issue
          ? [
              {
                tag: e.tagName,
                class: e.className,
                left: r.left,
                right: r.right,
                width: e.clientWidth,
                scroll: e.scrollWidth,
                overflow: css.overflowX,
              },
            ]
          : [];
      });
  });
  expect(failures).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBeTruthy();
}

test("selected Preparation Date updates its day number immediately and survives record and Excel export", async ({ page }) => {
  await mockInventory(page);
  await setupBuffer(page);
  const output = page.locator(".date-field output");
  await expect(output).toBeEmpty();
  for (const [date, label] of [
    ["2026-01-01", "Day 1 of 2026"],
    ["2026-10-26", "Day 299 of 2026"],
    ["2028-12-31", "Day 366 of 2028"],
  ]) {
    await field(page, "preparationDate").fill(date);
    await expect(output).toHaveText(label);
  }
  await page.getByRole("button", { name: "Save Preparation Record" }).first().click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab-preparation-workbench.records.v1"))[0]);
  expect(saved.calendarDates.preparation.dayOfYear).toBe(366);
  await page.reload();
  await page.getByRole("link", { name: "Records", exact: true }).click();
  await page.getByRole("button", { name: "Open", exact: true }).click();
  await expect(output).toHaveText("Day 366 of 2028");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Preparation Excel" }).click();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await (await download).path());
  expect(workbook.getWorksheet("Preparation").getCell("B6").value).toBe("2028-12-31");
  expect(workbook.getWorksheet("Preparation").getCell("B12").value).toBe(366);
  await field(page, "preparationDate").fill("");
  await expect(output).toBeEmpty();
});

for (const width of [320, 390, 768, 1024, 1280, 1440, 1920]) {
  test(`all pages and expanded stock details fit ${width}px without horizontal scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const name = "A long exact chemical name with hydrate and stereochemistry that remains available in full";
    await mockInventory(page, { current: publishedInventory({ name }) });
    await setupBuffer(page);
    const first = page.locator(".inventory-results tbody tr").first();
    await expect(first.locator("td").first().getByRole("button", { name: "Add Component", exact: true })).toBeVisible();
    expect((await first.locator("td").nth(1).textContent()).trim()).toBe(name);
    const addBox = await first.getByRole("button", { name: "Add Component", exact: true }).boundingBox();
    expect(addBox.x).toBeGreaterThanOrEqual(0);
    expect(addBox.x + addBox.width).toBeLessThanOrEqual(width);
    await field(page, "components.0.form").selectOption("solid");
    await field(page, "components.0.target").fill(".097992265");
    await page.locator(".component-row").getByRole("button", { name: "Details", exact: true }).click();
    await detailField(page, "components.0.actualMass").fill("100");
    await detailField(page, "components.0.stockVolume").fill("10");
    await expect(page.locator('[data-path*="stockTargetMass"]')).toHaveCount(0);
    await expect(page.locator(".component-details")).not.toContainText("Stock Weighing Error");
    await expect(page.locator(".component-details")).not.toContainText("Actual Final Concentration");
    await expect(page.locator(".component-details")).toContainText("979.92");
    await expect(page.locator('[data-path="components.0.actualTransfer"]')).toHaveCount(1);
    await detailField(page, "components.0.reviewed").check();
    await noHorizontalOverflow(page);
    await page.locator(".component-details summary").click();
    await noHorizontalOverflow(page);
    await page.locator(".component-name").click();
    await expect(page.locator("#detail-content")).toHaveValue(name);
    await noHorizontalOverflow(page);
    await page.getByRole("button", { name: "Close", exact: true }).click();
    await detailField(page, "components.0.method").selectOption("existing");
    await expect(page.locator('[data-path="components.0.actualTransfer"]')).toHaveCount(1);
    await noHorizontalOverflow(page);
    await field(page, "components.0.form").selectOption("solution");
    await field(page, "components.0.observationMethod").selectOption("mass");
    await field(page, "components.0.density").fill("1.01");
    await noHorizontalOverflow(page);
    await page.getByRole("button", { name: "Save Preparation Record" }).first().click();
    await page.getByRole("link", { name: "Records", exact: true }).click();
    await noHorizontalOverflow(page);
    await page.getByRole("link", { name: "Cocktail Making", exact: true }).click();
    await page.getByRole("button", { name: "Load A / B / C demo" }).click();
    await noHorizontalOverflow(page);
    for (const toggle of await page.locator('[data-action="toggle-cocktail-calculation"],[data-action="toggle-transfer-worksheet"]').all())
      await toggle.click();
    await noHorizontalOverflow(page);
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await noHorizontalOverflow(page);
  });
}

test("S/IS preparation dates also display and export the selected day of year", async ({ page }) => {
  await page.goto("#sis");
  await field(page, "cocktails.0.stocks.S.date").fill("2026-01-01");
  await expect(page.locator(".date-field").first().locator("output")).toHaveText("Day 1 of 2026");
  await page.getByRole("button", { name: "Save Preparation Record" }).first().click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("lab-preparation-workbench.records.v1"))[0]);
  expect(saved.calendarDates.stocks[0].dayOfYear).toBe(1);
  const event = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Preparation Excel" }).click();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(await (await event).path());
  const sheet = workbook.getWorksheet("Cocktails"),
    column = sheet.getRow(12).values.indexOf("Day of Year");
  expect(sheet.getCell(13, column).value).toBe("Day 1 of 2026");
});
