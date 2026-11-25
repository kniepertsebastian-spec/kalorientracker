// Roadmap 03 acceptance: a nutrition day logged offline in the mobile viewport syncs on reconnect.
// Test account only (from /secrets/.env.claude.local). Output allowlist: step names, counts,
// booleans, sizes. Never credentials, cookies, tokens or response bodies.
import { chromium } from "playwright";
import { KCAL, OUT, env, scrub } from "./env.mjs";

const TAG = `E2E-${Date.now().toString(36)}`;

const browser = await chromium.launch();
const device = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "de-DE", timezoneId: "Europe/Berlin" };
const results = [];
const issues = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra !== "" ? ` (${extra})` : ""}`);
let offlinePhase = false;

async function open(context) {
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    // While offline, the browser itself logs the refused requests: expected, not an app error.
    if (offlinePhase && /ERR_INTERNET_DISCONNECTED|Failed to fetch|Failed to load resource/.test(t)) return;
    issues.push(`console.error: ${scrub(t)}`);
  });
  page.on("pageerror", (e) => issues.push(`pageerror: ${scrub(e.message)}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
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

const tone = (page) => page.getByTestId("sync-status").getAttribute("data-tone");
const waitTone = (page, want, timeout = 20000) =>
  page.waitForFunction((w) => document.querySelector('[data-testid="sync-status"]')?.getAttribute("data-tone") === w, want, { timeout }).then(() => true, () => false);
const entryRows = (page) => page.getByTestId("entry-row");
// Live queries re-render a moment after the write: wait for the count instead of sampling it.
const rowsReach = (page, n, timeout = 5000) =>
  page.waitForFunction((want) => document.querySelectorAll('[data-testid="entry-row"]').length === want, n, { timeout }).then(() => true, () => false);
// "kcal offen" with targets; the day's total when the account has no Fitnesstracker profile.
const kcalLeft = async (page) => (await page.getByTestId("hero").locator(".hero-number").first().textContent()).trim();

async function quickAdd(page, kcal, protein, note) {
  await page.getByRole("button", { name: /Schätzung|Schnelleingabe/ }).first().click();
  const dlg = page.getByRole("dialog");
  await dlg.getByLabel("Kalorien (kcal)").fill(String(kcal));
  if (protein !== null) await dlg.getByLabel("Protein in g (optional)").fill(String(protein));
  await dlg.getByLabel("Notiz (optional)").fill(note);
  await dlg.getByRole("button", { name: "Eintragen" }).click();
  await dlg.waitFor({ state: "detached" });
}

async function layoutCheck(page, name) {
  const layout = await page.evaluate(() => {
    const d = document.documentElement;
    const small = [...document.querySelectorAll("button, a, select, input:not([type=checkbox]), label.switch")]
      .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === "fixed")
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.width < 44 || r.height < 44))
      .map(({ el, r }) => `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label").slice(0, 20)}]` : ""} ${Math.round(r.width)}x${Math.round(r.height)}`);
    const nums = [...document.querySelectorAll(".num, td, dd")];
    const tabular = nums.every((el) => getComputedStyle(el).fontVariantNumeric.includes("tabular-nums"));
    return { overflow: d.scrollWidth > d.clientWidth, small, tabular, nums: nums.length };
  });
  check(`${name}: kein horizontaler Overflow`, !layout.overflow);
  check(`${name}: Touch-Targets ≥ 44 px`, layout.small.length === 0, layout.small.slice(0, 5).join(", "));
  check(`${name}: tabular-nums`, layout.tabular, `${layout.nums} Zahlen`);
}

// ─── 1. Online: login, service worker, cache a food by using it ──────────────────────────────
const ctx = await browser.newContext(device);
const page = await open(ctx);
check("Login auf kcal (Test-Account)", await login(page));
await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
await page.reload({ waitUntil: "networkidle" }); // now controlled by the service worker
await page.getByTestId("screen-today").waitFor();
check("Service Worker steuert die Seite", await page.evaluate(() => !!navigator.serviceWorker.controller));
check("Sync-Status „Synchronisiert“", await waitTone(page, "synced"), await page.getByTestId("sync-status").textContent());
const before = await entryRows(page).count();
check("Ausgangslage: Tag des Test-Accounts", true, `${before} Einträge`);

await page.getByRole("button", { name: "Suche", exact: true }).click();
let dlg = page.getByRole("dialog");
await dlg.getByLabel("Lebensmittel suchen").fill("Magerquark");
const hit = dlg.locator(".list-row").first();
const found = await hit.waitFor({ timeout: 15000 }).then(() => true, () => false);
check("Online-Suche liefert Treffer", found);
const foodName = found ? (await hit.locator(".name").textContent()).trim() : null;
await hit.click();
await dlg.getByLabel("Menge").fill("250");
const preview = await dlg.getByTestId("amount-preview").textContent();
check("Live-Vorschau und Restbudget", /kcal/.test(preview) && (await dlg.getByTestId("live-budget").count()) >= 0);
await dlg.getByRole("button", { name: "Eintragen" }).click();
await dlg.waitFor({ state: "detached" });
check("Eintrag online gespeichert", await rowsReach(page, before + 1));
await waitTone(page, "synced");

// ─── 2. Offline: a whole day ─────────────────────────────────────────────────────────────────
offlinePhase = true;
await ctx.setOffline(true);
check("Indikator zeigt „Offline“", await waitTone(page, "offline", 5000), await page.getByTestId("sync-status").textContent());
const leftBefore = await kcalLeft(page);
await quickAdd(page, 450, 30, `${TAG} Frühstück`);
await quickAdd(page, 820, 45, `${TAG} Mittag auswärts`);
await page.getByRole("button", { name: "Suche", exact: true }).click();
dlg = page.getByRole("dialog");
await dlg.getByLabel("Lebensmittel suchen").fill("Magerquark");
const cached = await dlg.locator(".list-row").first().waitFor({ timeout: 5000 }).then(() => true, () => false);
check("Offline-Suche findet das gecachte Lebensmittel", cached);
if (cached) {
  await dlg.locator(".list-row").first().click();
  check("Smart Default: letzte Menge vorbelegt", (await dlg.getByLabel("Menge").inputValue()) === "250");
  await dlg.getByLabel("Menge").fill("150");
  await dlg.getByRole("radio", { name: "Abend" }).click();
  await dlg.getByRole("button", { name: "Eintragen" }).click();
  await dlg.waitFor({ state: "detached" });
} else await dlg.getByRole("button", { name: "Schließen" }).click();
await page.getByLabel("Kurznotiz zur Bewertung").fill(`${TAG} Bewertung`);
await page.getByRole("radio", { name: /^8 – / }).click();
const expected = before + 1 + 2 + (cached ? 1 : 0);
check("Offline-Einträge sofort sichtbar", await rowsReach(page, expected), `${await entryRows(page).count()} Einträge`);
const offlineCount = expected;
check("Hero-Zahl (Restbudget bzw. Tagessumme) aktualisiert", (await kcalLeft(page)) !== leftBefore);
check("Bewertung lokal gespeichert", ((await page.getByTestId("rating-label").textContent()) ?? "").includes("8"));
check("Indikator zählt Ausstehende", /Offline · \d+/.test(await page.getByTestId("sync-status").textContent()), await page.getByTestId("sync-status").textContent());

// Swipe to delete, then undo.
const last = entryRows(page).last();
const box = await last.boundingBox();
await page.mouse.move(box.x + box.width - 60, box.y + box.height / 2);
await page.mouse.down();
for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width - 60 - i * 25, box.y + box.height / 2);
await page.mouse.up();
check("Swipe entfernt den Eintrag", await rowsReach(page, offlineCount - 1));
await page.getByTestId("toast").getByRole("button", { name: "Rückgängig" }).click();
check("Rückgängig stellt ihn wieder her", await rowsReach(page, offlineCount));

await page.reload({ waitUntil: "domcontentloaded" });
const reloaded = await page.getByTestId("screen-today").waitFor({ timeout: 15000 }).then(() => true, () => false);
check("Offline-Reload: App startet aus Service Worker + IndexedDB", reloaded && (await rowsReach(page, offlineCount)));
await page.screenshot({ path: `${OUT}/kcal-offline-today-390.png`, fullPage: true });

// ─── 3. Back online: sync, then prove it from a fresh device ─────────────────────────────────
await ctx.setOffline(false);
offlinePhase = false;
await page.evaluate(() => window.dispatchEvent(new Event("online")));
check("Nach Reconnect „Synchronisiert“", await waitTone(page, "synced", 30000), await page.getByTestId("sync-status").textContent());
await layoutCheck(page, "Heute");
await page.screenshot({ path: `${OUT}/kcal-today-390.png`, fullPage: true });

for (const [hash, name] of [["rezepte", "Rezepte"], ["fortschritt", "Fortschritt"], ["export", "Export"], ["mehr", "Mehr"]]) {
  await page.getByRole("link", { name, exact: true }).click();
  await page.getByTestId(`screen-${hash === "rezepte" ? "recipes" : hash === "fortschritt" ? "progress" : hash === "export" ? "export" : "more"}`).waitFor();
  await layoutCheck(page, name);
  await page.screenshot({ path: `${OUT}/kcal-${hash}-390.png`, fullPage: true });
}

const ctx2 = await browser.newContext(device);
const page2 = await open(ctx2);
check("Zweites Gerät: Login", await login(page2));
await waitTone(page2, "synced");
await rowsReach(page2, offlineCount, 10000);
const serverCount = await entryRows(page2).count();
check("Zweites Gerät sieht alle Einträge vom Server", serverCount === offlineCount, `${serverCount}`);
check("Zweites Gerät sieht die Bewertung", ((await page2.getByTestId("rating-label").textContent().catch(() => "")) ?? "").includes("8"));
check("Keine Duplikate (konfliktfrei)", serverCount === offlineCount);

// ─── 4. Clean up what this run created (test account) ────────────────────────────────────────
let removed = 0;
for (;;) {
  const rows = entryRows(page2).filter({ hasText: TAG });
  if ((await rows.count()) === 0) break;
  await rows.first().getByRole("button", { name: /entfernen$/ }).click();
  removed++;
  await page2.waitForTimeout(150);
}
if (foodName) {
  for (let i = 0; i < 1 + (cached ? 1 : 0); i++) {
    const rows = entryRows(page2).filter({ hasText: foodName });
    if ((await rows.count()) === 0) break;
    await rows.last().getByRole("button", { name: /entfernen$/ }).click();
    removed++;
    await page2.waitForTimeout(150);
  }
}
if (await page2.getByRole("button", { name: "Löschen" }).count()) await page2.getByRole("button", { name: "Löschen" }).click();
await page2.waitForTimeout(5500); // the delete goes out after the undo window
await page2.evaluate(() => window.dispatchEvent(new Event("online")));
check("Aufräumen synchronisiert", await waitTone(page2, "synced", 30000), `${removed} Einträge + Bewertung entfernt`);
check("Tag wieder im Ausgangszustand", await rowsReach(page2, before), `${await entryRows(page2).count()}`);

await browser.close();
console.log(results.join("\n"));
console.log(issues.length ? `\nAuffälligkeiten:\n${[...new Set(issues)].join("\n")}` : "\nKeine Konsolenfehler, keine HTTP-Fehler.");
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
