// Test-account settings for the live E2E scripts. On the server they come from the mounted,
// gitignored .env.claude.local; in CI from the repository secrets (process.env). Never printed.
import { existsSync, mkdirSync, readFileSync } from "node:fs";

const FILE = process.env.E2E_ENV_FILE ?? "/secrets/.env.claude.local";
export const env = {};
if (existsSync(FILE)) {
  for (const line of readFileSync(FILE, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*[:=]\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
for (const k of ["TEST_PWA_EMAIL", "TEST_PWA_PASSWORD", "TEST_PWA_URL"]) if (!env[k] && process.env[k]) env[k] = process.env[k];
if (!env.TEST_PWA_EMAIL || !env.TEST_PWA_PASSWORD) {
  console.error("Kein Test-Account konfiguriert (TEST_PWA_EMAIL / TEST_PWA_PASSWORD).");
  process.exit(2);
}

export const KCAL = process.env.E2E_KCAL_URL ?? "https://kcal.pwa-tree.de";
export const FITNESS = process.env.E2E_FITNESS_URL ?? "https://fitness.pwa-tree.de";
export const OUT = process.env.E2E_OUT ?? "/out";
mkdirSync(OUT, { recursive: true });
/** Strips anything token-like and the account's address before it reaches a log line. */
export const scrub = (s) => String(s).replace(/[A-Za-z0-9_.-]{28,}/g, "<redacted>").replaceAll(env.TEST_PWA_EMAIL, "<email>").slice(0, 160);
