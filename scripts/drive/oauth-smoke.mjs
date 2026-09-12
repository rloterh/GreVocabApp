import { chromium } from "playwright-core";
import fs from "node:fs";

const EXE = process.env.CHROME_EXE;
const OUT = process.env.OUT_DIR;
const errors = [];
const checks = [];
function check(name, ok, detail = "") {
  checks.push({ name, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const browser = await chromium.launch({ executablePath: EXE, headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => errors.push(String(e)));
// A stubbed network produces benign resource failures; a React warning or a
// thrown exception is a real defect. Keep the distinction rather than muting.
page.on("console", (m) => {
  if (m.type() !== "error") return;
  if (/Failed to load resource/.test(m.text())) return;
  errors.push(m.text());
});

await page.addInitScript(() => {
  localStorage.setItem(
    "lexicon.settings.v1",
    JSON.stringify({ state: { theme: "dark", hasOnboarded: true }, version: 0 }),
  );
});

// Intercept the OpenRouter round trip: this drives our flow end to end without
// touching the live service or needing a real account.
await page.route("https://openrouter.ai/auth*", async (route) => {
  const url = new URL(route.request().url());
  const cb = url.searchParams.get("callback_url");
  const challenge = url.searchParams.get("code_challenge");
  const method = url.searchParams.get("code_challenge_method");
  globalThis.__seen = { cb, challenge, method, raw: url.search };
  // Behave as OpenRouter does: redirect back to the callback with a code.
  await route.fulfill({
    status: 302,
    headers: { location: `${cb}?code=THE-AUTH-CODE` },
    body: "",
  });
});

let exchangeBody = null;
await page.route("https://openrouter.ai/api/v1/auth/keys", async (route) => {
  exchangeBody = JSON.parse(route.request().postData() ?? "{}");
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ key: "sk-or-v1-granted-by-the-flow" }),
  });
});

await page.goto("http://localhost:1420/", { waitUntil: "networkidle" });
await page.getByRole("button", { name: /settings/i }).first().click();
await page.waitForTimeout(800);

const body = await page.locator("body").innerText();
check("connect panel is shown", /OpenRouter/.test(body));
check(
  "explains what it buys the user",
  /Sign in with your browser/i.test(body),
  body.match(/Sign in with your browser[^.]*\./)?.[0] ?? "",
);
check("no key field needed for it", !/sk-or/.test(body));

const connect = page.getByRole("button", { name: /^Connect$/ });
check("connect button present", (await connect.count()) === 1);

await connect.click();
// Redirect out and back, then the exchange.
await page.waitForTimeout(2500);

const seen = globalThis.__seen ?? (await page.evaluate(() => globalThis.__seen));
check("authorize request was made", Boolean(seen), JSON.stringify(seen ?? {}));
if (seen) {
  check("declares S256", seen.method === "S256", String(seen.method));
  check("sends a challenge", Boolean(seen.challenge) && seen.challenge.length > 20);
  check("sends no client_id", !seen.raw.includes("client_id"));
  check(
    "callback points back at this app",
    seen.cb?.startsWith("http://localhost:1420/"),
    String(seen.cb),
  );
  check(
    "no unsubstituted placeholder reached the provider",
    !seen.cb?.includes("__PORT__") && !seen.raw.includes("%7B"),
    String(seen.cb),
  );
}

check("code was exchanged", exchangeBody !== null, JSON.stringify(exchangeBody ?? {}));
if (exchangeBody) {
  check("exchange sent the code", exchangeBody.code === "THE-AUTH-CODE");
  check("exchange sent a verifier", typeof exchangeBody.code_verifier === "string");
  check("exchange sent no client secret", !("client_secret" in exchangeBody));
}

const after = await page.evaluate(() => ({
  secret: localStorage.getItem("lexicon.secret.openrouterApiKey"),
  settings: localStorage.getItem("lexicon.settings.v1"),
  pending: sessionStorage.getItem("lexicon.openrouter.pkce"),
  url: window.location.href,
}));
check("key landed in the keystore", after.secret === "sk-or-v1-granted-by-the-flow", String(after.secret));
check("key never entered the settings blob", !after.settings.includes("sk-or-v1"));
check("in-flight verifier was cleaned up", after.pending === null, String(after.pending));
check(
  "authorization code was stripped from the address bar",
  !after.url.includes("code="),
  after.url,
);

await page.waitForTimeout(600);
const after2 = await page.locator("body").innerText();
check("UI now says connected", /Connected/.test(after2));
check("offers a way out", /Disconnect/.test(after2));

fs.mkdirSync(OUT, { recursive: true });
await page.screenshot({ path: `${OUT}/oauth-connected.png` });

// Disconnect should remove it.
await page.getByRole("button", { name: /Disconnect/ }).first().click();
await page.waitForTimeout(700);
const cleared = await page.evaluate(() =>
  localStorage.getItem("lexicon.secret.openrouterApiKey"),
);
check("disconnect removes the key", cleared === null, String(cleared));

check("no uncaught errors throughout", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
