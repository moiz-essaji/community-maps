/**
 * Coordinate and map-link parsing.
 *
 * Kept free of DOM references so it can be unit-tested in Node as well as used
 * in the browser (see test/geo.test.mjs).
 *
 * The guiding rule: only ever return coordinates we actually read out of the
 * input. Never geocode, never guess. When a link carries the map's viewport
 * centre rather than the pinned place, say so via `precision: "approx"` so the
 * caller can ask the contributor to confirm it on the map.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BMAPS_GEO = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  const NUM = "(-?\\d{1,3}(?:\\.\\d+)?)";

  // Link shorteners resolve server-side only — the browser can't follow them
  // because Google serves no CORS headers on the redirect.
  const SHORTENERS = ["goo.gl", "maps.app.goo.gl", "g.co", "bit.ly", "tinyurl.com"];

  function round6(n) {
    return Math.round(n * 1e6) / 1e6;
  }

  function ok(lat, lng, precision, note) {
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      return { error: "Those coordinates couldn't be read." };
    }
    if (la < -90 || la > 90) return { error: "Latitude must be between -90 and 90." };
    if (ln < -180 || ln > 180) return { error: "Longitude must be between -180 and 180." };
    return { lat: round6(la), lng: round6(ln), precision, note };
  }

  /**
   * @returns {{lat,lng,precision,note}} on success,
   *          {{error}} with a human message,
   *          {{shortened:true}} when the input is a shortened link,
   *          {{empty:true}} for blank input.
   */
  function parseLocationInput(raw) {
    const text = String(raw == null ? "" : raw).trim();
    if (!text) return { empty: true };

    // 1. Bare coordinates — what Google Maps copies on long-press.
    let m = text.match(new RegExp(`^${NUM}\\s*[,\\s]\\s*${NUM}$`));
    if (m) return ok(m[1], m[2], "exact", "Coordinates read directly.");

    // 2. geo: URI, as shared by some Android apps.
    m = text.match(new RegExp(`^geo:${NUM},${NUM}`, "i"));
    if (m) return ok(m[1], m[2], "exact", "Read from the geo: link.");

    if (!/^https?:\/\//i.test(text)) {
      return {
        error: "That doesn't look like coordinates or a map link. Try something like 18.9578, 72.8321",
      };
    }

    let url;
    try {
      url = new URL(text);
    } catch {
      return { error: "That link couldn't be read. Check it was copied in full." };
    }

    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (SHORTENERS.includes(host)) return { shortened: true };

    // 3. Google embeds the pinned place as !3d<lat>!4d<lng> — the most reliable
    //    signal in a /maps/place/ URL, and the actual building rather than the
    //    camera position.
    m = text.match(new RegExp(`!3d${NUM}!4d${NUM}`));
    if (m) return ok(m[1], m[2], "exact", "Read the pinned place from the link.");

    // 4. Explicit coordinate parameters.
    for (const key of ["q", "query", "ll", "center", "destination", "daddr", "sll", "saddr"]) {
      const v = url.searchParams.get(key);
      if (!v) continue;
      const mm = v.trim().match(new RegExp(`^${NUM}\\s*,\\s*${NUM}$`));
      if (mm) return ok(mm[1], mm[2], "exact", "Coordinates read from the link.");
    }

    // 5. OpenStreetMap marker links.
    const mlat = url.searchParams.get("mlat");
    const mlon = url.searchParams.get("mlon");
    if (mlat && mlon) return ok(mlat, mlon, "exact", "Read from the OpenStreetMap link.");

    // 6. OpenStreetMap viewport hash: #map=17/lat/lng
    m = url.hash.match(new RegExp(`map=\\d+(?:\\.\\d+)?/${NUM}/${NUM}`));
    if (m) return ok(m[1], m[2], "approx", "Read the map centre from the link.");

    // 7. Google viewport centre: /@lat,lng,17z — this is where the camera was,
    //    not necessarily the place, so flag it for confirmation.
    m = text.match(new RegExp(`@${NUM},${NUM}`));
    if (m) return ok(m[1], m[2], "approx", "Read the map centre from the link.");

    return {
      error: "No coordinates in that link. Open it in Google Maps, long-press the spot, and copy the numbers.",
    };
  }

  function formatCoord(n) {
    return Number(n).toFixed(6);
  }

  return { parseLocationInput, formatCoord, round6, SHORTENERS };
});
