import { build } from "esbuild";
import { readFile, mkdir, writeFile } from "node:fs/promises";
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
await mkdir(new URL("../docs/", root), { recursive: true });
await writeFile(new URL("../docs/index.html", root), html);
console.log("Built docs/index.html with all scripts and styles embedded.");

await writeFile(new URL("../docs/.nojekyll", root), "");
await writeFile(new URL("../docs/EXCELJS-LICENSE.txt", root), (await readFile(new URL("node_modules/exceljs/LICENSE", root), "utf8")).trimEnd() + "\n");
