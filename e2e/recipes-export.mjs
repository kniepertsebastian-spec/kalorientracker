// Roadmap 05 acceptance: recipe maths over the final weight, immutable entry snapshots after a
// recipe edit (also on a second device and in the export), the 7/14/31/90-day export downloads
// and the progress view with the Fitnesstracker body trend. Test account only; it cleans up after
// itself. Output allowlist: step names, counts, numbers, booleans. Never credentials or bodies.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";
import { KCAL, OUT, env, scrub } from "./env.mjs";

const TAG = `E2E-${Date.now().toString(36)}`;
const RECIPE = `${TAG} Quark-Hafer`;
const browser = await chromium.launch();
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "de-DE", timezoneId: "Europe/Berlin", acceptDownloads: true };
const results = [];
const issues = [];
const api = {};
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra !== "" ? ` (${extra})` : ""}`);
/** "1.234,5 kcal" → 1234.5 */
const num = (s) => Number(String(s).replace(/[^\d,.-−]/g, "").replace("−", "-").replace(/\./g, "").replace(",", "."));

async function open(context) {
  const page = await context.newPage();
  page.on("console", (m) => m.type() === "error" && issues.push(`console.error: ${scrub(m.text())}`));
  page.on("pageerror", (e) => issues.push(`pageerror: ${scrub(e.message)}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/nutrition/")) api[u.pathname] = r.status();
    if (r.status() >= 400 && !(u.pathname === "/api/auth/session" && r.status() === 401)) issues.push(`HTTP ${r.status()} ${u.pathname}`);
  });
  return page;
}

async function login(page) {
  await page.goto(KCAL, { waitUntil: "networkidle" });
  if (await page.locator('input[type="password"]').count()) {
    await page.locator('input[type="email"]').fill(env.TEST_PWA_EMAIL);
    await page.locator('input[type="password"]').fill(env.TEST_PWA_PASSWORD);
    await page.locator('button[type="submit"]').click();
  }
  return page.getByTestId("screen-today").waitFor({ timeout: 20000 }).then(() => true, () => false);
}
const waitSynced = (page, timeout = 30000) =>
  page.waitForFunction(() => document.querySelector('[data-testid="sync-status"]')?.getAttribute("data-tone") === "synced", null, { timeout }).then(() => true, () => false);
const tab = async (page, name, id) => {
  await page.getByRole("link", { name, exact: true }).click();
  await page.getByTestId(id).waitFor();
};
const macro = async (scope, label) => num((await scope.locator(".macro-line").filter({ hasText: label }).locator(".num").textContent()).split("kcal")[0]);

// ─── 1. Recipe from raw ingredients, scaled over the final weight ────────────────────────────
const ctx = await browser.newContext(device);
const page = await open(ctx);
check("Login auf kcal (Test-Account)", await login(page));
await waitSynced(page);
await tab(page, "Rezepte", "screen-recipes");
await page.getByRole("button", { name: "+ Neues Rezept" }).click();
const ed = page.getByTestId("recipe-editor");
await ed.getByLabel("Name").fill(RECIPE);

async function addIngredient(term, grams) {
  await ed.getByRole("button", { name: "+ Zutat" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Lebensmittel suchen").fill(term);
  const hit = dlg.locator(".list-row").first();
  if (!(await hit.waitFor({ timeout: 15000 }).then(() => true, () => false))) {
    await dlg.getByRole("button", { name: "Schließen" }).click();
    return false;
  }
  await hit.click();
  if (await dlg.getByLabel("Einheit").locator('option[value="g"]').count()) await dlg.getByLabel("Einheit").selectOption("g");
  await dlg.getByLabel("Menge").fill(String(grams));
  await dlg.getByRole("button", { name: "Übernehmen" }).click();
  await dlg.waitFor({ state: "detached" });
  return true;
}
const added = (await addIngredient("Magerquark", 250)) && (await addIngredient("Haferflocken", 150));
check("Zwei Rohzutaten hinzugefügt (250 g + 150 g)", added);
await ed.getByLabel("Endgewicht nach dem Kochen").fill("300");
await ed.getByLabel("Portionen (optional)").fill("2");
const calc = ed.getByTestId("recipe-calc");
await calc.waitFor();
const total = await macro(calc, "Gesamt (aus Rohzutaten)");
const per100 = await macro(calc, "pro 100 g fertig");
const perServing = await macro(calc, "pro Portion");
const rawText = await calc.locator("p.small").first().textContent();
check("Gesamt aus Rohzutaten, Rohgewicht 400 g → Endgewicht 300 g", /400\s*g/.test(rawText) && /Endgewicht\s*300\s*g/.test(rawText) && /−?-?25\s*%/.test(rawText), `${total} kcal gesamt`);
check("pro 100 g = Gesamt ÷ Endgewicht", Math.abs(per100 - (total / 300) * 100) <= 1, `${per100} kcal/100 g`);
check("pro Portion = Gesamt ÷ 2", Math.abs(perServing - total / 2) <= 1, `${perServing} kcal/Portion`);
await ed.getByRole("button", { name: "Speichern" }).click();
await page.getByTestId("screen-recipes").waitFor();
const card = page.locator(".recipe-card").filter({ hasText: RECIPE });
check("Rezept in der Liste mit Endgewicht", /300\s*g Endgewicht/.test(await card.textContent()));

// ─── 2. Log 150 g of it, then change the recipe: the logged snapshot must not move ───────────
await tab(page, "Heute", "screen-today");
await page.getByRole("button", { name: "Suche", exact: true }).click();
let dlg = page.getByRole("dialog");
await dlg.getByLabel("Lebensmittel suchen").fill(RECIPE.slice(0, 14));
await dlg.locator(".list-row").filter({ hasText: RECIPE }).first().click();
await dlg.getByLabel("Einheit").selectOption("g");
await dlg.getByLabel("Menge").fill("150");
await dlg.getByRole("button", { name: "Eintragen" }).click();
await dlg.waitFor({ state: "detached" });
const row = page.getByTestId("entry-row").filter({ hasText: RECIPE });
await row.waitFor();
const logged = num(await row.locator(".kcal").textContent());
check("150 g geloggt = 1,5 × kcal/100 g", Math.abs(logged - per100 * 1.5) <= 1, `${logged} kcal`);
await waitSynced(page);

await tab(page, "Rezepte", "screen-recipes");
await card.getByRole("button", { name: "Bearbeiten" }).click();
await ed.waitFor();
await ed.getByLabel("Endgewicht nach dem Kochen").fill("200");
const per100New = await macro(ed.getByTestId("recipe-calc"), "pro 100 g fertig");
check("Weniger Endgewicht → dichter pro 100 g", Math.abs(per100New - (total / 200) * 100) <= 1, `${per100New} kcal/100 g`);
await ed.getByRole("button", { name: "Speichern" }).click();
await page.getByTestId("screen-recipes").waitFor();
await waitSynced(page);
await tab(page, "Heute", "screen-today");
const after = num(await row.locator(".kcal").textContent());
check("Geloggter Eintrag unverändert nach Rezept-Änderung", after === logged, `${after} kcal`);

const ctx2 = await browser.newContext(device);
const page2 = await open(ctx2);
await login(page2);
await waitSynced(page2);
const row2 = page2.getByTestId("entry-row").filter({ hasText: RECIPE });
const synced = await row2.waitFor({ timeout: 15000 }).then(() => true, () => false);
check("Zweites Gerät: Snapshot vom Server unverändert", synced && num(await row2.locator(".kcal").textContent()) === logged);

// ─── 3. Export downloads 7 / 14 / 31 / 90 days ───────────────────────────────────────────────
await tab(page2, "Export", "screen-export");
const today = await page2.evaluate(() => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date()));
async function download(days, format) {
  await page2.getByRole("radio", { name: `${days} Tage` }).click();
  await page2.getByRole("radio", { name: format, exact: true }).click();
  const [dl] = await Promise.all([page2.waitForEvent("download", { timeout: 30000 }), page2.getByRole("button", { name: "Herunterladen" }).click()]);
  return { name: dl.suggestedFilename(), body: readFileSync(await dl.path()) };
}
for (const days of [7, 14, 31, 90]) {
  const { name, body } = await download(days, "JSON");
  const report = JSON.parse(body.toString("utf8"));
  check(`Export ${days} Tage (JSON)`, report.range.days === days && report.days.length === days && report.range.to === today && name.endsWith(`-bis-${today}.json`), `${report.days.length} Tage`);
  if (days === 7) {
    const entry = report.days.find((d) => d.date === today)?.meals.flatMap((m) => m.entries).find((e) => e.name === RECIPE);
    check("Export enthält den Snapshot-Wert", !!entry && Math.round(entry.nutrients.values.kcal) === logged, entry ? `${Math.round(entry.nutrients.values.kcal)} kcal` : "fehlt");
  }
}
const pdf = await download(7, "PDF");
check("Export PDF", pdf.body.subarray(0, 5).toString() === "%PDF-" && pdf.name.endsWith(".pdf"), `${Math.round(pdf.body.length / 1024)} KB`);
const csv = await download(14, "CSV");
check("Export CSV", csv.name.endsWith(".csv") && csv.body.toString("utf8").includes(today), `${csv.body.toString("utf8").split("\n").length} Zeilen`);
const md = await download(31, "Markdown");
check("Export Markdown", md.name.endsWith(".md") && md.body.toString("utf8").startsWith("#"));

// ─── 4. Progress: 7-day balance next to the Fitnesstracker body trend ────────────────────────
await tab(page2, "Fortschritt", "screen-progress");
check("Fortschritt: 7-Tage-Makrobilanz", await page2.getByTestId("week-balance").isVisible());
check("Fortschritt: Gewichtstrend-Karte", await page2.getByTestId("body-trend").isVisible());
check("Körpertrend-API antwortet", api["/api/nutrition/body-trend"] === 200, String(api["/api/nutrition/body-trend"] ?? "kein Aufruf"));
const overflow = await page2.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
check("Fortschritt: kein horizontaler Overflow", !overflow);
await page2.screenshot({ path: `${OUT}/kcal-progress-390.png`, fullPage: true });
await tab(page2, "Heute", "screen-today");
check("Heute: Phasen-/Trainingszeile", await page2.getByTestId("phase-line").isVisible(), (await page2.getByTestId("phase-line").textContent()).replace(/\d+/g, "#").slice(0, 60));

// ─── 5. Clean up (test account) ──────────────────────────────────────────────────────────────
await row2.getByRole("button", { name: /entfernen$/ }).click();
await page2.waitForTimeout(5500); // the delete goes out after the undo window
await page2.evaluate(() => window.dispatchEvent(new Event("online")));
await tab(page2, "Rezepte", "screen-recipes");
await page2.locator(".recipe-card").filter({ hasText: RECIPE }).getByRole("button", { name: "Bearbeiten" }).click();
await page2.getByTestId("recipe-editor").getByRole("button", { name: "Löschen" }).click();
await page2.getByTestId("screen-recipes").waitFor();
check("Aufräumen synchronisiert", await waitSynced(page2));
check("Rezept und Eintrag entfernt", (await page2.locator(".recipe-card").filter({ hasText: RECIPE }).count()) === 0);

await browser.close();
console.log(results.join("\n"));
console.log(issues.length ? `\nAuffälligkeiten:\n${[...new Set(issues)].join("\n")}` : "\nKeine Konsolenfehler, keine HTTP-Fehler.");
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
