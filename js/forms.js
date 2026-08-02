/**
 * In-app contribution forms.
 *
 * Visitors add a masjid or report a problem without leaving the site or owning
 * a GitHub account. Submissions POST to the Cloudflare Worker configured as
 * SUBMIT_ENDPOINT, which files them as GitHub issues for the maintainer to
 * review (see worker/README.md).
 *
 * If SUBMIT_ENDPOINT is empty the module stays out of the way entirely and the
 * original "open a pre-filled GitHub issue" links keep working.
 */
(function () {
  "use strict";

  const cfg = window.BMAPS_CONFIG;
  const app = window.BMAPS_APP;
  const endpoint = (cfg.SUBMIT_ENDPOINT || "").trim();

  // No backend configured yet — leave every GitHub link exactly as it is.
  if (!endpoint) return;

  const overlayEl = document.getElementById("form-overlay");
  const formEl = document.getElementById("submission-form");
  const successEl = document.getElementById("form-success");
  const errorEl = document.getElementById("form-error");
  const titleEl = document.getElementById("form-title");
  const introEl = document.getElementById("form-intro");
  const submitBtn = document.getElementById("form-submit");
  const detailsLabel = document.getElementById("details-label");
  const addFields = document.querySelector('.field-group[data-for="add"]');
  const reportFields = document.querySelector('.field-group[data-for="report"]');
  const reportedEl = document.getElementById("reported-masjid");
  const pickBanner = document.getElementById("pick-banner");
  const latEl = document.getElementById("f-lat");
  const lngEl = document.getElementById("f-lng");
  const gmapsEl = document.getElementById("f-gmaps");
  const locFeedbackEl = document.getElementById("loc-feedback");
  const locStatusEl = document.getElementById("loc-status");
  const geo = window.BMAPS_GEO;

  let mode = "add"; // "add" | "report"
  let reportTarget = null;
  let lastFocused = null;
  let turnstileWidgetId = null;

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ---------- Spam protection (optional) ----------

  function loadTurnstile() {
    if (!cfg.TURNSTILE_SITE_KEY || window.turnstile || document.getElementById("turnstile-script")) return;
    const s = document.createElement("script");
    s.id = "turnstile-script";
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }

  function renderTurnstile() {
    if (!cfg.TURNSTILE_SITE_KEY || !window.turnstile) return;
    const holder = document.getElementById("turnstile-holder");
    if (turnstileWidgetId !== null) {
      window.turnstile.reset(turnstileWidgetId);
      return;
    }
    turnstileWidgetId = window.turnstile.render(holder, { sitekey: cfg.TURNSTILE_SITE_KEY });
  }

  function turnstileToken() {
    if (!cfg.TURNSTILE_SITE_KEY || !window.turnstile || turnstileWidgetId === null) return "";
    return window.turnstile.getResponse(turnstileWidgetId) || "";
  }

  // ---------- Open / close ----------

  function openForm(nextMode, masjid) {
    mode = nextMode;
    reportTarget = masjid || null;
    lastFocused = document.activeElement;

    formEl.reset();
    formEl.hidden = false;
    successEl.hidden = true;
    hideError();
    setBusy(false);
    locFeedbackEl.hidden = true;
    locStatusEl.hidden = true;
    coordsFromLink = false;

    const isAdd = mode === "add";
    addFields.hidden = !isAdd;
    reportFields.hidden = isAdd;

    if (isAdd) {
      titleEl.textContent = "Add a masjid";
      introEl.textContent =
        "Tell us about a masjid that's missing from the map. It'll go live once a maintainer has checked it.";
      detailsLabel.textContent = "Details (optional)";
    } else {
      titleEl.textContent = "Report a problem";
      introEl.textContent = "Thanks for helping keep the map accurate.";
      detailsLabel.textContent = "Details (optional)";
      reportedEl.innerHTML = `
        <span class="reported-label">Reporting</span>
        <strong>${escapeHtml(masjid.name)}</strong>
        <span class="reported-place">${escapeHtml([masjid.locality, masjid.city].filter(Boolean).join(", "))}</span>`;
    }

    overlayEl.hidden = false;
    loadTurnstile();
    // Turnstile's script may still be in flight on the first open.
    if (window.turnstile) renderTurnstile();
    else setTimeout(renderTurnstile, 800);

    const firstField = isAdd ? document.getElementById("f-name") : document.getElementById("f-problem");
    firstField.focus();
  }

  function closeForm() {
    overlayEl.hidden = true;
    cancelPick();
    if (lastFocused) lastFocused.focus();
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function hideError() {
    errorEl.hidden = true;
  }

  function setBusy(busy) {
    submitBtn.disabled = busy;
    submitBtn.textContent = busy ? "Sending…" : "Submit";
  }

  // ---------- Coordinates ----------

  function currentCoords() {
    const lat = parseFloat(latEl.value);
    const lng = parseFloat(lngEl.value);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }

  // Tracks whether the current coordinates were derived from the Google Maps
  // field, so a later unreadable link can retract them instead of leaving a
  // stale pin the contributor thinks they replaced. Values they typed or picked
  // by hand are never discarded.
  let coordsFromLink = false;

  function setCoords(lat, lng, fromLink) {
    latEl.value = geo.formatCoord(lat);
    lngEl.value = geo.formatCoord(lng);
    coordsFromLink = Boolean(fromLink);
    refreshLocStatus();
  }

  function clearLinkCoords() {
    if (!coordsFromLink) return false;
    latEl.value = "";
    lngEl.value = "";
    coordsFromLink = false;
    refreshLocStatus();
    return true;
  }

  /** Confirmation line under the lat/lng boxes, with a link to eyeball the pin. */
  function refreshLocStatus() {
    const c = currentCoords();
    if (!c) {
      const typed = latEl.value.trim() || lngEl.value.trim();
      if (typed) {
        locStatusEl.hidden = false;
        locStatusEl.className = "loc-status is-bad";
        locStatusEl.textContent = "Those numbers don't look like a valid latitude / longitude yet.";
      } else {
        locStatusEl.hidden = true;
      }
      return;
    }
    locStatusEl.hidden = false;
    locStatusEl.className = "loc-status is-good";
    locStatusEl.innerHTML =
      `📍 Location set. <a href="https://www.openstreetmap.org/?mlat=${c.lat}&mlon=${c.lng}#map=18/${c.lat}/${c.lng}" ` +
      `target="_blank" rel="noopener">Check it on a map</a> before submitting.`;
  }

  function onManualCoordEdit() {
    coordsFromLink = false;
    refreshLocStatus();
  }
  latEl.addEventListener("input", onManualCoordEdit);
  lngEl.addEventListener("input", onManualCoordEdit);

  // ---------- Coordinates from the Google Maps link ----------

  function showLocFeedback(kind, html) {
    locFeedbackEl.hidden = false;
    locFeedbackEl.className = `loc-feedback is-${kind}`;
    locFeedbackEl.innerHTML = html;
  }

  function handleGmapsInput() {
    const parsed = geo.parseLocationInput(gmapsEl.value);

    if (parsed.empty) {
      locFeedbackEl.hidden = true;
      clearLinkCoords();
      return;
    }

    const retracted = () => (clearLinkCoords() ? " The previous location has been cleared." : "");

    if (parsed.shortened) {
      showLocFeedback(
        "warn",
        "Tap the link to open Google Maps, long-press the masjid, then copy the coordinates " +
          "that appear and paste them here." +
          escapeHtml(retracted())
      );
      return;
    }

    if (parsed.error) {
      showLocFeedback("bad", escapeHtml(parsed.error + retracted()));
      return;
    }

    setCoords(parsed.lat, parsed.lng, true);

    if (parsed.precision === "approx") {
      showLocFeedback(
        "warn",
        `Got ${parsed.lat}, ${parsed.lng} — but that link only carries the map's centre, ` +
          "not the exact building. Please check it with “Search &amp; pick on map”."
      );
    } else {
      showLocFeedback("good", `✓ ${escapeHtml(parsed.note)} Set to ${parsed.lat}, ${parsed.lng}.`);
    }
  }

  gmapsEl.addEventListener("input", handleGmapsInput);
  gmapsEl.addEventListener("paste", () => setTimeout(handleGmapsInput, 0));
  // Enter here should resolve the link, not submit the whole form.
  gmapsEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleGmapsInput();
    }
  });

  // ---------- Pick on map ----------

  const pickResultsEl = document.getElementById("pick-results");
  const pickSearchForm = document.getElementById("pick-search-form");
  const pickSearchInput = document.getElementById("pick-search-input");
  const pickConfirmEl = document.getElementById("pick-confirm");
  const pickCoordsEl = document.getElementById("pick-coords");
  const pickHintEl = document.getElementById("pick-hint");

  let picking = false;
  let pickMarker = null;

  function pinIcon() {
    return L.divIcon({
      className: "pick-marker",
      html: '<div style="font-size:32px;line-height:1;filter:drop-shadow(0 2px 3px rgba(0,0,0,.5))">📍</div>',
      iconSize: [32, 32],
      iconAnchor: [16, 30],
    });
  }

  function placePin(lat, lng, recenter) {
    if (!app) return;
    if (pickMarker) {
      pickMarker.setLatLng([lat, lng]);
    } else {
      pickMarker = L.marker([lat, lng], { icon: pinIcon(), draggable: true }).addTo(app.map);
      pickMarker.on("dragend", () => {
        const p = pickMarker.getLatLng();
        showPickConfirm(p.lat, p.lng);
      });
    }
    if (recenter) app.map.setView([lat, lng], Math.max(app.map.getZoom(), 17));
    showPickConfirm(lat, lng);
  }

  function showPickConfirm(lat, lng) {
    pickConfirmEl.hidden = false;
    pickCoordsEl.textContent = `${geo.formatCoord(lat)}, ${geo.formatCoord(lng)}`;
    pickHintEl.textContent = "Drag the pin to fine-tune, then confirm.";
  }

  function startPick() {
    picking = true;
    overlayEl.hidden = true;
    pickBanner.hidden = false;
    pickResultsEl.hidden = true;
    pickConfirmEl.hidden = true;
    pickHintEl.textContent =
      "Search a city or pincode to jump there, then zoom in and tap the masjid's exact spot.";

    if (app) {
      app.closeSidebarOnMobile();
      app.map.getContainer().style.cursor = "crosshair";
      app.map.on("click", onMapPick);
    }

    // Start from whatever is already set, so re-opening doesn't lose the pin.
    const c = currentCoords();
    if (c) placePin(c.lat, c.lng, true);

    pickSearchInput.focus();
  }

  function onMapPick(e) {
    placePin(e.latlng.lat, e.latlng.lng, false);
  }

  function endPick(keep) {
    if (!picking) return;
    picking = false;
    if (app) {
      app.map.off("click", onMapPick);
      app.map.getContainer().style.cursor = "";
      if (pickMarker) {
        if (keep) {
          const p = pickMarker.getLatLng();
          setCoords(p.lat, p.lng);
        }
        pickMarker.remove();
        pickMarker = null;
      }
    }
    pickBanner.hidden = true;
    pickResultsEl.hidden = true;
    pickConfirmEl.hidden = true;
    overlayEl.hidden = false;
  }

  function cancelPick() {
    endPick(false);
  }

  document.getElementById("pick-on-map").addEventListener("click", startPick);
  document.getElementById("pick-cancel").addEventListener("click", cancelPick);
  document.getElementById("pick-use").addEventListener("click", () => {
    endPick(true);
    // The pin now defines the location; drop any stale note about the link,
    // but keep the link itself — it's still useful context for the maintainer.
    locFeedbackEl.hidden = true;
  });

  // ---------- Place search (OpenStreetMap Nominatim) ----------

  let searchAbort = null;

  pickSearchForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = pickSearchInput.value.trim();
    if (!q) return;

    pickResultsEl.hidden = false;
    pickResultsEl.innerHTML = '<li class="pick-result-msg">Searching…</li>';

    // Nominatim asks for no more than one request per second; searching only on
    // submit (never per keystroke) keeps us comfortably inside that.
    if (searchAbort) searchAbort.abort();
    searchAbort = new AbortController();

    try {
      const url =
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&countrycodes=in" +
        `&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { signal: searchAbort.signal, headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const places = await res.json();

      if (!places.length) {
        pickResultsEl.innerHTML =
          '<li class="pick-result-msg">Nothing found. Try a nearby landmark or just the city name, then tap the map.</li>';
        return;
      }

      pickResultsEl.innerHTML = "";
      for (const p of places) {
        const li = document.createElement("li");
        li.className = "pick-result";
        li.textContent = p.display_name;
        li.addEventListener("click", () => {
          placePin(parseFloat(p.lat), parseFloat(p.lon), true);
          pickResultsEl.hidden = true;
          pickSearchInput.value = "";
        });
        pickResultsEl.appendChild(li);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      console.error("Place search failed:", err);
      pickResultsEl.innerHTML =
        '<li class="pick-result-msg">Search is unavailable right now — pan the map and tap the spot instead.</li>';
    }
  });

  // ---------- Use my location ----------

  document.getElementById("use-my-location").addEventListener("click", () => {
    if (!navigator.geolocation) {
      showError("Your browser can't share a location. Paste coordinates or pick on the map instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords(pos.coords.latitude, pos.coords.longitude);
        hideError();
        // Confirmation belongs beside the coordinates, not under the link field.
        locFeedbackEl.hidden = true;
      },
      () => showError("Couldn't get your location. Allow location access, or pick on the map.")
    );
  });

  // ---------- Validation ----------

  function collect() {
    const val = (id) => document.getElementById(id).value.trim();

    if (mode === "add") {
      const lat = parseFloat(val("f-lat"));
      const lng = parseFloat(val("f-lng"));
      // This field doubles as a place to paste bare coordinates, but the worker
      // only accepts a real URL here — anything else has already been turned
      // into lat/lng, so send it as a link only when it actually is one.
      const gmaps = val("f-gmaps");
      const payload = {
        type: "add",
        name: val("f-name"),
        locality: val("f-locality"),
        city: val("f-city"),
        state: val("f-state"),
        lat,
        lng,
        gmapsLink: /^https?:\/\//i.test(gmaps) ? gmaps : "",
        details: val("f-details"),
        contact: val("f-contact"),
      };

      if (!payload.name) return { error: "Please enter the masjid's name.", focus: "f-name" };
      if (!payload.city) return { error: "Please enter the city.", focus: "f-city" };
      if (!payload.state) return { error: "Please enter the state.", focus: "f-state" };
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return {
          error: "Please set the location — search the map, paste a Google Maps link, or type the coordinates.",
          focus: "f-gmaps",
        };
      }
      if (lat < -90 || lat > 90) return { error: "Latitude must be between -90 and 90.", focus: "f-lat" };
      if (lng < -180 || lng > 180) return { error: "Longitude must be between -180 and 180.", focus: "f-lng" };
      return { payload };
    }

    const payload = {
      type: "report",
      masjidId: reportTarget.id,
      masjidName: reportTarget.name,
      problem: val("f-problem"),
      details: val("f-details"),
      contact: val("f-contact"),
    };
    if (!payload.problem) return { error: "Please choose what's wrong.", focus: "f-problem" };
    return { payload };
  }

  // ---------- Submit ----------

  formEl.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideError();

    const { payload, error, focus } = collect();
    if (error) {
      showError(error);
      if (focus) document.getElementById(focus).focus();
      return;
    }

    payload.turnstileToken = turnstileToken();
    if (cfg.TURNSTILE_SITE_KEY && !payload.turnstileToken) {
      showError("Please complete the “I'm not a robot” check.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Server responded ${res.status}`);
      }

      formEl.hidden = true;
      successEl.hidden = false;
      document.getElementById("success-text").textContent =
        mode === "add"
          ? "Your masjid has been sent for review. Once a maintainer verifies the location it'll appear on the map."
          : "Your report has been sent. A maintainer will review the details shortly.";
      document.getElementById("success-close").focus();
    } catch (err) {
      console.error("Submission failed:", err);
      showError(
        "Sorry — we couldn't send that just now. Please try again, or use the GitHub link below."
      );
      setBusy(false);
      if (cfg.TURNSTILE_SITE_KEY && window.turnstile && turnstileWidgetId !== null) {
        window.turnstile.reset(turnstileWidgetId);
      }
    }
  });

  // ---------- Wiring ----------

  document.getElementById("form-close").addEventListener("click", closeForm);
  document.getElementById("form-cancel").addEventListener("click", closeForm);
  document.getElementById("success-close").addEventListener("click", closeForm);
  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) closeForm();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (picking) {
      cancelPick(); // restores the form overlay itself
    } else if (!overlayEl.hidden) {
      closeForm();
    }
  });

  /**
   * Redirect "add"/"report" links inside `root` to the in-app form. Called by
   * app.js after every render, since list items and map popups are rebuilt.
   */
  function wireContributionLinks(root) {
    const scope = root || document;

    scope.querySelectorAll("a.js-add:not([data-wired])").forEach((el) => {
      el.dataset.wired = "1";
      el.addEventListener("click", (e) => {
        e.preventDefault();
        openForm("add");
      });
    });

    scope.querySelectorAll("a.js-report:not([data-wired])").forEach((el) => {
      el.dataset.wired = "1";
      el.addEventListener("click", (e) => {
        const masjid = app && app.getMasjidById(el.dataset.masjidId);
        if (!masjid) return; // fall through to the GitHub link
        e.preventDefault();
        openForm("report", masjid);
      });
    });
  }

  window.BMAPS_FORMS = { wireContributionLinks, openForm };

  // Catch anything already rendered before this module loaded.
  wireContributionLinks(document);
})();
