/**
 * Submission worker for Community Maps.
 *
 * Receives "add a masjid" / "report a problem" submissions from the website and
 * files them as GitHub issues, so visitors never need a GitHub account. The
 * maintainer reviews each issue and merges the data by hand — nothing a visitor
 * sends is ever written straight to the map.
 *
 * Secrets (set with `wrangler secret put`, never committed):
 *   GITHUB_TOKEN      fine-grained PAT with Issues: Read and write
 *   TURNSTILE_SECRET  optional; enables spam protection
 *
 * Vars (in wrangler.toml):
 *   GITHUB_REPO       "owner/repo" that receives the issues
 *   ALLOWED_ORIGINS   comma-separated list of sites allowed to post here
 */

const MAX = { name: 120, locality: 120, city: 80, state: 80, gmaps: 500, details: 1500, contact: 120 };

const PROBLEMS = [
  "Wrong location",
  "Wrong name or details",
  "Permanently closed",
  "Duplicate",
  "Other",
];

// Rough bounding box for India. Outside it we still accept the submission but
// flag it in the issue, since it's usually a mis-tap on the map.
const INDIA_BBOX = { minLat: 6.0, maxLat: 37.5, minLng: 68.0, maxLng: 97.5 };

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((o) => o.trim())
      .filter(Boolean);

    // An empty allow-list would let any site post here, so treat it as a
    // misconfiguration rather than an invitation.
    if (allowed.length === 0) {
      return json({ ok: false, error: "Worker is misconfigured." }, 500);
    }

    const isAllowed = allowed.includes(origin);
    const cors = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin",
    };

    if (request.method === "OPTIONS") {
      return isAllowed ? new Response(null, { status: 204, headers: cors }) : new Response(null, { status: 403 });
    }
    if (!isAllowed) {
      return json({ ok: false, error: "This origin is not allowed to submit." }, 403);
    }
    if (request.method !== "POST") {
      return json({ ok: false, error: "Method not allowed." }, 405, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: "Expected a JSON body." }, 400, cors);
    }

    // ---- spam check ----
    if (env.TURNSTILE_SECRET) {
      const ok = await verifyTurnstile(env.TURNSTILE_SECRET, body.turnstileToken, request);
      if (!ok) {
        return json({ ok: false, error: "Spam check failed. Please try again." }, 400, cors);
      }
    }

    // ---- validate ----
    let issue;
    try {
      issue = body.type === "report" ? buildReportIssue(body) : buildAddIssue(body);
    } catch (err) {
      return json({ ok: false, error: err.message }, 400, cors);
    }

    // ---- file it ----
    try {
      const number = await createIssue(env, issue);
      return json({ ok: true, issue: number }, 200, cors);
    } catch (err) {
      // Keep the real reason in the Worker log; don't leak API details outward.
      console.error("GitHub issue creation failed:", err);
      return json({ ok: false, error: "Couldn't file your submission right now." }, 502, cors);
    }
  },
};

// ---------- helpers ----------

function json(payload, status, extraHeaders) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...(extraHeaders || {}) },
  });
}

function str(value, max, label, { required = false } = {}) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s) {
    if (required) throw new Error(`${label} is required.`);
    return "";
  }
  if (s.length > max) throw new Error(`${label} is too long.`);
  return s;
}

/**
 * Neutralise anything that would break out of the issue's markdown structure
 * or smuggle instructions into it. User text is data, not formatting.
 */
function safeText(s) {
  return s
    .replace(/\r/g, "")
    .replace(/`{3,}/g, "``")
    .replace(/<!--/g, "&lt;!--")
    .replace(/^\s*#{1,6}\s/gm, "")
    .replace(/^\s*@/gm, "＠"); // don't let submissions @-mention people
}

function quote(s) {
  if (!s) return "_(none)_";
  return safeText(s)
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function slug(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function buildAddIssue(body) {
  const name = str(body.name, MAX.name, "Masjid name", { required: true });
  const locality = str(body.locality, MAX.locality, "Locality");
  const city = str(body.city, MAX.city, "City", { required: true });
  const state = str(body.state, MAX.state, "State", { required: true });
  const details = str(body.details, MAX.details, "Details");
  const contact = str(body.contact, MAX.contact, "Contact");
  const gmaps = str(body.gmapsLink, MAX.gmaps, "Google Maps link");

  if (gmaps && !/^https?:\/\//i.test(gmaps)) {
    throw new Error("The Google Maps link must start with http:// or https://");
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) throw new Error("Latitude looks wrong.");
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) throw new Error("Longitude looks wrong.");

  const outsideIndia =
    lat < INDIA_BBOX.minLat || lat > INDIA_BBOX.maxLat || lng < INDIA_BBOX.minLng || lng > INDIA_BBOX.maxLng;

  const id = `${slug(city)}-${slug(name)}`;
  const entry = {
    id,
    name,
    locality,
    city,
    state,
    lat: Number(lat.toFixed(6)),
    lng: Number(lng.toFixed(6)),
    verified: false,
    googleMapsQuery: [name, locality, city].filter(Boolean).join(" "),
  };

  const bodyMd = [
    `**Submitted from the website.** Please verify before merging.`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    `| Name | ${safeText(name)} |`,
    `| Locality | ${safeText(locality) || "—"} |`,
    `| City | ${safeText(city)} |`,
    `| State | ${safeText(state)} |`,
    `| Coordinates | ${entry.lat}, ${entry.lng} |`,
    `| Google Maps link | ${gmaps ? safeText(gmaps) : "—"} |`,
    `| Contact | ${safeText(contact) || "—"} |`,
    ``,
    outsideIndia
      ? `> [!WARNING]\n> These coordinates fall outside India — double-check the pin.\n`
      : ``,
    `**Details from the contributor**`,
    ``,
    quote(details),
    ``,
    `[View this spot on OpenStreetMap](https://www.openstreetmap.org/?mlat=${entry.lat}&mlon=${entry.lng}#map=17/${entry.lat}/${entry.lng}) · [View on Google Maps](https://www.google.com/maps/search/?api=1&query=${entry.lat},${entry.lng})`,
    ``,
    `---`,
    ``,
    `<details><summary>Ready-to-paste entry for <code>data/masjids.json</code></summary>`,
    ``,
    "```json",
    JSON.stringify(entry, null, 2),
    "```",
    ``,
    `</details>`,
  ].join("\n");

  return {
    title: `[Add] ${name} — ${city}`,
    body: bodyMd,
    labels: ["new-masjid", "needs-review", "from-website"],
  };
}

function buildReportIssue(body) {
  const masjidId = str(body.masjidId, 100, "Masjid id", { required: true });
  if (!/^[a-z0-9-]+$/.test(masjidId)) throw new Error("That masjid id doesn't look right.");

  const masjidName = str(body.masjidName, MAX.name, "Masjid name");
  const problem = str(body.problem, 60, "Problem", { required: true });
  if (!PROBLEMS.includes(problem)) throw new Error("Please choose one of the listed problems.");

  const details = str(body.details, MAX.details, "Details");
  const contact = str(body.contact, MAX.contact, "Contact");

  const bodyMd = [
    `**Reported from the website.**`,
    ``,
    `| Field | Value |`,
    `| --- | --- |`,
    `| Masjid | ${safeText(masjidName) || "—"} |`,
    `| Entry id | \`${masjidId}\` |`,
    `| Problem | ${safeText(problem)} |`,
    `| Contact | ${safeText(contact) || "—"} |`,
    ``,
    `**Details from the reporter**`,
    ``,
    quote(details),
  ].join("\n");

  return {
    title: `[Report] ${masjidName || masjidId} — ${problem}`,
    body: bodyMd,
    labels: ["data-issue", "needs-review", "from-website"],
  };
}

async function verifyTurnstile(secret, token, request) {
  if (!token || typeof token !== "string") return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) form.append("remoteip", ip);

  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

async function createIssue(env, issue) {
  if (!env.GITHUB_TOKEN) throw new Error("GITHUB_TOKEN is not set");
  if (!env.GITHUB_REPO) throw new Error("GITHUB_REPO is not set");

  const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "community-maps-submission-worker",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(issue),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`GitHub responded ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.number;
}
