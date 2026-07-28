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

  // ---------- Location picking ----------

  let picking = false;

  function startPick() {
    picking = true;
    overlayEl.hidden = true;
    pickBanner.hidden = false;
    if (app) {
      app.closeSidebarOnMobile();
      app.map.getContainer().style.cursor = "crosshair";
      app.map.once("click", onMapPick);
    }
  }

  function onMapPick(e) {
    setCoords(e.latlng.lat, e.latlng.lng);
    finishPick();
  }

  function cancelPick() {
    if (!picking) return;
    if (app) app.map.off("click", onMapPick);
    finishPick(true);
  }

  function finishPick(cancelled) {
    picking = false;
    pickBanner.hidden = true;
    if (app) app.map.getContainer().style.cursor = "";
    if (!cancelled) {
      overlayEl.hidden = false;
      document.getElementById("f-name").focus();
    }
  }

  function setCoords(lat, lng) {
    latEl.value = Number(lat).toFixed(6);
    lngEl.value = Number(lng).toFixed(6);
  }

  document.getElementById("pick-on-map").addEventListener("click", startPick);
  document.getElementById("pick-cancel").addEventListener("click", () => {
    cancelPick();
    overlayEl.hidden = false;
  });

  document.getElementById("use-my-location").addEventListener("click", () => {
    if (!navigator.geolocation) {
      showError("Your browser can't share a location. Use “Pick on map” instead.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords(pos.coords.latitude, pos.coords.longitude);
        hideError();
      },
      () => showError("Couldn't get your location. Allow location access, or use “Pick on map”.")
    );
  });

  // ---------- Validation ----------

  function collect() {
    const val = (id) => document.getElementById(id).value.trim();

    if (mode === "add") {
      const lat = parseFloat(val("f-lat"));
      const lng = parseFloat(val("f-lng"));
      const payload = {
        type: "add",
        name: val("f-name"),
        locality: val("f-locality"),
        city: val("f-city"),
        state: val("f-state"),
        lat,
        lng,
        gmapsLink: val("f-gmaps"),
        details: val("f-details"),
        contact: val("f-contact"),
      };

      if (!payload.name) return { error: "Please enter the masjid's name.", focus: "f-name" };
      if (!payload.city) return { error: "Please enter the city.", focus: "f-city" };
      if (!payload.state) return { error: "Please enter the state.", focus: "f-state" };
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return { error: "Please set the location using “Pick on map” or “Use my location”.", focus: "f-city" };
      }
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
      cancelPick();
      overlayEl.hidden = false;
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
