import { convertInventory, selectInventorySource } from "./inventory/convert.mjs";
const source = await selectInventorySource({ demo: process.argv.includes("--demo") });
if (source.classification !== "demo")
  throw new Error(
    "Private inventory cannot be published to this public GitHub Pages site. Use --demo to build only Demo inventory; validate private sources separately.",
  );
// All validation finishes before any public output is written.
const inventory = await convertInventory({ source: source.path, classification: source.classification });
import { build } from "esbuild";
import { readFile, mkdir, writeFile, readdir, unlink, rename } from "node:fs/promises";
const root = new URL("./", import.meta.url);
const { outputFiles } = await build({
  entryPoints: [new URL("src/app.mjs", root).pathname],
  bundle: true,
  format: "iife",
  target: "es2022",
  write: false,
});
const css = await readFile(new URL("src/style.css", root), "utf8");
const vendor = await readFile(new URL("node_modules/exceljs/dist/exceljs.min.js", root), "utf8");
const safe = (text) => text.replace(/<\/script/gi, "<\\/script");
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Lab Preparation Workbench</title><link rel="icon" href="data:,"><style>${css}</style></head><body>
<a class="skip-link" href="#main">Skip to workbench</a><div id="app"></div><div id="toast" class="toast" role="status" aria-live="polite"></div><noscript>This workbench requires JavaScript.</noscript>
<script>${safe(vendor)}</script><script>${safe(outputFiles[0].text)}</script></body></html>`;
const output = new URL("../docs/", root);
await mkdir(output, { recursive: true });
async function atomic(name, data) {
  const tmp = new URL(name + ".tmp", output);
  await writeFile(tmp, data);
  await rename(tmp, new URL(name, output));
}
await atomic(inventory.manifest.file, inventory.data);
await atomic("index.html", html);
await atomic(".nojekyll", "");
await atomic("EXCELJS-LICENSE.txt", (await readFile(new URL("node_modules/exceljs/LICENSE", root), "utf8")).trimEnd() + "\n");
await atomic("inventory-manifest.json", JSON.stringify(inventory.manifest));
for (const f of await readdir(output))
  if (/^inventory\.[a-f0-9]{16}\.json$/.test(f) && f !== inventory.manifest.file) await unlink(new URL(f, output));
console.log(`Built public Demo workbench with ${inventory.manifest.count} inventory entries; version ${inventory.manifest.version}.`);
