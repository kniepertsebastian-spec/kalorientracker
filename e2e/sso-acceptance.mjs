// SSO acceptance (Roadmap 01) against the live PWAs with the test account only.
// Output allowlist: paths, status codes, booleans, counts. Never credentials, cookies, tokens or bodies.
import { chromium } from "playwright";
import { FITNESS, KCAL, OUT, env, scrub } from "./env.mjs";


const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  locale: "de-DE",
  timezoneId: "Europe/Berlin",
});
const issues = [];
const authCalls = [];
context.on("page", () => {});
const page = await context.newPage();
page.on("console", (m) => m.type() === "error" && issues.push(`console.error ${new URL(page.url()).host}: ${scrub(m.text())}`));
page.on("pageerror", (e) => issues.push(`pageerror ${new URL(page.url()).host}: ${scrub(e.message)}`));
page.on("response", (r) => {
  const u = new URL(r.url());
  if (u.pathname.startsWith("/api/auth/")) authCalls.push(`${u.host}${u.pathname} ${r.status()}`);
  if (r.status() >= 400) issues.push(`HTTP ${r.status()} ${u.host}${u.pathname}`);
});
const results = [];
const check = (name, ok, extra = "") => results.push(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? ` (${extra})` : ""}`);

// 1. Login in the Fitnesstracker
await page.goto(`${FITNESS}/login`, { waitUntil: "networkidle" });
await page.locator('input[type="email"]').fill(env.TEST_PWA_EMAIL);
await page.locator('input[type="password"]').fill(env.TEST_PWA_PASSWORD);
await page.locator('button[type="submit"]').click();
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 }).catch(() => {});
check("Login im Fitnesstracker", !new URL(page.url()).pathname.startsWith("/login"), new URL(page.url()).pathname);
// No URL filter: context.cookies(url) also filters by path, and the cookie is scoped to /api/auth.
const domainCookie = (await context.cookies()).some((c) => c.name === "refreshToken" && c.domain.replace(/^\./, "") === "pwa-tree.de" && c.httpOnly && c.secure);
check("Refresh-Cookie für pwa-tree.de (HttpOnly, Secure)", domainCookie);

// 2. Kalorientracker without a second login
authCalls.length = 0;
await page.goto(KCAL, { waitUntil: "networkidle" });
// Since Roadmap 03 the app opens on "Heute"; logout lives under "Mehr" and ends both sessions.
const today = page.getByTestId("screen-today");
const logoutBtn = page.getByRole("button", { name: /^Abmelden/ });
const loggedIn = await today.waitFor({ timeout: 15000 }).then(() => true, () => false);
check("Kalorientracker ohne zweite Anmeldung", loggedIn);
check("Kein Login-Formular sichtbar", (await page.locator('input[type="password"]').count()) === 0);
check("Keine 401/403-Schleife", authCalls.length <= 2 && !authCalls.some((c) => / 40[13]$/.test(c)), authCalls.join(", "));
await page.screenshot({ path: `${OUT}/kcal-home-390.png`, fullPage: true });

// 3. Layout
const layout = await page.evaluate(() => {
  const d = document.documentElement;
  const small = [...document.querySelectorAll("button, a, input, label.toggle, [role=button]")]
    .filter((el) => el.offsetParent !== null && !(el.tagName === "INPUT" && el.closest("label")))
    .map((el) => ({ el, r: el.getBoundingClientRect() }))
    .filter(({ r }) => r.width < 44 || r.height < 44)
    .map(({ el, r }) => `${el.tagName.toLowerCase()}${el.className ? "." + el.className : ""} ${Math.round(r.width)}x${Math.round(r.height)}`);
  const tabular = [...document.querySelectorAll(".num")].every((el) => getComputedStyle(el).fontVariantNumeric.includes("tabular-nums"));
  return { overflow: d.scrollWidth > d.clientWidth, small, tabular, nums: document.querySelectorAll(".num").length };
});
check("Kein horizontaler Overflow (390 px)", !layout.overflow);
check("Touch-Targets >= 44x44", layout.small.length === 0, layout.small.join("; "));
check("Zahlen mit tabular-nums", layout.tabular && layout.nums > 0, `${layout.nums} Werte`);

// 4. Manifest and service worker
const pwa = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]');
  let manifest = null;
  if (link) manifest = await fetch(link.href).then((r) => (r.ok ? r.json() : null), () => null);
  const reg = await Promise.race([navigator.serviceWorker?.ready.then(() => true), new Promise((r) => setTimeout(() => r(false), 10000))]);
  return { manifest: manifest && { name: manifest.name, display: manifest.display, icons: manifest.icons?.length, theme: manifest.theme_color }, sw: reg };
});
check("Manifest geladen", !!pwa.manifest, pwa.manifest && `${pwa.manifest.name}, ${pwa.manifest.display}, ${pwa.manifest.icons} Icons, ${pwa.manifest.theme}`);
check("Service Worker aktiv", pwa.sw);

// 5. Reload keeps the session
await page.reload({ waitUntil: "networkidle" });
check("Session übersteht Reload", await today.waitFor({ timeout: 15000 }).then(() => true, () => false));

// 6. Logout in the Kalorientracker ends the Fitnesstracker session too
await page.getByRole("link", { name: "Mehr", exact: true }).click();
await logoutBtn.click();
const loginShown = await page.locator('input[type="password"]').waitFor({ timeout: 15000 }).then(() => true, () => false);
check("Logout im Kalorientracker zeigt Login", loginShown);
check("Kein Refresh-Cookie mehr", !(await context.cookies()).some((c) => c.name === "refreshToken" && c.value));
await page.goto(FITNESS, { waitUntil: "networkidle" });
await page.waitForURL((u) => u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => {});
check("Fitnesstracker danach abgemeldet", new URL(page.url()).pathname.startsWith("/login"), new URL(page.url()).pathname);

await browser.close();
console.log(results.join("\n"));
console.log(`\nAuffälligkeiten (${issues.length}):`);
for (const i of [...new Set(issues)]) console.log(`  ${i}`);
