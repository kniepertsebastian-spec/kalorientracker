// Roadmap 04 acceptance: scanner, Scan & Learn, voice, recipe import (link + share target) and
// weekly drops in the mobile viewport against kcal.pwa-tree.de. Test account only (from
// /secrets/.env.claude.local). Output allowlist: step names, counts, booleans, status codes.
// Never credentials, cookies, tokens or response bodies. Everything logged is undone again.
import { readFileSync } from "node:fs";
import { chromium } from "playwright";

const env = {};
for (const line of readFileSync("/secrets/.env.claude.local", "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*[:=]\s*(.*?)\s*$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const KCAL = "https://kcal.pwa-tree.de";
const scrub = (s) => String(s).replace(/[A-Za-z0-9_.-]{28,}/g, "<redacted>").replaceAll(env.TEST_PWA_EMAIL, "<email>").slice(0, 160);
const KNOWN_EAN = "3017620422003"; // a widely listed product in Open Food Facts
// A random in-store code (prefix 29) per run: valid check digit, practically never in a public database.
const ean13 = (body12) => body12 + ((10 - ([...body12].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0) % 10)) % 10);
const UNKNOWN_EAN = ean13(`29${String(Date.now()).slice(-10)}`);

const browser = await chromium.launch({ args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "de-DE",
  timezoneId: "Europe/Berlin",
  permissions: ["camera", "microphone"],
});
const results = [];
const issues = [];
const notes = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra !== "" ? ` (${extra})` : ""}`);
// Expected answers: no session yet (401), AI not configured for the test account (409), AI budget (429).
const expected = (path, status) => (path === "/api/auth/session" && status === 401) || (path.startsWith("/api/nutrition/foods/barcode/") && status === 404) || (/\/api\/nutrition\/(voice|scan|recipe-imports)/.test(path) && (status === 409 || status === 429));

const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && issues.push(`console.error: ${scrub(m.text())}`));
page.on("pageerror", (e) => issues.push(`pageerror: ${scrub(e.message)}`));
page.on("response", (r) => {
  const u = new URL(r.url());
  if (r.status() >= 400) (expected(u.pathname, r.status()) ? notes : issues).push(`HTTP ${r.status()} ${u.pathname.replace(/[0-9a-f-]{36}/, ":id")}`);
});

const ok = (p) => p.then(() => true, () => false);
const entryCount = () => page.getByTestId("entry-row").count();
const countReaches = (n, timeout = 8000) => ok(page.waitForFunction((want) => document.querySelectorAll('[data-testid="entry-row"]').length === want, n, { timeout }));
const undoToast = async () => {
  const btn = page.getByTestId("toast").getByRole("button", { name: "Rückgängig" });
  if (!(await ok(btn.waitFor({ timeout: 5000 })))) return false;
  await btn.click();
  return true;
};
const closeSheet = async () => {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
};
const overflow = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
const smallTargets = (scope) =>
  page.evaluate((sel) => {
    const root = document.querySelector(sel) ?? document;
    return [...root.querySelectorAll("button, select, input:not([type=file]):not([type=checkbox]), [role=radio]")]
      .filter((el) => el.offsetParent !== null)
      .map((el) => el.getBoundingClientRect())
      .filter((r) => r.height < 43.5 || r.width < 43.5).length;
  }, scope);

try {
  // ── Login ──
  await page.goto(KCAL, { waitUntil: "networkidle" });
  if (await page.locator('input[type="password"]').count()) {
    await page.locator('input[type="email"]').fill(env.TEST_PWA_EMAIL);
    await page.locator('input[type="password"]').fill(env.TEST_PWA_PASSWORD);
    await page.locator('button[type="submit"]').click();
  }
  check("Login Test-Account", await ok(page.getByTestId("screen-today").waitFor({ timeout: 20000 })));
  await page.waitForTimeout(1500);
  const before = await entryCount();

  // ── Scanner: camera opens, known code lands in the list, unknown code offers Scan & Learn ──
  await page.getByRole("button", { name: "Barcode" }).click();
  const cam = page.locator(".camera");
  check("Scanner öffnet Kamera", await ok(page.waitForFunction(() => ["running", "unavailable"].includes(document.querySelector(".camera")?.getAttribute("data-state") ?? ""), null, { timeout: 15000 })), await cam.getAttribute("data-state"));
  const manual = page.locator("form").filter({ has: page.locator('input[inputmode="numeric"]') }).last();
  const enter = async (code) => {
    await manual.locator('input[inputmode="numeric"]').fill(code);
    await manual.locator('button[type="submit"]').click();
  };
  await enter(KNOWN_EAN);
  const foundRow = page.getByTestId("scan-list").locator("li").filter({ has: page.locator("select") });
  const knownFound = await ok(foundRow.first().waitFor({ timeout: 20000 }));
  check("Bekannter Barcode in der Liste", knownFound);
  await enter(UNKNOWN_EAN);
  const learnBtn = page.getByTestId("scan-list").getByRole("button", { name: "Scan & Learn" });
  const learnShown = await ok(learnBtn.waitFor({ timeout: 25000 }));
  check("Unbekannter Barcode → Scan & Learn", learnShown);
  if (!learnShown) {
    const rows = await page.getByTestId("scan-list").locator("li").allTextContents();
    issues.push(`scan-list: ${rows.map((t) => scrub(t).slice(0, 60)).join(" | ")}`);
    throw new Error("Scan & Learn fehlt");
  }
  await enter(UNKNOWN_EAN);
  await page.waitForTimeout(800);
  check("Doppelter Scan erzeugt keine zweite Zeile", (await learnBtn.count()) === 1, await learnBtn.count());
  check("Scanner: kein horizontaler Overflow", !(await overflow()));
  await page.screenshot({ path: "/out/r04-scanner.png" });
  await learnBtn.click();
  check("Scan & Learn öffnet mit Fotofeld", await ok(page.getByTestId("label-photo").waitFor({ state: "attached", timeout: 5000 })));
  await page.screenshot({ path: "/out/r04-scanlearn.png" });
  await closeSheet(); // back to the scanner, list kept
  const listKept = await ok(page.getByTestId("log-all").waitFor({ timeout: 5000 }));
  check("Liste bleibt nach Scan & Learn erhalten", listKept);
  if (knownFound && listKept) {
    await page.getByTestId("log-all").click();
    check("Alle übernehmen trägt ein", await countReaches(before + 1));
    check("Rückgängig entfernt den Eintrag", (await undoToast()) && (await countReaches(before)));
  } else await closeSheet();

  // ── Foto tile: Scan & Learn without barcode ──
  await page.getByRole("button", { name: "Foto", exact: true }).click();
  check("Foto-Kachel öffnet Scan & Learn", await ok(page.getByTestId("label-photo").waitFor({ state: "attached", timeout: 5000 })));
  await closeSheet();

  // ── Voice: typed fallback; with AI → preview, without → readable message ──
  await page.getByRole("button", { name: "Sprache", exact: true }).click();
  check("Sprach-Sheet mit Aufnahme-Knopf", await ok(page.getByTestId("record").waitFor({ timeout: 5000 })));
  await page.getByLabel("Mahlzeit als Text").fill("200 g Skyr und eine Banane");
  await page.getByRole("button", { name: "Auswerten" }).click();
  const voicePreview = page.getByTestId("voice-preview");
  const voiceError = page.locator(".sheet-body .danger");
  await ok(Promise.race([voicePreview.waitFor({ timeout: 30000 }), voiceError.waitFor({ timeout: 30000 })]));
  if (await voicePreview.count()) {
    check("Sprache: Vorschau mit Kandidaten", (await voicePreview.locator("li").count()) > 0, `${await voicePreview.locator("li").count()} Positionen`);
  } else {
    const text = (await voiceError.textContent()) ?? "";
    check("Sprache ohne KI: verständliche Meldung", /Gemini|KI|Budget|Kontingent/i.test(text) && !/HTTP \d/.test(text), scrub(text).slice(0, 90));
  }
  await page.screenshot({ path: "/out/r04-voice.png" });
  await closeSheet();

  // ── Recipes: weekly drops, link import preview, share target ──
  await page.goto(`${KCAL}/#/rezepte`, { waitUntil: "networkidle" });
  const drops = page.getByTestId("weekly-drops");
  const hasDrops = await ok(drops.waitFor({ timeout: 15000 }));
  const dropCount = hasDrops ? await drops.locator("li.drop").count() : 0;
  check("Weekly Drops sichtbar (3–5 Ideen)", hasDrops && dropCount >= 3 && dropCount <= 5, dropCount);
  if (dropCount > 0) {
    await drops.locator("li.drop").first().locator(".list-row").click();
    check("Drop aufklappbar (Zutaten)", (await drops.locator(".drop-body li").count()) > 0);
    await page.screenshot({ path: "/out/r04-drops.png", fullPage: true });
    await drops.getByTestId("drop-log").first().click();
    check("Drop 1-Tap eintragen mit Rückgängig", await undoToast());
  }

  await page.getByTestId("open-import").click();
  await page.getByPlaceholder("https://…").fill("https://example.org/");
  await page.getByRole("button", { name: "Vorschau laden" }).click();
  const status = page.getByTestId("import-status");
  check("Link-Import legt Vorschau-Job an", await ok(status.waitFor({ timeout: 10000 })));
  const settled = await ok(page.waitForFunction(() => /Vorschau bereit|Fehlgeschlagen|Entwurf bereit/.test(document.querySelector('[data-testid="import-status"]')?.textContent ?? ""), null, { timeout: 30000 }));
  check("Vorschau kostenlos (ohne Analyse) fertig", settled && (await page.getByTestId("import-confirm").count()) + (await status.locator(".danger").count()) > 0);
  await page.screenshot({ path: "/out/r04-import.png" });
  await page.getByTestId("import-discard").click();
  await page.waitForTimeout(800);
  await closeSheet();

  await page.goto(`${KCAL}/share-target?title=Test&text=${encodeURIComponent("Schau mal https://example.org/ lecker")}`, { waitUntil: "networkidle" });
  check("Share Target öffnet Rezepte", await ok(page.getByTestId("screen-recipes").waitFor({ timeout: 15000 })), new URL(page.url()).pathname + new URL(page.url()).hash);
  check("Geteilter Link startet Vorschau", await ok(page.getByTestId("import-status").waitFor({ timeout: 15000 })));
  await ok(page.waitForFunction(() => !/Vorschau lädt/.test(document.querySelector('[data-testid="import-status"]')?.textContent ?? ""), null, { timeout: 30000 }));
  if (await page.getByTestId("import-discard").count()) await page.getByTestId("import-discard").click();
  await page.waitForTimeout(800);
  check("Import-Sheet: Touch-Targets ≥ 44 px", (await smallTargets("dialog[open]")) === 0, await smallTargets("dialog[open]"));
  await closeSheet();

  // ── Cleanup check: the day is as before ──
  await page.goto(KCAL, { waitUntil: "networkidle" });
  await page.getByTestId("screen-today").waitFor({ timeout: 15000 });
  check("Tag unverändert nach Aufräumen", await countReaches(before, 10000), `${await entryCount()} / ${before}`);
} catch (e) {
  issues.push(`abort: ${scrub(e.message)}`);
} finally {
  await browser.close();
}

console.log(results.join("\n"));
console.log(`\nErwartete Antworten (ohne KI-Key): ${[...new Set(notes)].join(", ") || "keine"}`);
console.log(issues.length ? `\nProbleme:\n${[...new Set(issues)].join("\n")}` : "\nKeine Konsolen-, Seiten- oder Netzwerkfehler.");
process.exit(results.some((r) => r.startsWith("FAIL")) || issues.length ? 1 : 0);
