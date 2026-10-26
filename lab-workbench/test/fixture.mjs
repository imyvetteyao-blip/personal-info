import { createHash } from "node:crypto";
import { inventoryMapping } from "../src/inventory-config.mjs";
export function publishedInventory({
  version = "1111111111111111",
  company = "Demo supplier A",
  lot = "DEMO-LOT-A",
  name = "A long chemical name that remains first in the table and keeps its full original snapshot",
  updatedAt = "2026-01-01T00:00:00Z",
} = {}) {
  const rows = [
    {
      "Chemical Name": name,
      Location: "Shelf",
      "Sub-location": "A1",
      Amount: 500,
      Units: "mL",
      Company: company,
      "Vendor ID": "A2485",
      Barcode: "DEMO-001",
      CAS: "000-12-3",
      ID: "DEMO-ID-001",
      "Lot Number": lot,
      State: "Solid",
      Grade: "Demo",
      Temperature: "−20 °C",
      MW: 100,
      Density: "",
      "Received Date": "2026-01-01",
      MyChem: "yes",
      "Inventory Date (2024)": "2024-01-01",
      "TRGS Classification": "class",
      "General Storage": "storage",
      "Inventory Source": "old source",
      SOP: "SOP-1",
      "PHS Label": "Label",
      Count: 0,
      Flag: false,
    },
    {
      "Chemical Name": "Second stock compound",
      Barcode: "DEMO-002",
      CAS: "123-45-6",
      Company: "Demo supplier B",
      "Lot Number": "DEMO-ONLY",
      MW: 100,
    },
  ];
  const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))],
    mapping = inventoryMapping(headers),
    data = {
      schema: "lab-inventory",
      schemaVersion: 1,
      version,
      updatedAt,
      demo: true,
      classification: "demo",
      headers,
      mapping,
      source: "demo.csv",
      rows,
    };
  const text = JSON.stringify(data),
    manifest = {
      schema: "lab-inventory-manifest",
      version,
      updatedAt,
      count: rows.length,
      file: `inventory.${version}.json`,
      sha256: createHash("sha256").update(text).digest("hex"),
    };
  return { data, text, manifest };
}
export async function mockInventory(page, state = { current: publishedInventory() }) {
  await page.route("**/inventory-manifest.json?*", (route) =>
    state.fail ? route.fulfill({ status: 503, body: "unavailable" }) : route.fulfill({ json: state.current.manifest }),
  );
  await page.route(/\/inventory\.[a-f0-9]{16}\.json$/, (route) => route.fulfill({ body: state.current.text, contentType: "application/json" }));
  return state;
}
export const field = (p, path) => p.locator(`[data-path="${path}"]`).first();
export async function addComponent(p, barcode = "DEMO-001") {
  await p.locator("#inventory-query").fill(barcode);
  await p.getByRole("button", { name: "Add Component", exact: true }).click();
}
export async function setupBuffer(p) {
  await p.goto("#buffer");
  await p.locator("#inventory-query").waitFor();
  await field(p, "name").fill("Compact preparation");
  await field(p, "volumeUnit").selectOption("mL");
  await field(p, "volume").fill("1000");
  await addComponent(p);
}
export const detailField = (p, path) => p.locator(`.component-details [data-path="${path}"]`);
