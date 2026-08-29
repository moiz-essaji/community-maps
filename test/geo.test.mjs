/**
 * Parser tests for js/geo.js. Run with: node test/geo.test.mjs
 * No dependencies, no network.
 */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { parseLocationInput } = require("../js/geo.js");

const results = [];
const check = (name, pass, extra = "") => results.push({ name, pass, extra });

function expectCoords(name, input, lat, lng, precision) {
  const r = parseLocationInput(input);
  const pass = r.lat === lat && r.lng === lng && (!precision || r.precision === precision);
  check(name, pass, JSON.stringify(r));
}

function expectFailure(name, input, key) {
  const r = parseLocationInput(input);
  check(name, Boolean(r[key]), JSON.stringify(r));
}

// ---- bare coordinates (Google Maps long-press → copy) ----
expectCoords("plain 'lat, lng'", "18.9578, 72.8321", 18.9578, 72.8321, "exact");
expectCoords("no space after comma", "18.9578,72.8321", 18.9578, 72.8321, "exact");
expectCoords("space separated", "18.9578 72.8321", 18.9578, 72.8321, "exact");
expectCoords("surrounding whitespace", "  21.1959, 72.8302  ", 21.1959, 72.8302, "exact");
expectCoords("negative values", "-33.8688, -151.2093", -33.8688, -151.2093, "exact");
expectCoords("integer coords", "18, 72", 18, 72, "exact");

// ---- real Google Maps URL shapes ----
expectCoords(
  "/maps/place/ with !3d!4d (the pinned place)",
  "https://www.google.com/maps/place/Saifee+Masjid/@18.9601,72.8305,17z/data=!3m1!4b1!4m6!3m5!1s0x3be7cf!8m2!3d18.9578!4d72.8321!16s%2Fg%2F11c",
  18.9578, 72.8321, "exact"
);
expectCoords(
  "prefers !3d!4d over the @ viewport centre",
  "https://www.google.com/maps/place/X/@10.0,20.0,17z/data=!4m2!3d18.9578!4d72.8321",
  18.9578, 72.8321, "exact"
);
expectCoords(
  "@lat,lng viewport centre only → approx",
  "https://www.google.com/maps/@18.9578,72.8321,17z",
  18.9578, 72.8321, "approx"
);
expectCoords(
  "search api query=lat,lng",
  "https://www.google.com/maps/search/?api=1&query=18.9578,72.8321",
  18.9578, 72.8321, "exact"
);
expectCoords("classic ?q=lat,lng", "https://maps.google.com/?q=18.9578,72.8321", 18.9578, 72.8321, "exact");
expectCoords("?ll=lat,lng", "https://maps.google.com/?ll=18.9578,72.8321&z=17", 18.9578, 72.8321, "exact");
expectCoords(
  "directions ?destination=lat,lng",
  "https://www.google.com/maps/dir/?api=1&destination=18.9578,72.8321",
  18.9578, 72.8321, "exact"
);

// ---- OpenStreetMap ----
expectCoords(
  "OSM marker link",
  "https://www.openstreetmap.org/?mlat=18.9578&mlon=72.8321#map=17/18.9578/72.8321",
  18.9578, 72.8321, "exact"
);
expectCoords(
  "OSM hash only → approx",
  "https://www.openstreetmap.org/#map=17/18.9578/72.8321",
  18.9578, 72.8321, "approx"
);

// ---- geo: URI ----
expectCoords("geo: URI", "geo:18.9578,72.8321", 18.9578, 72.8321, "exact");

// ---- shortened links must be reported, never guessed ----
expectFailure("maps.app.goo.gl flagged as shortened", "https://maps.app.goo.gl/abc123XYZ", "shortened");
expectFailure("goo.gl/maps flagged as shortened", "https://goo.gl/maps/abc123", "shortened");

// ---- things that must NOT yield coordinates ----
expectFailure("place-name search is not coordinates", "https://www.google.com/maps/search/?api=1&query=Saifee+Masjid+Mumbai", "error");
expectFailure("bare text", "Saifee Masjid, Bhendi Bazaar", "error");
expectFailure("random url", "https://example.com/page", "error");
expectFailure("malformed url", "http://", "error");
expectFailure("out-of-range latitude", "95.0, 72.0", "error");
expectFailure("out-of-range longitude", "18.0, 200.0", "error");
expectFailure("single number", "18.9578", "error");

// blank input is a distinct, silent state
check("empty string → empty flag", parseLocationInput("").empty === true);
check("null → empty flag", parseLocationInput(null).empty === true);

// precision is rounded to 6dp
check("rounds to 6 decimal places", parseLocationInput("18.12345678, 72.87654321").lat === 18.123457,
  JSON.stringify(parseLocationInput("18.12345678, 72.87654321")));

let failed = 0;
for (const r of results) {
  if (!r.pass) failed++;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}${r.extra && !r.pass ? "  <- " + r.extra : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
