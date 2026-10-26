import { RULE_VERSION, below, calculateBufferComponent, calculateSingle, calculateSIS, volumeUL } from "./calculations.mjs";
import {
  uid,
  blankBuffer,
  blankSIS,
  blankCocktail,
  componentFromRow,
  demoSIS,
  evaluate,
  makeRecord,
  readRecords,
  saveRecord,
  removeRecord,
  decodeRecord,
  copyRecord,
} from "./models.mjs";
import { matchingRows } from "./inventory.mjs";
import { isMeaningful } from "./inventory-config.mjs";
import { INVENTORY_COLUMNS, inventoryValue, summaryEntries, vendorDescription } from "./inventory-view.mjs";
import { loadBuiltinInventory } from "./builtin-inventory.mjs";
import { readLocalInventory, localInventoryReportText } from "./local-inventory.mjs";
import { formatResult } from "./format.mjs";
import { createPreparationWorkbook } from "./excel.mjs";

const app = document.querySelector("#app");
const editors = {
  buffer: { inputs: blankBuffer(), status: "Draft", dirty: false },
  sis: { inputs: blankSIS(), status: "Draft", dirty: false },
};
let route = location.hash.slice(1) || "home",
  records = [],
  inventory = null,
  query = "",
  inventoryLoading = true,
  inventoryError = "",
  storageError = "",
  notice = "";
try {
  records = readRecords();
  // Legacy uploaded inventory is deliberately ignored; only the published built-in version is used.
} catch (e) {
  storageError = `Browser storage could not be read: ${e.message}`;
}
const escape = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const fmt = (v, signed = false) => {
  const text = escape(formatResult(v, { signed }));
  return v == null || !Number.isFinite(v)
    ? text
    : `<span class="calculated-value" tabindex="0" role="button" data-action="precision" data-value="${v}" title="Full precision: ${v}">${text}</span>`;
};
const units = {
  mass: ["mg", "g", "µg"],
  volume: ["µL", "mL", "L"],
  concentration: ["mmol/L", "mol/L", "µmol/L", "g/L", "mg/mL"],
  molar: ["mmol/L", "mol/L", "µmol/L"],
};
let fieldScope = "";
const expandedComponents = new Set();
let inventoryRequest = 0;
const editor = () => editors[route];
function get(obj, path) {
  return path.split(".").reduce((o, k) => o?.[k], obj);
}
function set(obj, path, value) {
  const keys = path.split(".");
  if (keys.some((k) => ["__proto__", "constructor", "prototype"].includes(k))) throw new Error("Invalid field.");
  let o = obj;
  for (const k of keys.slice(0, -1)) o = o[k];
  o[keys.at(-1)] = value;
}
function input(path, label, placeholder = "", type = "text") {
  const value = get(editor().inputs, path);
  return `<label class="field">${escape(label)}<input data-path="${path}" id="f-${path}${fieldScope}" type="${type}" ${type === "text" && /(mass|mw|target|volume|density|concentration|available|minimum|threshold|amount|actual|prepVolume|sampleVolume)/i.test(path) ? 'inputmode="decimal"' : ""} value="${escape(value)}" placeholder="${escape(placeholder)}" autocomplete="off"></label>`;
}
function select(path, label, options) {
  const value = get(editor().inputs, path);
  return `<label class="field">${escape(label)}<select data-path="${path}" id="f-${path}${fieldScope}">${options
    .map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${escape(v)}" ${value === v ? "selected" : ""}>${escape(l)}</option>`;
    })
    .join("")}</select></label>`;
}
function quantity(path, label, unitPath, options, placeholder = "") {
  return `<label class="field">${escape(label)}<span class="unit-field"><input id="f-${path}${fieldScope}" data-path="${path}" inputmode="decimal" value="${escape(get(editor().inputs, path))}" placeholder="${escape(placeholder)}" autocomplete="off"><select id="f-${unitPath}${fieldScope}" data-path="${unitPath}" aria-label="${escape(label)} unit">${options.map((u) => `<option ${get(editor().inputs, unitPath) === u ? "selected" : ""}>${escape(u)}</option>`).join("")}</select></span></label>`;
}
const checkbox = (path, label, disabled = false) =>
  `<label class="check"><input type="checkbox" data-path="${path}" id="f-${path}${fieldScope}" ${get(editor().inputs, path) ? "checked" : ""} ${disabled ? "disabled" : ""}>${escape(label)}</label>`;
const button = (action, label, cls = "", extra = "") => `<button type="button" data-action="${action}" class="${cls}" ${extra}>${label}</button>`;
const formula = (items) =>
  items?.length
    ? `<details><summary>View formulas &amp; substituted values</summary><div class="formulas">${items.map((i) => `<p>${escape(i)}</p>`).join("")}</div></details>`
    : "";
const messages = (items, type = "error") =>
  items?.length
    ? `<div class="notice ${type}" role="${type === "error" ? "status" : "note"}"><strong>${type === "error" ? "Needs attention" : "Preparation note"}</strong><ul>${[...new Set(items)].map((i) => `<li>${escape(i)}</li>`).join("")}</ul></div>`
    : "";
const badge = (text, cls = "") => `<span class="badge ${cls}">${escape(text)}</span>`;
function results() {
  const e = editor();
  return e.snapshot && !e.dirty ? e.snapshot.results : evaluate(route, e.inputs);
}
function invalidate() {
  const e = editor();
  e.status = "Draft";
  e.dirty = true;
  e.snapshot = null;
  if (route === "sis") e.inputs.confirmed = false;
  else
    e.inputs.components.forEach((c) => {
      c.reviewed = false;
      if (c.observationMethod == null) c.observationMethod = "volume";
      if (c.stockObservationMethod == null) c.stockObservationMethod = "mass";
    });
}
function normalizePreparationMethods() {
  if (route !== "buffer") return;
  const b = editor().inputs;
  for (const c of b.components) {
    const r = calculateBufferComponent(c, b.volume, b.volumeUnit);
    if (r.method) c.method = r.method;
  }
}
function toast(text) {
  const el = document.querySelector("#toast");
  el.textContent = text;
  el.classList.add("visible");
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("visible"), 6000);
}
function header() {
  return `<header class="header"><a href="#home" class="brand"><span class="logo"><svg viewBox="0 0 24 26" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 2h8M10 2v8L4 21a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-11V2M7 17h10"/><circle cx="11" cy="20" r=".8"/></svg></span><span>Lab Preparation Workbench<small>PRECISION IN EVERY PREPARATION</small></span></a><nav class="nav" aria-label="Main navigation">${[
    ["home", "Overview"],
    ["buffer", "Buffer Making"],
    ["sis", "S/IS Making"],
    ["records", "Records"],
  ]
    .map(([r, l]) => `<a href="#${r}" class="${route === r ? "active" : ""}" ${route === r ? 'aria-current="page"' : ""}>${l}</a>`)
    .join("")}</nav><span class="local"><span class="dot"></span>Browser local workspace</span></header>`;
}
function home() {
  return `<div class="home-hero"><div class="eyebrow">YOUR LAB, ORGANIZED</div><h1>Prepare with confidence.<br>Keep every calculation clear.</h1><p>A practical workspace for buffer recipes, single standards, and S/IS cocktails. From your first input to a reviewed preparation record.</p></div><div class="module-grid"><a class="module" href="#buffer"><div class="module-icon">Bf</div><h2>Buffer Making</h2><p>Build a complete buffer recipe from your local inventory file or the published Demo inventory. Calculate quantities and record actual preparation.</p><span class="module-link">Start a buffer preparation &nbsp; →</span></a><a class="module" href="#sis"><div class="module-icon">S/IS</div><h2>S/IS Making</h2><p>Prepare single standards, coordinate cocktail volumes, and review every stock transfer.</p><span class="module-link">Open the S/IS workbench &nbsp; →</span></a><div class="module"><div class="module-icon">···</div><h2>Other Preparation</h2><p>More preparation workflows will be available here.</p><span>${badge("Coming soon")}</span></div></div><div class="notice">Preparation records stay in this browser. Local inventory files are processed in your browser. Published Demo data is maintained by the developer. No company system or backend is connected. Export preparation Excel files for documentation; browser data can be cleared.</div><div class="stats"><div><h3>01 &nbsp; Define your preparation</h3><p>Use explicit units, inventory snapshots, and stock details.</p></div><div><h3>02 &nbsp; Check the calculation</h3><p>Inspect formulas, volume plans, and validation before review.</p></div><div><h3>03 &nbsp; Keep a useful record</h3><p>Save locally, reopen, export a preparation Excel workbook.</p></div></div>`;
}
function title() {
  const e = editor();
  return `<div class="title-row"><div><div class="eyebrow">PREPARATION WORKSPACE</div><h1>${route === "buffer" ? "Buffer Making" : "S/IS Making"}</h1><p class="subtitle">${route === "buffer" ? "One recipe. One final volume. Every component accounted for." : "Single standards and coordinated cocktails, with a traceable calculation for every transfer."}</p></div><div class="actions">${badge(e.status, e.status === "Reviewed" ? "teal" : "amber")}${e.dirty ? badge("Unsaved changes") : ""}${button("new", "New preparation")}${button("save", "Save Preparation Record", "primary")}</div></div>${e.inputs.demo ? '<div class="notice warning"><strong>Demo data</strong> — Example values for testing only. This preparation remains marked as demo in saved records and Excel workbooks.</div>' : ""}${e.snapshot ? `<div class="notice saved-banner"><strong>Saved record reopened.</strong> Saved results and rule version ${escape(e.snapshot.ruleVersion)} are preserved. Editing an input recalculates results and requires a new review.${e.snapshot.imported ? " Imported records require local review." : ""}<details><summary>View saved snapshot</summary><pre>${escape(JSON.stringify(e.snapshot, null, 2))}</pre></details></div>` : ""}`;
}
function inventorySourceControls() {
  return `<div class="inventory-source-controls"><label class="field">Choose Local Inventory (CSV / XLSX)<input class="file-input" id="local-inventory-file" type="file" accept=".csv,.tsv,.xlsx"></label>${inventory?.sourceType === "local" ? button("reload-inventory", "Use Published Demo Inventory") : ""}</div><p class="help">Local files are read only in this browser, not uploaded to a server or GitHub. The full inventory stays in memory; select it again after a refresh. Saved component snapshots remain in this browser.</p>`;
}
function inventoryImportNotice() {
  const report = inventory?.importReport;
  if (!report) return "";
  if (!report.excludedRows) return `<p class="help" role="status">${report.importedRows} records imported successfully.</p>`;
  return `<div class="notice warning inventory-import-notice" role="status"><strong>Partial inventory import: ${report.importedRows} of ${report.totalRows} records imported; ${report.excludedRows} ${report.excludedRows === 1 ? "row" : "rows"} excluded.</strong><p>Valid entries are ready to search. Excluded rows are unavailable for search. Correct the source file and select it again to include them. No names or values were invented.</p><ul>${report.issues
    .slice(0, 5)
    .map((issue) => `<li>Row ${issue.row}: ${escape(issue.problems.join(" "))}</li>`)
    .join(
      "",
    )}</ul>${button("inventory-import-issues", "View excluded rows", "small")}<p class="help">Original worksheet rows or CSV line starts are shown. Blank rows are ignored.</p></div>`;
}
async function refreshBuiltinInventory() {
  const request = ++inventoryRequest;
  inventoryLoading = true;
  inventoryError = "";
  inventory = null;
  query = "";
  render();
  try {
    const data = await loadBuiltinInventory();
    if (request === inventoryRequest) inventory = { ...data, sourceType: "published" };
  } catch (e) {
    if (request === inventoryRequest) inventoryError = `Unable to load built-in inventory. ${e.message}`;
  } finally {
    if (request === inventoryRequest) {
      inventoryLoading = false;
      render();
    }
  }
}
async function chooseLocalInventory(file) {
  const request = ++inventoryRequest;
  inventoryLoading = true;
  inventoryError = "";
  render();
  try {
    const data = await readLocalInventory(file);
    if (request === inventoryRequest) {
      inventory = data;
      query = "";
    }
  } catch (e) {
    if (request === inventoryRequest)
      inventoryError = `Local inventory could not be read: ${e.message}${inventory ? " The previous source remains selected." : ""}`;
  } finally {
    if (request === inventoryRequest) {
      inventoryLoading = false;
      render();
    }
  }
}
function inventoryPanel() {
  if (inventoryLoading)
    return `<section class="panel"><div class="panel-heading"><h2>Chemical inventory</h2></div><div class="panel-body">${inventorySourceControls()}<p role="status">Loading inventory…</p></div></section>`;
  if (!inventory)
    return `<section class="panel"><div class="panel-heading"><h2>Chemical inventory</h2></div><div class="panel-body">${inventorySourceControls()}${messages([inventoryError || "Inventory is unavailable."])}${button("reload-inventory", "Retry loading")}</div></section>`;
  const matches = matchingRows(inventory.rows, inventory.mapping, query),
    width = INVENTORY_COLUMNS.reduce((n, c) => n + c.width, 0) + 140;
  return `<section class="panel"><div class="panel-heading"><h2><span class="number">01</span>Chemical inventory</h2><span class="help" title="Inventory version: ${inventory.version}">${inventory.sourceType === "local" ? "Loaded in Browser" : "Inventory Updated"}: ${escape(inventory.updatedAt.replace("T", " ").slice(0, 19))} UTC · ${inventory.rows.length} entries</span></div><div class="panel-body">${inventorySourceControls()}${inventoryError ? messages([inventoryError]) : ""}<p class="inventory-source-label"><strong>Current Search Source:</strong> ${inventory.sourceType === "local" ? `Local file — ${escape(inventory.source)} (browser only)` : `Published Demo inventory (${inventory.rows.length} demo entries; not your company inventory)`}</p>${inventoryImportNotice()}${inventory.demo ? '<p class="notice warning"><strong>Demo inventory</strong> — Real chemicals will not be found in these examples. Choose your local inventory file to search your own data.</p>' : ""}<label class="field">Find a chemical by name, ID, CAS, or barcode<input id="inventory-query" value="${escape(query)}" placeholder="Search inventory…" autocomplete="off"></label>${
    query
      ? `<p class="help">${matches.length} matching entries${matches.length > 30 ? " · Showing the first 30; refine your search." : ""} · Click a cell to view and copy its full contents.</p>${
          matches.length
            ? `<div class="table-wrap inventory-results-wrap" id="inventory-results-scroll" data-preserve-scroll><table class="inventory-results" style="width:${width}px"><colgroup>${INVENTORY_COLUMNS.map((c) => `<col style="width:${c.width}px">`).join("")}<col style="width:140px"></colgroup><thead><tr>${INVENTORY_COLUMNS.map((c) => `<th class="${c.identifier ? "identifier-column" : ""}"><span class="two-line">${c.label}</span></th>`).join("")}<th>Action</th></tr></thead><tbody>${matches
                .slice(0, 30)
                .map(
                  (row) =>
                    `<tr>${INVENTORY_COLUMNS.map((c) => {
                      const text = inventoryValue(row, inventory.mapping, c.key);
                      return `<td class="${c.identifier ? "identifier-column" : ""}"><button class="cell-peek" data-action="inventory-cell" data-index="${inventory.rows.indexOf(row)}" data-key="${c.key}" data-header="${c.label}" title="${escape(text)}"><span class="two-line">${escape(text)}</span></button></td>`;
                    }).join(
                      "",
                    )}<td>${button("add-component", "Add Component", "small add-component", `data-index="${inventory.rows.indexOf(row)}"`)}</td></tr>`,
                )
                .join("")}</tbody></table></div>`
            : '<div class="empty">No matching inventory entries. Refine your search.</div>'
        }`
      : ""
  }</div></section>`;
}
function bufferComponent(c, i, result) {
  const p = `components.${i}`,
    r = result || calculateBufferComponent(c, editor().inputs.volume, editor().inputs.volumeUnit);
  const method = r.method || c.method,
    force = r.forcedStock;
  const observation = (c.form === "pure-liquid" && method !== "existing") || c.form === "solution";
  const stockObservation = c.form === "pure-liquid" && method === "new";
  const byMass = stockObservation ? (c.stockObservationMethod || "mass") === "mass" : c.observationMethod === "mass";
  let actualInputs;
  if (method === "direct") {
    actualInputs = quantity(`${p}.actualMass`, "Observed Mass — Measured", `${p}.massUnit`, ["mg", "g"]);
    if (c.form === "pure-liquid") actualInputs += quantity(`${p}.actualLiquid`, "Observed Volume — Measured", `${p}.liquidUnit`, ["µL", "mL"]);
  } else if (method === "new") {
    actualInputs =
      quantity(`${p}.actualMass`, "Stock Actual Mass — Measured", `${p}.massUnit`, units.mass) +
      (stockObservation ? quantity(`${p}.actualLiquid`, "Stock Pure-liquid Volume — Measured", `${p}.liquidUnit`, ["µL", "mL"]) : "") +
      quantity(`${p}.stockVolume`, "Stock Final Solution Volume", `${p}.stockVolumeUnit`, units.volume) +
      quantity(`${p}.stockTargetMass`, "Stock Target Mass (optional)", `${p}.stockTargetMassUnit`, ["mg", "g"]) +
      quantity(`${p}.actualTransfer`, "Observed Stock Transfer Volume (optional)", `${p}.transferUnit`, ["µL", "mL"]);
  } else {
    actualInputs =
      quantity(`${p}.knownConcentration`, "Known Stock Concentration", `${p}.knownUnit`, units.concentration) +
      quantity(`${p}.available`, "Available Existing Stock Volume", `${p}.availableUnit`, units.volume);
    if (c.form === "solution") actualInputs += quantity(`${p}.actualMass`, "Observed Solution Mass — Measured", `${p}.massUnit`, ["mg", "g"]);
    actualInputs += quantity(`${p}.actualTransfer`, "Observed Stock Transfer Volume (optional)", `${p}.transferUnit`, ["µL", "mL"]);
  }
  const deviation =
    method === "direct"
      ? `<div class="result-strip mass-error-strip"><div><small>Mass Deviation</small><strong>${fmt(r.massDeviationMg, true)} mg</strong></div><div><small>Mass Error (%)</small><strong>${fmt(r.massErrorPercent, true)}%</strong></div></div><p class="help">Positive = more mass than target; negative = less mass than target. No acceptance threshold is applied.${r.massErrorBasis === "Calculated from observed volume" ? " Mass error is calculated from observed volume." : ""}</p>`
      : "";
  return `<section class="panel component-panel"><div class="panel-heading"><h2>${escape(c.name)} ${badge(`Component ${i + 1}`)}</h2>${button("remove-component", "Remove component", "small danger", `data-index="${i}"`)}</div><div class="snapshot" aria-label="Selected inventory row">${summaryEntries(
    c.inventory,
  )
    .map(([k, v]) => `<span><b>${escape(k)}</b>${escape(v)}</span>`)
    .join("")}</div><div class="panel-body"><div class="grid">${input(`${p}.mw`, "Molecular Weight (g/mol)")}${select(`${p}.form`, "Physical Form", [
    ["", "Select physical form"],
    ["solid", "Solid"],
    ["pure-liquid", "Pure liquid"],
    ["solution", "Solution of known concentration"],
  ])}${c.form === "pure-liquid" || c.form === "solution" ? input(`${p}.density`, c.form === "solution" ? "Solution Density (g/mL; required for By Mass)" : "Density (g/mL)") : ""}${quantity(`${p}.target`, "Target Concentration", `${p}.targetUnit`, units.concentration)}</div><p class="help">Verify the exact salt and hydrate form. Molecular weight, physical form, and density are never inferred from a name.</p><div class="result-strip"><div><small>Target Mass (Required Mass)</small><strong>${fmt(r.requiredMg)} mg</strong></div>${r.requiredLiquidUL != null ? `<div><small>Target Liquid Volume</small><strong>${fmt(r.requiredLiquidUL)} µL</strong></div>` : ""}<div><small>Actual Final Concentration</small><strong>${fmt(r.actualMM)} mM</strong></div></div>${force ? '<div class="notice warning"><strong>Stock required.</strong> Required mass is below 100 mg. Use a new stock or a confirmed existing stock.</div>' : ""}<div class="grid three">${select(
    `${p}.method`,
    "Preparation Method",
    c.form === "solution"
      ? [["existing", "Use confirmed existing solution"]]
      : force
        ? [
            ["new", "Prepare new stock"],
            ["existing", "Use confirmed existing stock"],
          ]
        : [
            ["direct", "Direct preparation"],
            ["new", "Prepare new stock"],
            ["existing", "Use confirmed existing stock"],
          ],
  )}${
    observation
      ? select(`${p}.${stockObservation ? "stockObservationMethod" : "observationMethod"}`, "Observation Method", [
          ["mass", "By Mass"],
          ["volume", "By Volume"],
        ])
      : ""
  }</div><h3 class="subhead">Actual Preparation Inputs</h3><div class="grid">${actualInputs}</div>${observation ? `<p class="help">Both measured values may be recorded. Only ${byMass ? "measured mass" : "measured volume"} is used as the ${stockObservation ? "stock preparation" : "actual concentration"} basis; values are not averaged or counted twice.${c.form === "solution" ? " Solution mass is not solute mass. By Mass requires solution density and a known solution concentration." : ""}</p>` : ""}${method === "existing" ? `<p>${checkbox(`${p}.confirmed`, "I confirm the existing stock concentration and units.")}</p>` : ""}${r.calculatedMassMg != null || r.calculatedVolumeUL != null ? `<div class="result-strip">${r.calculatedMassMg != null ? `<div><small>Mass — Calculated from Density</small><strong>${fmt(r.calculatedMassMg)} mg</strong></div>` : ""}${r.calculatedVolumeUL != null ? `<div><small>Volume — Calculated from Density</small><strong>${fmt(r.calculatedVolumeUL)} µL</strong></div>` : ""}</div>` : ""}${method !== "direct" ? `<div class="result-strip"><div><small>Stock Concentration</small><strong>${fmt(r.stockMM)} mM</strong></div><div><small>Calculated Stock Transfer Volume</small><strong>${fmt(r.stockTransferUL ?? (r.transferML == null ? null : r.transferML * 1000))} µL</strong></div></div><p class="help">Observed transfer volume is optional. Actual final concentration is left blank until an observed transfer is recorded.</p>` : ""}${r.stockCalculatedMassMg != null || r.stockCalculatedVolumeUL != null ? `<div class="result-strip">${r.stockCalculatedMassMg != null ? `<div><small>Stock Mass — Calculated from Density</small><strong>${fmt(r.stockCalculatedMassMg)} mg</strong></div>` : ""}${r.stockCalculatedVolumeUL != null ? `<div><small>Stock Pure-liquid Volume — Calculated from Density</small><strong>${fmt(r.stockCalculatedVolumeUL)} µL</strong></div>` : ""}</div>` : ""}${method === "new" ? `<div class="result-strip"><div><small>Stock Weighing Error (%)</small><strong>${fmt(r.stockMassErrorPercent, true)}%</strong></div></div><p class="help">Stock weighing error is calculated only when an explicit Stock Target Mass is set. It is not a final buffer concentration error.</p>` : ""}${deviation}${messages(r.errors)}${formula(r.formulas)}</div><div class="review-bar">${checkbox(`${p}.reviewed`, "Calculation Review: inputs, units, and formula checked", !!r.errors.length)}${badge(c.reviewed ? "Checked" : "Needs recheck", c.reviewed ? "teal" : "amber")}</div></section>`;
}
const compact = (html) => html.replace('class="field"', 'class="field compact-field"');
function observationInput(c, i, r) {
  const p = `components.${i}`,
    method = r.method || c.method;
  if (method === "new") {
    if (c.form === "pure-liquid")
      return `<span class="observation-kind">Stock preparation</span>${compact(
        select(`${p}.stockObservationMethod`, "Stock Observation Method", [
          ["mass", "By Mass"],
          ["volume", "By Volume"],
        ]),
      )}${(c.stockObservationMethod || "mass") === "volume" ? compact(quantity(`${p}.actualLiquid`, "Stock Observed Pure-liquid Volume", `${p}.liquidUnit`, ["µL", "mL"])) : compact(quantity(`${p}.actualMass`, "Stock Observed Mass", `${p}.massUnit`, ["mg", "g"]))}`;
    return `<span class="observation-kind">Stock weighing</span>${compact(quantity(`${p}.actualMass`, "Stock Observed Mass", `${p}.massUnit`, ["mg", "g"]))}`;
  }
  if (method === "existing") {
    if (c.form === "solution")
      return `${compact(
        select(`${p}.observationMethod`, "Observation Method", [
          ["mass", "By Mass"],
          ["volume", "By Volume"],
        ]),
      )}${c.observationMethod === "mass" ? compact(quantity(`${p}.actualMass`, "Observed Solution Mass", `${p}.massUnit`, ["mg", "g"])) : compact(quantity(`${p}.actualTransfer`, "Observed Stock Transfer Volume", `${p}.transferUnit`, ["µL", "mL"]))}`;
    return `<span class="observation-kind">Existing stock transfer</span>${compact(quantity(`${p}.actualTransfer`, "Observed Stock Transfer Volume", `${p}.transferUnit`, ["µL", "mL"]))}`;
  }
  if (c.form === "pure-liquid")
    return `${compact(
      select(`${p}.observationMethod`, "Observation Method", [
        ["mass", "By Mass"],
        ["volume", "By Volume"],
      ]),
    )}${c.observationMethod === "mass" ? compact(quantity(`${p}.actualMass`, "Observed Mass", `${p}.massUnit`, ["mg", "g"])) : compact(quantity(`${p}.actualLiquid`, "Observed Volume", `${p}.liquidUnit`, ["µL", "mL"]))}`;
  return compact(quantity(`${p}.actualMass`, "Observed Mass", `${p}.massUnit`, ["mg", "g"]));
}
function componentTable(b, results) {
  if (!b.components.length) return '<div class="empty">No components yet. Search the current inventory and select Add Component.</div>';
  return `<section class="panel"><div class="panel-heading"><h2>Components</h2><span class="help">One component per row. Expand Details for stock preparation, snapshots, formulas and review.</span></div><div class="component-grid-scroll" id="component-table-scroll" data-preserve-scroll><table class="component-grid"><colgroup>${[225, 190, 95, 185, 120, 150, 215, 120, 175, 100].map((w) => `<col style="width:${w}px">`).join("")}</colgroup><thead><tr>${["Chemical Name", "Vendor", "MW (g/mol)", "Target Concentration", "Target Mass (mg)", "Target Liquid Volume (µL)", "Observation", "Error (%)", "Preparation Method", "Review"].map((t) => `<th>${t}</th>`).join("")}</tr></thead><tbody>${b.components
    .map((c, i) => {
      const r = results.rows?.[i] || {},
        p = `components.${i}`,
        method = r.method || c.method,
        expanded = expandedComponents.has(c.id),
        vendor = vendorDescription(c);
      const methods =
        c.form === "solution"
          ? [["existing", "Existing stock"]]
          : r.forcedStock
            ? [
                ["new", "New stock"],
                ["existing", "Existing stock"],
              ]
            : [
                ["direct", "Direct"],
                ["new", "New stock"],
                ["existing", "Existing stock"],
              ];
      const main = `<tr class="component-row" data-component-id="${c.id}"><td><span class="two-line" title="${escape(c.name)}">${escape(c.name)}</span>${button("toggle-component", expanded ? "Collapse" : "Details", "small", `data-id="${c.id}" aria-expanded="${expanded}"`)}${r.forcedStock ? '<span class="badge amber">Stock required</span>' : ""}</td><td><button class="cell-peek" data-action="vendor-detail" data-index="${i}" title="${escape(vendor)}"><span class="two-line">${escape(vendor)}</span></button></td><td>${compact(input(`${p}.mw`, "Molecular Weight (g/mol)"))}</td><td>${compact(quantity(`${p}.target`, "Target Concentration", `${p}.targetUnit`, units.concentration))}</td><td>${fmt(r.requiredMg)}</td><td>${fmt(r.requiredLiquidUL)}${c.form === "pure-liquid" || c.form === "solution" ? `<span class="observation-kind">Density (g/mL)</span>${compact(input(`${p}.density`, "Density (g/mL)"))}` : ""}</td><td>${observationInput(c, i, r)}</td><td>${method === "new" ? `${fmt(r.stockMassErrorPercent, true)}<span class="observation-kind">Stock weighing${r.stockMassErrorPercent == null ? " — target not set" : ""}</span>` : method === "direct" ? `${fmt(r.massErrorPercent, true)}${r.massErrorBasis === "Calculated from observed volume" ? '<span class="observation-kind">From observed volume</span>' : ""}` : "—"}</td><td>${compact(
        select(`${p}.form`, "Physical Form", [
          ["", "Physical form"],
          ["solid", "Solid"],
          ["pure-liquid", "Pure liquid"],
          ["solution", "Known solution"],
        ]),
      )}${compact(select(`${p}.method`, "Preparation Method", methods))}</td><td>${button("remove-component", "Remove", "small danger", `data-index="${i}"`)}${badge(c.reviewed ? "Checked" : r.errors?.length ? "Incomplete" : "Needs review", c.reviewed ? "teal" : "amber")}</td></tr>`;
      if (!expanded) return main;
      fieldScope = `-detail-${c.id}`;
      const detail = bufferComponent(c, i, r);
      fieldScope = "";
      return main + `<tr class="component-details"><td colspan="10">${detail}</td></tr>`;
    })
    .join("")}</tbody></table></div></section>`;
}
function buffer() {
  const b = editor().inputs,
    r = results();
  return (
    title() +
    `<section class="panel"><div class="panel-heading"><h2>Preparation Information</h2>${badge("Final volume basis", "teal")}</div><div class="panel-body"><div class="grid three">${input("name", "Preparation Name")}${input("preparationLot", "Preparation Lot")}${input("preparationDate", "Date", "", "date")}${quantity("volume", "Target Volume", "volumeUnit", units.volume)}${input("targetPH", "Target pH (optional)")}</div><p class="help">Final volume includes all stocks and liquid additions. Bring to the specified final volume after adding all components.</p></div></section>` +
    inventoryPanel() +
    componentTable(b, r) +
    review(r)
  );
}
function stockCard(c, i, role) {
  const s = c.stocks[role],
    p = `cocktails.${i}.stocks.${role}`,
    r = calculateSingle(s);
  return `<div class="stock-card"><h3>${role === "S" ? "S · Substrate standard" : "IS · Internal standard"}${badge("Independent stock")}</h3><div class="grid two">${input(`${p}.name`, "Compound", "Exact compound name")}${input(`${p}.mw`, "Molecular Weight (g/mol)", "Optional for qNMR")}${input(`${p}.lot`, "Lot")}${input(`${p}.date`, "Preparation date", "", "date")}${input(`${p}.solvent`, "Solvent")}${select(
    `${p}.source`,
    "Stock data source",
    [
      ["weight", "Weight / MW"],
      ["qnmr-amount", "qNMR — amount (µmol / nmol)"],
      ["qnmr-concentration", "qNMR — concentration + sample volume"],
    ],
  )}${s.source === "weight" ? quantity(`${p}.mass`, "Actual compound mass", `${p}.massUnit`, units.mass) : s.source === "qnmr-amount" ? quantity(`${p}.amount`, "qNMR amount (not concentration)", `${p}.amountUnit`, ["µmol", "nmol"]) : quantity(`${p}.qConcentration`, "qNMR concentration", `${p}.qUnit`, units.molar) + quantity(`${p}.sampleVolume`, "qNMR corresponding sample volume", `${p}.sampleUnit`, units.volume)}${select(
    `${p}.volumeMode`,
    "Preparation calculation",
    [
      ["manual", "Enter volume → calculate concentration"],
      ["target", "Enter target concentration → calculate volume"],
    ],
  )}${s.volumeMode === "manual" ? quantity(`${p}.prepVolume`, s.volumeBasis === "solvent" ? "Solvent Added (approximation)" : "Final Solution Volume", `${p}.prepUnit`, units.volume) : quantity(`${p}.desiredConcentration`, "Target single-standard concentration", `${p}.desiredUnit`, units.molar)}${select(
    `${p}.volumeBasis`,
    "Volume basis",
    [
      ["final", "Final Solution Volume"],
      ["solvent", "Solvent Added (volume approximation)"],
    ],
  )}${quantity(`${p}.available`, "Available stock volume (optional)", `${p}.availableUnit`, units.volume, "Defaults to prepared volume")}${quantity(`${p}.target`, "Target Concentration in Cocktail", `${p}.targetUnit`, units.molar)}</div><p class="help">Use the volume on the vial when available. Preparation volume must be &lt;3000 µL. Target refers to the final cocktail, before any further assay dilution. No purity correction is applied.</p><div class="result-strip"><div><small>Stock Concentration (mM)</small><strong>${fmt(r.stockMM)}</strong></div><div><small>Preparation volume (µL)</small><strong>${fmt(r.prepUL)}</strong></div></div>${messages(r.errors)}${messages(r.warnings, "warning")}${formula(r.formulas)}</div>`;
}
function cocktailTable(c, r) {
  return `<div class="table-wrap"><table class="results-table"><thead><tr><th>Compound</th><th>Stock Concentration<br>(mM)</th><th>Target Concentration in Cocktail<br>(µM)</th><th>Compound Mass per Assay<br>(µg)</th><th>Stock Volume per Assay<br>(µL)</th><th>Stock Volume to Transfer<br>(µL)</th></tr></thead><tbody>${[
    "S",
    "IS",
  ]
    .map((role) => {
      const row = r.rows?.find((row) => row.role === role);
      return `<tr><td><strong>${escape(c.stocks[role].name) || role}</strong><br>${badge(role)}</td><td>${fmt(row?.stock?.stockMM)}</td><td>${fmt(row?.targetUM)}</td><td>${row?.massUG == null ? (c.stocks[role].mw ? "—" : "Missing MW") : fmt(row.massUG)}</td><td>${fmt(row?.perAssayUL)}</td><td><strong>${fmt(row?.transferUL)}</strong></td></tr>`;
    })
    .join(
      "",
    )}</tbody></table></div><div class="solvent"><div><strong style="font-size:13px">Solvent Volume to Add (µL)</strong><br><span class="help">Bring to the final cocktail volume after adding all stocks.</span></div><strong>${fmt(r.solventUL)}</strong></div>`;
}
function volumePlan(r) {
  const s = editor().inputs,
    matching = s.match;
  return `<section class="panel"><div class="panel-heading"><h2><span class="number">02</span>Batch volume coordination</h2>${s.confirmed ? badge("Plan confirmed", "teal") : badge("Confirmation required", "amber")}</div><div class="panel-body"><div class="grid three">${input("minimum", "Minimum IS Aliquot (µL)", "20")}${input("threshold", "IS Scale-Up Threshold (µL)", "100")}<div><p class="help">The scale-up threshold controls whether a batch follows the common volume. It is not a hard limit on IS usage.</p></div></div><div class="actions" style="margin:18px 0">${button("match", "Match Batch Volumes", matching ? "primary" : "")}${matching ? button("reset-match", "Use automatic plan") : ""}</div><p class="help">A preview is recalculated from original volumes. Different original volumes are retained unless Match Batch Volumes is selected. Every S, IS, and solvent calculation uses the selected final volume for its cocktail.</p>${messages(r.warnings, "warning")}<div class="table-wrap"><table class="plan-table"><thead><tr><th>Cocktail</th><th>Original Volume<br>(µL)</th><th>Proposed Volume<br>(µL)</th><th>Selected Final Volume<br>(µL)</th><th>Original IS Aliquot<br>(µL)</th><th>Final IS Aliquot<br>(µL)</th><th>Adjustment reason</th></tr></thead><tbody>${s.cocktails
    .map((c) => {
      const p = r.plan?.find((p) => p.id === c.id);
      return `<tr class="${p && p.selectedVolume !== p.originalVolume ? "adjusted" : ""}"><td><strong>${escape(c.name) || "Unnamed cocktail"}</strong></td><td>${fmt(p?.originalVolume)}</td><td>${fmt(p?.proposedVolume)}</td><td class="final">${fmt(p?.selectedVolume)}</td><td>${fmt(p?.originalIS)}</td><td>${fmt(p?.finalIS)}</td><td>${escape(p?.reason || "Complete valid IS concentration and original volume inputs to calculate a plan.")}</td></tr>`;
    })
    .join(
      "",
    )}</tbody></table></div><div class="plan-confirm"><span class="help">Changing any preparation input invalidates this confirmation and the record review.</span>${button("confirm-plan", s.confirmed ? "Volume plan confirmed" : "Confirm volume plan", s.confirmed ? "" : "primary", r.plan?.length !== s.cocktails.length ? "disabled" : "")}</div></div></section>`;
}
function sis() {
  const s = editor().inputs,
    r = results();
  return (
    title() +
    `<section class="panel"><div class="panel-heading"><h2>Preparation details</h2>${button("demo-sis", "Load A / B / C demo")}</div><div class="panel-body"><div class="grid two">${input("name", "Preparation Name", "e.g. Multiplex S/IS preparation")}<div class="notice" style="margin:0">No inventory confirmation is required for S/IS. Each cocktail has separate S and IS stocks, targets, and final volume.</div></div></div></section>` +
    s.cocktails
      .map(
        (c, i) =>
          `<section class="panel"><div class="panel-heading"><h2><span class="number">${String(i + 1).padStart(2, "0")}</span>${escape(c.name) || `Cocktail ${i + 1}`}</h2>${button("remove-cocktail", "Remove cocktail", "small danger", `data-index="${i}"`)}</div><div class="panel-body"><div class="grid three">${input(`cocktails.${i}.name`, "Cocktail Name")}${quantity(`cocktails.${i}.volume`, "Original Planned Cocktail Volume", `cocktails.${i}.volumeUnit`, units.volume)}${quantity(`cocktails.${i}.assayVolume`, "Cocktail Volume per Assay", `cocktails.${i}.assayUnit`, units.volume)}</div><div class="divider"></div><div class="stock-grid">${stockCard(c, i, "S")}${stockCard(c, i, "IS")}</div></div></section>`,
      )
      .join("") +
    `<div class="actions" style="margin-bottom:24px">${button("add-cocktail", "+ Add independent cocktail")}</div>` +
    volumePlan(r) +
    s.cocktails
      .map((c) => {
        const cr = r.cocktails?.find((x) => x.id === c.id) || {};
        return `<section class="panel"><div class="panel-heading"><h2>${escape(c.name) || "Cocktail"} · Transfer worksheet</h2>${badge(s.confirmed ? "Confirmed plan" : "Plan preview", s.confirmed ? "teal" : "amber")}</div><div class="panel-body"><div class="result-strip"><div><small>Final Cocktail Volume (µL)</small><strong>${fmt(cr.finalUL)}</strong></div><div><small>Cocktail Volume per Assay (µL)</small><strong>${fmt(cr.assayUL)}</strong></div></div></div>${cocktailTable(c, cr)}<div class="panel-body">${messages(cr.errors)}${formula([...(cr.formulas || []), ...(cr.rows || []).flatMap((row) => row.formulas || [])])}</div></section>`;
      })
      .join("") +
    review(r)
  );
}
function review(r) {
  const e = editor(),
    ready = !r.errors.length && (route !== "buffer" || e.inputs.components.every((c) => c.reviewed));
  return `<section class="panel"><div class="panel-heading"><h2>Calculation review &amp; record</h2>${badge(e.status, e.status === "Reviewed" ? "teal" : "amber")}</div><div class="panel-body">${messages(r.errors)}${route === "buffer" && e.inputs.components.some((c) => !c.reviewed) ? '<p class="help">Check Calculation Review for each component after verifying the inputs.</p>' : ""}<p class="help">Drafts may contain incomplete inputs. Reviewed records require valid calculations${route === "sis" ? ", sufficient stocks, and a confirmed volume plan" : ", actual preparation inputs, and checked components"}. Saving and imports use only this browser. Rules ${RULE_VERSION}.</p><div class="actions">${button("review", "Mark Reviewed", "", !ready ? "disabled" : "")}${button("save", "Save Preparation Record", "primary")}${button("export-excel", "Export Preparation Excel")}</div></div></section>`;
}
function recordsPage() {
  return `<div class="title-row"><div><div class="eyebrow">YOUR LOCAL NOTEBOOK</div><h1>Preparation Records</h1><p class="subtitle">Reopen, edit, or duplicate a preparation. Export an Excel preparation workbook.</p></div><label class="button primary">Import JSON<input type="file" accept=".json,application/json" id="record-file" hidden></label></div><div class="notice">Records and imported data are saved only in this browser. No backend or company system is connected. Imported records open as Draft and retain their original result snapshot.</div><section class="panel"><div class="panel-heading"><h2>Saved preparations</h2>${badge(`${records.length} records`)}</div>${records.length ? `<div class="table-wrap"><table class="inventory-table"><thead><tr><th>Preparation</th><th>Module</th><th>Status</th><th>Last saved</th><th>Actions</th></tr></thead><tbody>${records.map((r) => `<tr><td><strong>${escape(r.name)}</strong><br>${r.demo ? badge("Demo data", "amber") : ""}</td><td>${r.kind === "buffer" ? "Buffer Making" : "S/IS Making"}</td><td>${badge(r.status, r.status === "Reviewed" ? "teal" : "amber")}</td><td>${escape(r.updatedAt?.replace("T", " ").slice(0, 16))} UTC<br><span class="help">Rules ${escape(r.ruleVersion)}</span></td><td><div class="actions">${button("open-record", "Open", "small", `data-id="${escape(r.id)}"`)}${button("copy-record", "Copy as new", "small", `data-id="${escape(r.id)}"`)}${button("export-record", "Excel", "small", `data-id="${escape(r.id)}"`)}${button("delete-record", "Delete", "small danger", `data-id="${escape(r.id)}"`)}</div></td></tr>`).join("")}</tbody></table></div>` : '<div class="panel-body"><div class="empty">No saved records yet. Start a preparation and select Save Preparation Record.</div></div>'}</section>`;
}
function render() {
  const scrolls = [...document.querySelectorAll("[data-preserve-scroll]")].map((n) => ({ id: n.id, left: n.scrollLeft, top: n.scrollTop }));
  const active = document.activeElement,
    focus = active?.id,
    start = active?.selectionStart,
    end = active?.selectionEnd;
  const opened = editor()?.snapshot,
    stale = opened && opened.ruleVersion !== RULE_VERSION;
  app.innerHTML =
    header() +
    `<main class="shell" id="main"><div class="breadcrumb"><a href="#home">Workbench</a> &nbsp;/&nbsp; ${escape({ home: "Overview", buffer: "Buffer Making", sis: "S/IS Making", records: "Records" }[route] || "Overview")}</div><div class="workspace">${storageError ? messages([storageError]) : ""}${notice ? `<div class="notice">${escape(notice)}</div>` : ""}${stale ? `<h1>${escape(opened.name)}</h1><div class="notice warning">This record uses rules ${escape(opened.ruleVersion)}. Saved results are preserved as a read-only snapshot. Recalculate explicitly to edit under current rules ${RULE_VERSION}.</div>${button("recalculate", "Recalculate with current rules", "primary")}${button("export-excel", "Export Preparation Excel")}<pre>${escape(JSON.stringify(opened, null, 2))}</pre>` : route === "home" ? home() : route === "buffer" ? buffer() : route === "sis" ? sis() : recordsPage()}</div><footer class="footer"><span>Lab Preparation Workbench · Browser local storage · Export preparation Excel files</span><span>Explicit units. Traceable calculations. &nbsp; Rules ${RULE_VERSION}</span></footer><dialog id="detail-dialog"><h2 id="detail-title"></h2><textarea id="detail-content" readonly aria-label="Full content"></textarea><div class="actions">${button("copy-detail", "Copy full content")}${button("close-detail", "Close")}</div></dialog></main>`;
  for (const p of scrolls) {
    const n = document.getElementById(p.id);
    if (n) {
      n.scrollLeft = p.left;
      n.scrollTop = p.top;
    }
  }
  if (focus) {
    const next = document.getElementById(focus);
    if (next) {
      next.focus({ preventScroll: true });
      if (start != null && next.setSelectionRange)
        try {
          next.setSelectionRange(start, end);
        } catch {
          /* Selects do not have a text selection. */
        }
    }
  }
}
function navigate(r) {
  location.hash = r;
  if (route === r) render();
}
function openRecord(r) {
  editors[r.kind] = {
    inputs: structuredClone(r.inputs),
    id: r.id,
    createdAt: r.createdAt,
    status: r.status,
    dirty: false,
    snapshot: structuredClone(r),
  };
  navigate(r.kind);
}
async function download(r) {
  const workbook = await createPreparationWorkbook(r);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${r.demo ? "demo-" : ""}${r.kind}-${r.id}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function showDetail(title, value) {
  document.querySelector("#detail-title").textContent = title;
  document.querySelector("#detail-content").value = String(value ?? "");
  document.querySelector("#detail-dialog").showModal();
}
app.addEventListener("input", (event) => {
  const target = event.target;
  if (target.id === "inventory-query") {
    query = target.value;
    render();
    return;
  }
  if (!target.dataset.path || target.tagName === "SELECT" || target.type === "checkbox") return;
  try {
    invalidate();
    set(editor().inputs, target.dataset.path, target.value);
    normalizePreparationMethods();
    render();
  } catch (e) {
    toast(e.message);
  }
});
app.addEventListener("change", async (event) => {
  const t = event.target;
  try {
    if (t.id === "local-inventory-file") {
      const file = t.files[0];
      if (file) await chooseLocalInventory(file);
    } else if (t.id === "record-file") {
      if (!t.files[0]) return;
      const r = decodeRecord(await t.files[0].text());
      r.id = uid();
      r.status = "Draft";
      r.imported = true;
      saveRecord(r);
      records = readRecords();
      render();
      toast("Record imported as Draft. Saved results preserved; review before use.");
    } else if (t.dataset.path && (t.tagName === "SELECT" || t.type === "checkbox")) {
      if (t.dataset.path.endsWith(".reviewed")) {
        set(editor().inputs, t.dataset.path, t.checked);
        editor().dirty = true;
        editor().snapshot = null;
        editor().status = "Draft";
      } else {
        invalidate();
        set(editor().inputs, t.dataset.path, t.type === "checkbox" ? t.checked : t.value);
        normalizePreparationMethods();
      }
      render();
    }
  } catch (e) {
    toast(e.message);
  }
});
app.addEventListener("click", async (event) => {
  const b = event.target.closest("[data-action]");
  if (!b) return;
  const action = b.dataset.action,
    e = editor();
  try {
    if (action === "reload-inventory") {
      await refreshBuiltinInventory();
      return;
    }
    if (action === "toggle-component") {
      expandedComponents.has(b.dataset.id) ? expandedComponents.delete(b.dataset.id) : expandedComponents.add(b.dataset.id);
      render();
      if (expandedComponents.has(b.dataset.id)) document.querySelector("#component-table-scroll").scrollLeft = 0;
      return;
    }
    if (action === "vendor-detail") {
      showDetail("Vendor", vendorDescription(e.inputs.components[Number(b.dataset.index)]));
      return;
    }
    if (action === "precision") {
      showDetail("Full calculation precision", b.dataset.value);
      return;
    }
    if (action === "inventory-cell") {
      showDetail(b.dataset.header, inventoryValue(inventory.rows[Number(b.dataset.index)], inventory.mapping, b.dataset.key));
      return;
    }
    if (action === "inventory-import-issues") {
      showDetail("Local inventory import report", localInventoryReportText(inventory));
      return;
    }
    if (action === "inventory-header") {
      showDetail("Full column name", b.dataset.header);
      return;
    }
    if (action === "close-detail") {
      document.querySelector("#detail-dialog").close();
      return;
    }
    if (action === "copy-detail") {
      const text = document.querySelector("#detail-content");
      try {
        await navigator.clipboard.writeText(text.value);
        toast("Full content copied.");
      } catch {
        text.select();
        toast("Select and copy the full content using your browser.");
      }
      return;
    }
    if (action === "new") {
      if (e.dirty && !confirm("Discard unsaved changes and start a new preparation?")) return;
      editors[route] = {
        inputs: route === "buffer" ? blankBuffer() : blankSIS(),
        status: "Draft",
        dirty: false,
      };
    } else if (action === "add-component") {
      if (!inventory.mapping.name) throw new Error("The inventory template is missing Chemical Name.");
      invalidate();
      e.inputs.components.push(
        componentFromRow(inventory.rows[Number(b.dataset.index)], inventory.mapping, inventory.source, inventory.version, inventory.updatedAt),
      );
      if (inventory.demo) e.inputs.demo = true;
    } else if (action === "remove-component") {
      invalidate();
      e.inputs.components.splice(Number(b.dataset.index), 1);
    } else if (action === "add-cocktail") {
      invalidate();
      e.inputs.cocktails.push(blankCocktail());
    } else if (action === "remove-cocktail") {
      invalidate();
      e.inputs.cocktails.splice(Number(b.dataset.index), 1);
    } else if (action === "demo-sis") {
      if (e.dirty && !confirm("Replace unsaved S/IS inputs with clearly marked Demo data?")) return;
      editors.sis = { inputs: demoSIS(), status: "Draft", dirty: true };
    } else if (action === "match" || action === "reset-match") {
      invalidate();
      e.inputs.match = action === "match";
    } else if (action === "confirm-plan") {
      const r = calculateSIS(e.inputs);
      if (r.plan.length !== e.inputs.cocktails.length || !r.plan.length || r.plan.some((p) => below(p.finalIS, Number(e.inputs.minimum))))
        throw new Error("The volume plan does not satisfy the minimum IS aliquot. Review the inputs or use Match Batch Volumes.");
      e.inputs.confirmed = true;
      e.dirty = true;
      e.snapshot = null;
      e.status = "Draft";
      toast("Volume plan confirmed. Review stock availability and calculations before marking Reviewed.");
    } else if (action === "review") {
      makeRecord(route, e.inputs, "Reviewed");
      e.status = "Reviewed";
      e.dirty = true;
      toast("Calculation marked Reviewed. Save Preparation Record to keep this status.");
    } else if (action === "save") {
      if (e.snapshot && e.snapshot.ruleVersion !== RULE_VERSION) throw new Error("Recalculate explicitly before saving under current rules.");
      const record = makeRecord(route, e.inputs, e.status, e.id, e.createdAt);
      saveRecord(record);
      records = readRecords();
      e.id = record.id;
      e.createdAt = record.createdAt;
      e.dirty = false;
      e.snapshot = record;
      toast(`${record.status} preparation saved in this browser${record.demo ? " · Demo data" : ""}.`);
    } else if (action === "export-excel") {
      if (!e.id) e.id = uid();
      if (!e.createdAt) e.createdAt = new Date().toISOString();
      await download(e.snapshot && !e.dirty ? e.snapshot : makeRecord(route, e.inputs, e.status, e.id, e.createdAt));
    } else if (action === "recalculate") {
      invalidate();
      toast("Recalculated with current rules. Review is required.");
    } else if (["open-record", "copy-record", "export-record", "delete-record"].includes(action)) {
      const r = records.find((r) => r.id === b.dataset.id);
      if (!r) throw new Error("Record no longer exists.");
      if (action === "open-record") {
        if (editors[r.kind].dirty && !confirm("Replace unsaved editor inputs with this saved record?")) return;
        openRecord(r);
        return;
      }
      if (action === "copy-record") {
        if (editors[r.kind].dirty && !confirm("Replace unsaved editor inputs with a new copy?")) return;
        const copy = copyRecord(r);
        editors[r.kind] = { inputs: copy.inputs, status: "Draft", dirty: true };
        navigate(r.kind);
        return;
      }
      if (action === "export-record") {
        await download(r);
        return;
      }
      if (action === "delete-record" && confirm(`Delete "${r.name}" from this browser? Export a backup first if needed.`)) {
        removeRecord(r.id);
        records = readRecords();
      }
    }
    render();
  } catch (error) {
    toast(`Unable to complete action: ${error.message}`);
  }
});
app.addEventListener("keydown", (event) => {
  if (["Enter", " "].includes(event.key) && event.target.matches(".calculated-value")) {
    event.preventDefault();
    event.target.click();
  }
});
window.addEventListener("hashchange", () => {
  route = ["home", "buffer", "sis", "records"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "home";
  notice = "";
  render();
  window.scrollTo(0, 0);
});
window.addEventListener("beforeunload", (event) => {
  if (Object.values(editors).some((e) => e.dirty)) {
    event.preventDefault();
    event.returnValue = "";
  }
});
render();
refreshBuiltinInventory();
