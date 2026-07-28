/**
 * Project configuration.
 *
 * Contributors: after forking, point GITHUB_REPO at your own fork so the
 * source and "contribute on GitHub" links resolve to the right repository.
 */
window.BMAPS_CONFIG = {
  // "owner/repo" on GitHub. Source + secondary contribution links use this.
  GITHUB_REPO: "moiz-essaji/community-maps",

  /**
   * URL of the Cloudflare Worker that receives in-app submissions and files
   * them as GitHub issues on the visitor's behalf. See worker/README.md.
   *
   * Leave this empty and the site still works: the Add / Report buttons fall
   * back to opening a pre-filled GitHub issue form instead.
   */
  SUBMIT_ENDPOINT: "",

  /**
   * Cloudflare Turnstile site key (spam protection). Optional but recommended
   * once SUBMIT_ENDPOINT is live. Safe to commit — it is a public key.
   */
  TURNSTILE_SITE_KEY: "",

  // Initial map view (roughly centres India).
  MAP_CENTER: [22.5, 78.9],
  MAP_ZOOM: 5,
};
