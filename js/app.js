(function () {
  "use strict";

  const cfg = window.BMAPS_CONFIG;
  const repoUrl = `https://github.com/${cfg.GITHUB_REPO}`;

  // ---------- Contribution links (GitHub-native flow) ----------

  function addMasjidUrl() {
    return `${repoUrl}/issues/new?template=add-masjid.yml&title=${encodeURIComponent("[Add] New masjid: ")}`;
  }

  function reportUrl(m) {
    const title = encodeURIComponent(`[Report] ${m.name}, ${m.city} (${m.id})`);
    return `${repoUrl}/issues/new?template=report-issue.yml&title=${title}&masjid-id=${encodeURIComponent(m.id)}`;
  }

  function navigateUrl(m) {
    return `https://www.google.com/maps/dir/?api=1&destination=${m.lat},${m.lng}`;
  }

  function googleMapsSearchUrl(m) {
    const q = m.googleMapsQuery || `${m.name} ${m.locality || ""} ${m.city}`;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  }

  document.getElementById("add-masjid-link").href = addMasjidUrl();
  document.getElementById("github-link").href = repoUrl;
  document.getElementById("contribute-link").href = `${repoUrl}/blob/main/CONTRIBUTING.md`;

  // ---------- Map ----------

  const map = L.map("map", { zoomControl: true }).setView(cfg.MAP_CENTER, cfg.MAP_ZOOM);

  L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' +
      ' | Borders shown are from public sources &mdash;' +
      ' <span class="disclaimer-link js-open-disclaimer" role="button" tabindex="0">disclaimer</span>',
  }).addTo(map);

  const markerIcon = L.divIcon({
    className: "masjid-marker",
    html: '<div style="font-size:26px;line-height:1;filter:drop-shadow(0 1px 2px rgba(0,0,0,.4))">🕌</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 24],
    popupAnchor: [0, -22],
  });

  // ---------- State ----------

  let allMasjids = [];
  const markersById = new Map();
  let userLocation = null; // [lat, lng] once "Near me" is used

  const listEl = document.getElementById("masjid-list");
  const countEl = document.getElementById("result-count");
  const searchEl = document.getElementById("search-input");
  const sidebarEl = document.getElementById("sidebar");
  const toggleBtn = document.getElementById("toggle-list");

  // ---------- Helpers ----------

  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function distanceKm(a, b) {
    const R = 6371;
    const dLat = ((b[0] - a[0]) * Math.PI) / 180;
    const dLng = ((b[1] - a[1]) * Math.PI) / 180;
    const s =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((a[0] * Math.PI) / 180) * Math.cos((b[0] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
  }

  function badge(m) {
    return m.verified
      ? '<span class="badge badge-verified">Verified</span>'
      : '<span class="badge badge-unverified" title="Location is approximate and awaiting community verification">Unverified</span>';
  }

  function popupHtml(m) {
    return `
      <div class="popup-body">
        <h3>${escapeHtml(m.name)} ${badge(m)}</h3>
        <p>${escapeHtml([m.locality, m.city, m.state].filter(Boolean).join(", "))}</p>
        <div class="popup-actions">
          <a class="btn btn-small" href="${navigateUrl(m)}" target="_blank" rel="noopener">🧭 Navigate</a>
          <a class="btn btn-small" href="${googleMapsSearchUrl(m)}" target="_blank" rel="noopener">Google Maps</a>
          <a class="btn btn-small" href="${reportUrl(m)}" target="_blank" rel="noopener">⚠ Report</a>
        </div>
      </div>`;
  }

  function isMobile() {
    return window.matchMedia("(max-width: 720px)").matches;
  }

  function closeSidebarOnMobile() {
    if (isMobile()) {
      sidebarEl.classList.remove("open");
      toggleBtn.textContent = "☰ List";
    }
  }

  // ---------- Rendering ----------

  function focusMasjid(m) {
    map.setView([m.lat, m.lng], 15);
    const marker = markersById.get(m.id);
    if (marker) marker.openPopup();
    closeSidebarOnMobile();
    document.querySelectorAll(".masjid-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.id === m.id);
    });
  }

  function renderList(masjids) {
    listEl.innerHTML = "";
    countEl.textContent = `${masjids.length} masjid${masjids.length === 1 ? "" : "s"}`;

    if (!masjids.length) {
      listEl.innerHTML = `
        <li class="empty-state">
          No masjids match your search.<br /><br />
          Know one that's missing?
          <a href="${addMasjidUrl()}" target="_blank" rel="noopener">Add it →</a>
        </li>`;
      return;
    }

    for (const m of masjids) {
      const li = document.createElement("li");
      li.className = "masjid-item";
      li.dataset.id = m.id;
      const dist =
        userLocation !== null
          ? `<span class="distance">${distanceKm(userLocation, [m.lat, m.lng]).toFixed(1)} km away</span>`
          : "";
      li.innerHTML = `
        <h3>${escapeHtml(m.name)} ${badge(m)}</h3>
        <p class="locality">${escapeHtml([m.locality, m.city, m.state].filter(Boolean).join(", "))}</p>
        ${dist}
        <div class="item-actions">
          <a class="btn btn-small" href="${navigateUrl(m)}" target="_blank" rel="noopener">🧭 Navigate</a>
          <a class="btn btn-small" href="${reportUrl(m)}" target="_blank" rel="noopener">⚠ Report</a>
        </div>`;
      li.addEventListener("click", (e) => {
        if (e.target.closest("a")) return; // let action links work normally
        focusMasjid(m);
      });
      listEl.appendChild(li);
    }
  }

  function renderMarkers(masjids) {
    for (const marker of markersById.values()) marker.remove();
    markersById.clear();
    for (const m of masjids) {
      const marker = L.marker([m.lat, m.lng], { icon: markerIcon, title: m.name })
        .addTo(map)
        .bindPopup(popupHtml(m));
      markersById.set(m.id, marker);
    }
  }

  function applyFilter() {
    const q = searchEl.value.trim().toLowerCase();
    let filtered = !q
      ? [...allMasjids]
      : allMasjids.filter((m) =>
          [m.name, m.locality, m.city, m.state].filter(Boolean).some((f) => f.toLowerCase().includes(q))
        );

    if (userLocation !== null) {
      filtered.sort(
        (a, b) =>
          distanceKm(userLocation, [a.lat, a.lng]) - distanceKm(userLocation, [b.lat, b.lng])
      );
    } else {
      filtered.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
    }

    renderList(filtered);
    renderMarkers(filtered);
  }

  // ---------- Disclaimer modal ----------

  const overlayEl = document.getElementById("disclaimer-overlay");
  const closeBtn = document.getElementById("disclaimer-close");
  const SEEN_KEY = "bmaps.disclaimerSeen";
  let lastFocused = null;

  // localStorage throws in some private-browsing modes; a visitor who can't be
  // remembered simply sees the notice again, which is the safe direction to fail.
  function seenDisclaimer() {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch (e) {
      return false;
    }
  }

  function rememberDisclaimerSeen() {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch (e) {
      /* ignore */
    }
  }

  function openDisclaimer() {
    lastFocused = document.activeElement;
    overlayEl.hidden = false;
    closeBtn.focus();
  }

  function closeDisclaimer() {
    overlayEl.hidden = true;
    rememberDisclaimerSeen();
    if (lastFocused) lastFocused.focus();
  }

  // Leaflet stops click propagation on its controls, so the attribution trigger
  // needs a listener of its own rather than delegation from document.
  document.querySelectorAll(".js-open-disclaimer").forEach((el) => {
    el.addEventListener("click", openDisclaimer);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openDisclaimer();
      }
    });
  });

  closeBtn.addEventListener("click", closeDisclaimer);
  overlayEl.addEventListener("click", (e) => {
    if (e.target === overlayEl) closeDisclaimer();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !overlayEl.hidden) closeDisclaimer();
  });

  if (!seenDisclaimer()) openDisclaimer();

  // ---------- Events ----------

  searchEl.addEventListener("input", applyFilter);

  toggleBtn.addEventListener("click", () => {
    const open = sidebarEl.classList.toggle("open");
    toggleBtn.textContent = open ? "🗺 Map" : "☰ List";
  });

  document.getElementById("locate-btn").addEventListener("click", () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        userLocation = [pos.coords.latitude, pos.coords.longitude];
        L.circleMarker(userLocation, {
          radius: 8, color: "#1a6b4a", fillColor: "#2a9d6f", fillOpacity: 0.9,
        })
          .addTo(map)
          .bindPopup("You are here");
        map.setView(userLocation, 11);
        applyFilter();
      },
      () => alert("Couldn't get your location. Please allow location access and try again.")
    );
  });

  // ---------- Load data ----------

  fetch("data/masjids.json")
    .then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    })
    .then((data) => {
      allMasjids = data.masjids || [];
      applyFilter();
    })
    .catch((err) => {
      console.error("Failed to load masjid data:", err);
      listEl.innerHTML = `<li class="empty-state">Failed to load masjid data (${escapeHtml(err.message)}).<br />
        If you opened index.html directly from disk, serve it instead: <code>npx serve</code></li>`;
    });
})();
