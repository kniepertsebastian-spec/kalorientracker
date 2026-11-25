// App shortcuts (manifest): /#snack opens the voice sheet with the text field focused and the meal
// set to Snack (visible in the review step), /#sprache opens voice capture; afterwards the hash is #heute. Nothing is logged:
// the sheet is only opened and closed. Test account only.
import { chromium } from "playwright";
import { KCAL, OUT, env, scrub } from "./env.mjs";

const results = [];
const issues = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra !== "" ? ` (${extra})` : ""}`);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: "de-DE", timezoneId: "Europe/Berlin" });
const page = await ctx.newPage();
page.on("console", (m) => m.type() === "error" && issues.push(`console.error: ${scrub(m.text())}`));
page.on("pageerror", (e) => issues.push(`pageerror: ${scrub(e.message)}`));
page.on("response", (r) => {
  const u = new URL(r.url());
  if (r.status() >= 400 && !(u.pathname === "/api/auth/session" && r.status() === 401)) issues.push(`HTTP ${r.status()} ${u.pathname}`);
});

const manifest = await (await page.request.get(`${KCAL}/manifest.webmanifest`)).json();
const urls = (manifest.shortcuts ?? []).map((s) => s.url);
check("Manifest: Shortcuts Snack und Sprache", urls.includes("/#snack") && urls.includes("/#sprache"), urls.join(", "));

await page.goto(KCAL, { waitUntil: "networkidle" });
if (await page.locator('input[type="password"]').count()) {
  await page.locator('input[type="email"]').fill(env.TEST_PWA_EMAIL);
  await page.locator('input[type="password"]').fill(env.TEST_PWA_PASSWORD);
  await page.locator('button[type="submit"]').click();
}
check("Login (Test-Account)", await page.getByTestId("screen-today").waitFor({ timeout: 20000 }).then(() => true, () => false));

async function launch(hash) {
  // A shortcut starts the app fresh at that URL, so load it like a cold start.
  await page.goto(`${KCAL}/${hash}`, { waitUntil: "networkidle" });
  const dlg = page.getByRole("dialog");
  const opened = await dlg.waitFor({ timeout: 15000 }).then(() => true, () => false);
  return { dlg, opened };
}

let { dlg, opened } = await launch("#snack");
check("#snack öffnet das Sheet", opened);
if (opened) {
  const field = dlg.getByLabel("Mahlzeit als Text");
  check("#snack: Textfeld hat den Fokus", await field.evaluate((el) => el === document.activeElement).catch(() => false));
  await page.screenshot({ path: `${OUT}/kcal-shortcut-snack.png` });
}
check("#snack: Hash danach #heute", new URL(page.url()).hash === "#heute", new URL(page.url()).hash);
await page.keyboard.press("Escape");
await dlg.waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
await page.reload({ waitUntil: "networkidle" });
check("Reload öffnet das Sheet nicht erneut", (await page.getByRole("dialog").count()) === 0);

({ dlg, opened } = await launch("#sprache"));
check("#sprache öffnet die Sprachaufnahme", opened && (await dlg.getByTestId("record").isVisible().catch(() => false)));
await page.keyboard.press("Escape");

await browser.close();
console.log(results.join("\n"));
console.log(issues.length ? `\nAuffälligkeiten:\n${[...new Set(issues)].join("\n")}` : "\nKeine Konsolenfehler, keine HTTP-Fehler.");
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
