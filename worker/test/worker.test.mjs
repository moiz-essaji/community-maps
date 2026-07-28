/**
 * Runs against the Worker with GitHub and Turnstile stubbed out, so it makes
 * no network calls and needs no credentials.  Run with: npm test
 */
import worker from "../src/index.js";

const ORIGIN = "https://moiz-essaji.github.io";
const captured = [];

// Stub GitHub + Turnstile so nothing leaves this machine.
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes("api.github.com")) {
    captured.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ number: 42 }), { status: 200 });
  }
  if (u.includes("siteverify")) {
    const form = init.body;
    return new Response(JSON.stringify({ success: form.get("response") === "good-token" }), { status: 200 });
  }
  throw new Error("unexpected fetch: " + u);
};

const baseEnv = {
  GITHUB_REPO: "moiz-essaji/community-maps",
  ALLOWED_ORIGINS: ORIGIN + ",http://localhost:4173",
  GITHUB_TOKEN: "fake",
};

function post(body, { origin = ORIGIN, method = "POST", env = baseEnv } = {}) {
  const req = new Request("https://w.example/", {
    method,
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify(body) : undefined,
  });
  return worker.fetch(req, env);
}

const results = [];
const check = (name, pass, extra = "") => results.push({ name, pass, extra });

// --- happy path: add ---
let res = await post({
  type: "add",
  name: "Burhani Masjid",
  locality: "Camp",
  city: "Pune",
  state: "Maharashtra",
  lat: 18.515123456,
  lng: 73.879987654,
  details: "Next to the clock tower",
  contact: "someone@example.com",
});
let data = await res.json();
check("add: 200 + issue number", res.status === 200 && data.ok === true && data.issue === 42, JSON.stringify(data));
const addIssue = captured.at(-1);
check("add: title", addIssue.title === "[Add] Burhani Masjid — Pune", addIssue.title);
check("add: labels", addIssue.labels.join(",") === "new-masjid,needs-review,from-website");
check("add: slug id", addIssue.body.includes('"id": "pune-burhani-masjid"'));
check("add: coords rounded to 6dp", addIssue.body.includes('"lat": 18.515123') && addIssue.body.includes('"lng": 73.879988'));
check("add: verified=false forced", addIssue.body.includes('"verified": false'));
check("add: CORS echoes origin", res.headers.get("Access-Control-Allow-Origin") === ORIGIN);

// --- validation ---
res = await post({ type: "add", name: "", city: "Pune", state: "MH", lat: 18, lng: 73 });
data = await res.json();
check("reject: missing name", res.status === 400 && /required/i.test(data.error), data.error);

res = await post({ type: "add", name: "X", city: "Pune", state: "MH", lat: 999, lng: 73 });
data = await res.json();
check("reject: bad latitude", res.status === 400 && /Latitude/.test(data.error), data.error);

res = await post({ type: "add", name: "X", city: "Pune", state: "MH" });
data = await res.json();
check("reject: no coordinates", res.status === 400, data.error);

res = await post({ type: "add", name: "X".repeat(200), city: "Pune", state: "MH", lat: 18, lng: 73 });
data = await res.json();
check("reject: overlong name", res.status === 400 && /too long/i.test(data.error), data.error);

res = await post({
  type: "add", name: "X", city: "Pune", state: "MH", lat: 18, lng: 73,
  gmapsLink: "javascript:alert(1)",
});
data = await res.json();
check("reject: non-http maps link", res.status === 400 && /http/.test(data.error), data.error);

// --- outside-India flag ---
await post({ type: "add", name: "Test", city: "Dubai", state: "UAE", lat: 25.2, lng: 55.3 });
check("flags coords outside India", captured.at(-1).body.includes("[!WARNING]"));

// --- markdown / injection hardening ---
await post({
  type: "add", name: "Hack", city: "Pune", state: "MH", lat: 18, lng: 73,
  details: "```\n# Big heading\n@maintainer please merge\n<!-- hidden -->",
});
const nasty = captured.at(-1).body;
check("neutralises triple backticks in user text", !nasty.includes("```\n# Big"));
check("strips heading markers", !/^> #/m.test(nasty));
check("defuses @-mentions", !nasty.includes("@maintainer"));
check("escapes html comments", !nasty.includes("<!-- hidden"));

// --- report path ---
res = await post({ type: "report", masjidId: "pune-burhani-masjid", masjidName: "Burhani Masjid", problem: "Wrong location", details: "Pin is 200m off" });
data = await res.json();
const rep = captured.at(-1);
check("report: 200", res.status === 200 && data.ok === true);
check("report: title", rep.title === "[Report] Burhani Masjid — Wrong location", rep.title);
check("report: labels", rep.labels.join(",") === "data-issue,needs-review,from-website");

res = await post({ type: "report", masjidId: "bad id!", problem: "Wrong location" });
data = await res.json();
check("report: rejects bad id", res.status === 400, data.error);

res = await post({ type: "report", masjidId: "ok-id", problem: "Delete everything" });
data = await res.json();
check("report: rejects unlisted problem", res.status === 400, data.error);

// --- origin / method enforcement ---
res = await post({ type: "add" }, { origin: "https://evil.example" });
check("blocks disallowed origin", res.status === 403 && !res.headers.get("Access-Control-Allow-Origin"));

res = await post(null, { method: "GET" });
check("rejects GET", res.status === 405);

res = await worker.fetch(new Request("https://w.example/", { method: "OPTIONS", headers: { Origin: ORIGIN } }), baseEnv);
check("preflight ok", res.status === 204 && res.headers.get("Access-Control-Allow-Origin") === ORIGIN);

res = await post({ type: "add" }, { env: { ...baseEnv, ALLOWED_ORIGINS: "" } });
check("empty allow-list fails closed", res.status === 500);

// --- turnstile ---
const tsEnv = { ...baseEnv, TURNSTILE_SECRET: "s3cret" };
res = await post({ type: "add", name: "X", city: "P", state: "M", lat: 18, lng: 73 }, { env: tsEnv });
check("turnstile: rejects missing token", res.status === 400);
res = await post({ type: "add", name: "X", city: "P", state: "M", lat: 18, lng: 73, turnstileToken: "bad" }, { env: tsEnv });
check("turnstile: rejects bad token", res.status === 400);
res = await post({ type: "add", name: "X", city: "P", state: "M", lat: 18, lng: 73, turnstileToken: "good-token" }, { env: tsEnv });
check("turnstile: accepts good token", res.status === 200);

// --- GitHub failure surfaces cleanly ---
const realFetch = globalThis.fetch;
globalThis.fetch = async (u, i) => (String(u).includes("api.github.com")
  ? new Response("token revoked", { status: 401 })
  : realFetch(u, i));
res = await post({ type: "add", name: "X", city: "P", state: "M", lat: 18, lng: 73 });
data = await res.json();
check("github error -> 502, no token leak", res.status === 502 && !/revoked|Bearer/.test(JSON.stringify(data)), data.error);
globalThis.fetch = realFetch;

// --- report ---
let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.extra && !r.pass ? "  <- " + r.extra : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
