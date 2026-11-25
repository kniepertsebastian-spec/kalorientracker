// Roadmap 05 mobile acceptance that a browser can emulate: WebKit with an iPhone profile (the
// Safari engine) for login, IndexedDB persistence across reloads and an offline cold start, plus
// every tab and capture sheet at 320 px and 390 px without horizontal overflow. Real-device checks
// (home-screen install, camera, microphone) are in docs/MOBILE-ACCEPTANCE.md. Test account only.
import { chromium, devices, webkit } from "playwright";
import { KCAL, OUT, env, scrub } from "./env.mjs";

const results = [];
const issues = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra !== "" ? ` (${extra})` : ""}`);
let offlinePhase = false;

async function open(context, label) {
  const page = await context.newPage();
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    if (offlinePhase && /internet|network|offline|Failed to fetch|Failed to load resource|Load failed/i.test(m.text())) return;
    issues.push(`${label} console.error: ${scrub(m.text())}`);
  });
  page.on("pageerror", (e) => issues.push(`${label} pageerror: ${scrub(e.message)}`));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (r.status() >= 400 && !(u.pathname === "/api/auth/session" && r.status() === 401)) issues.push(`${label} HTTP ${r.status()} ${u.pathname}`);
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
const waitTone = (page, want, timeout = 30000) =>
  page.waitForFunction((w) => document.querySelector('[data-testid="sync-status"]')?.getAttribute("data-tone") === w, want, { timeout }).then(() => true, () => false);

/** Horizontal overflow of the page and of an open sheet; offenders named by tag/class. */
const overflow = (page) =>
  page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const wide = [...document.querySelectorAll("body *")]
      .filter((el) => el.offsetParent !== null || el.tagName === "DIALOG")
      .filter((el) => el.getBoundingClientRect().right > vw + 1 && getComputedStyle(el).position !== "fixed")
      .slice(0, 3)
      .map((el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(" ")[0]}` : ""}`);
    const dlg = document.querySelector("dialog[open]");
    const name = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.split(" ")[0]}` : ""}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label").slice(0, 16)}]` : ""} ${Math.round(el.getBoundingClientRect().width)}px`;
    const inner = dlg ? [...dlg.querySelectorAll("*")].filter((el) => el.getBoundingClientRect().right > dlg.getBoundingClientRect().left + dlg.clientWidth + 1).slice(0, 3).map(name) : [];
    return { page: document.documentElement.scrollWidth > vw, sheet: dlg ? dlg.scrollWidth > dlg.clientWidth + 1 : false, wide: [...wide, ...inner] };
  });

const TABS = [
  ["Heute", "screen-today"],
  ["Rezepte", "screen-recipes"],
  ["Fortschritt", "screen-progress"],
  ["Export", "screen-export"],
  ["Mehr", "screen-more"],
];
const SHEETS = [
  ["Suche", { name: "Suche", exact: true }],
  ["Schnelleingabe", { name: /Schätzung|Schnelleingabe/ }],
  ["Barcode", { name: "Barcode", exact: true }],
  ["Foto", { name: "Foto", exact: true }],
  ["Sprache", { name: "Sprache", exact: true }],
];

async function sweep(page, label) {
  for (const [name, id] of TABS) {
    await page.getByRole("link", { name, exact: true }).click();
    await page.getByTestId(id).waitFor();
    await page.waitForTimeout(200);
    const o = await overflow(page);
    check(`${label} · ${name}: kein horizontaler Overflow`, !o.page, o.wide.join(", "));
  }
  await page.getByRole("link", { name: "Heute", exact: true }).click();
  await page.getByTestId("screen-today").waitFor();
  for (const [name, role] of SHEETS) {
    const btn = page.getByRole("button", role).first();
    if (!(await btn.count())) {
      check(`${label} · Sheet ${name}: vorhanden`, false);
      continue;
    }
    await btn.click();
    const dlg = page.getByRole("dialog");
    await dlg.waitFor({ timeout: 10000 }).catch(() => undefined);
    await page.waitForTimeout(300);
    const o = await overflow(page);
    check(`${label} · Sheet ${name}: kein horizontaler Overflow`, !o.page && !o.sheet, o.wide.join(", "));
    await page.keyboard.press("Escape");
    await dlg.waitFor({ state: "detached", timeout: 5000 }).catch(async () => {
      await dlg.getByRole("button", { name: /Schließen|Abbrechen/ }).first().click().catch(() => undefined);
    });
  }
}

// ─── 1. WebKit / iPhone (Safari engine) ──────────────────────────────────────────────────────
const wk = await webkit.launch();
const iphone = await wk.newContext({ ...devices["iPhone 13"], locale: "de-DE", timezoneId: "Europe/Berlin" });
const ip = await open(iphone, "WebKit");
check("WebKit/iPhone: Login (Test-Account)", await login(ip));
check("WebKit/iPhone: Synchronisiert", await waitTone(ip, "synced"));
const TAG = `E2E-${Date.now().toString(36)}`;
const before = await ip.getByTestId("entry-row").count();
await ip.getByRole("button", { name: /Schätzung|Schnelleingabe/ }).first().click();
const qd = ip.getByRole("dialog");
await qd.getByLabel("Kalorien (kcal)").fill("321");
await qd.getByLabel("Notiz (optional)").fill(`${TAG} iPhone`);
await qd.getByRole("button", { name: "Eintragen" }).click();
await qd.waitFor({ state: "detached" });
await waitTone(ip, "synced");
const rows = await ip.getByTestId("entry-row").count();
check("WebKit/iPhone: Eintrag gespeichert und synchronisiert", rows === before + 1, `${rows} Einträge`);
const dbs = await ip.evaluate(async () => (indexedDB.databases ? (await indexedDB.databases()).map((d) => d.name) : []));
check("WebKit/iPhone: IndexedDB angelegt", dbs.length > 0, `${dbs.length} Datenbank(en)`);
await ip.reload({ waitUntil: "networkidle" });
await ip.getByTestId("screen-today").waitFor();
check("WebKit/iPhone: Daten überleben Reload", (await ip.getByTestId("entry-row").count()) === rows, `${rows} Einträge`);
const sw = await ip.evaluate(() => navigator.serviceWorker?.ready.then(() => !!navigator.serviceWorker.controller).catch(() => false) ?? false);
if (sw) {
  offlinePhase = true;
  await iphone.setOffline(true);
  await ip.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);
  const started = await ip.getByTestId("screen-today").waitFor({ timeout: 15000 }).then(() => true, () => false);
  check("WebKit/iPhone: Offline-Kaltstart aus Service Worker + IndexedDB", started && (await ip.getByTestId("entry-row").count()) === rows);
  await iphone.setOffline(false);
  offlinePhase = false;
} else check("WebKit/iPhone: Service Worker (Engine-Emulation)", true, "nicht verfügbar – auf echtem iPhone prüfen");
await ip.reload({ waitUntil: "networkidle" });
await ip.getByTestId("screen-today").waitFor();
await sweep(ip, "WebKit 390");
await ip.screenshot({ path: `${OUT}/kcal-webkit-iphone.png`, fullPage: true });
await ip.getByTestId("entry-row").filter({ hasText: TAG }).getByRole("button", { name: /entfernen$/ }).click();
await ip.waitForTimeout(5500); // the delete goes out after the undo window
await ip.evaluate(() => window.dispatchEvent(new Event("online")));
check("WebKit/iPhone: Aufräumen synchronisiert", (await waitTone(ip, "synced")) && (await ip.getByTestId("entry-row").count()) === before);
await wk.close();

// ─── 2. Narrowest common viewport: 320 px (iPhone SE 1st gen / small Android) ───────────────
const cr = await chromium.launch();
const narrow = await cr.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "de-DE", timezoneId: "Europe/Berlin" });
const np = await open(narrow, "320px");
check("320 px: Login", await login(np));
await waitTone(np, "synced");
await sweep(np, "320 px");
for (const [name, id] of TABS) {
  await np.getByRole("link", { name, exact: true }).click();
  await np.getByTestId(id).waitFor();
  await np.screenshot({ path: `${OUT}/kcal-${id.replace("screen-", "")}-320.png`, fullPage: true });
}
await cr.close();

console.log(results.join("\n"));
console.log(issues.length ? `\nAuffälligkeiten:\n${[...new Set(issues)].join("\n")}` : "\nKeine Konsolenfehler, keine HTTP-Fehler.");
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
