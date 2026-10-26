export function validateBuiltinInventory(data, manifest) {
  if (
    !data ||
    data.schema !== "lab-inventory" ||
    data.schemaVersion !== 1 ||
    !Array.isArray(data.rows) ||
    !data.rows.length ||
    !Array.isArray(data.headers) ||
    !data.mapping?.name ||
    !data.mapping?.barcode
  )
    throw new Error("Published inventory is empty or invalid.");
  if (data.version !== manifest.version || data.updatedAt !== manifest.updatedAt || data.rows.length !== manifest.count)
    throw new Error("Published inventory does not match its version manifest.");
  if (!Number.isFinite(Date.parse(data.updatedAt))) throw new Error("Published inventory has an invalid update time.");
  return data;
}
export async function loadBuiltinInventory({ base = location.href, fetcher = fetch, now = Date.now() } = {}) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    const url = new URL("inventory-manifest.json", base);
    url.searchParams.set("refresh", String(now));
    const response = await fetcher(url, { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error(`Inventory manifest request failed (HTTP ${response.status}).`);
    const manifest = await response.json();
    if (
      manifest.schema !== "lab-inventory-manifest" ||
      !/^[a-f0-9]{16}$/.test(manifest.version) ||
      manifest.file !== `inventory.${manifest.version}.json` ||
      !Number.isInteger(manifest.count) ||
      manifest.count < 1
    )
      throw new Error("Published inventory manifest is invalid.");
    const dataResponse = await fetcher(new URL(manifest.file, url), { cache: "no-store", signal: controller.signal });
    if (!dataResponse.ok) throw new Error(`Inventory data request failed (HTTP ${dataResponse.status}).`);
    const text = await dataResponse.text();
    if (globalThis.crypto?.subtle && manifest.sha256) {
      const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      if (digest !== manifest.sha256) throw new Error("Published inventory checksum does not match.");
    }
    return validateBuiltinInventory(JSON.parse(text), manifest);
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "Built-in inventory loading timed out." : e.message);
  } finally {
    clearTimeout(timer);
  }
}
