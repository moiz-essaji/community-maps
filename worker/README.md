# Submission worker

A small Cloudflare Worker that lets visitors add a masjid or report a problem
**without a GitHub account**. It receives the form from the website, checks it,
and files a GitHub issue for you to review.

```
visitor fills the form  →  this Worker  →  GitHub issue  →  you approve  →  data/masjids.json
```

Nothing a visitor submits ever reaches the map directly. Every submission lands
as an issue labelled `needs-review`, with a ready-to-paste JSON block so
approving takes one copy and one commit.

**The site works fine without this.** If `SUBMIT_ENDPOINT` is empty in
`js/config.js`, the Add / Report buttons fall back to opening a pre-filled
GitHub issue form, exactly as before.

## What it costs

Nothing. Cloudflare's free Workers plan allows 100,000 requests/day and does not
require a credit card.

## Setup

You need to do these steps yourself — they involve signing in and creating a
token, which you should never hand to anyone (including me).

### 1. Create a GitHub token

1. Go to <https://github.com/settings/personal-access-tokens/new> (fine-grained token).
2. **Token name:** `community-maps-submit-worker`
3. **Expiration:** 1 year (set a reminder to rotate it).
4. **Repository access:** Only select repositories → `community-maps`.
5. **Permissions:** Repository permissions → **Issues: Read and write**. Nothing else.
6. Generate it and copy the token. This is the only time GitHub shows it.

A token this narrow can only open and edit issues on that one repo. It cannot
push code, read other repos, or touch your account.

### 2. Deploy the Worker

```bash
cd worker
npm install
npx wrangler login          # opens your browser to authorise Cloudflare
npx wrangler secret put GITHUB_TOKEN   # paste the token from step 1
npx wrangler deploy
```

Deploy prints a URL like:

```
https://community-maps-submit.<your-subdomain>.workers.dev
```

### 3. Point the site at it

Put that URL in [`js/config.js`](../js/config.js):

```js
SUBMIT_ENDPOINT: "https://community-maps-submit.<your-subdomain>.workers.dev",
```

Commit and push. GitHub Pages redeploys in a minute or two, and the Add / Report
buttons now open in-app forms instead of GitHub.

### 4. Turn on spam protection (recommended)

Without this, anyone who finds the endpoint can file issues on your repo.

1. Go to <https://dash.cloudflare.com/?to=/:account/turnstile> → **Add widget**.
2. Domain: `moiz-essaji.github.io`. Widget mode: **Managed**.
3. Copy the **site key** into `TURNSTILE_SITE_KEY` in `js/config.js` (it is a
   public key — safe to commit).
4. Copy the **secret key** into the Worker:

```bash
npx wrangler secret put TURNSTILE_SECRET
npx wrangler deploy
```

The Worker rejects every submission that fails the check as soon as
`TURNSTILE_SECRET` exists, so add the site key to the page first.

## Configuration

`wrangler.toml` holds the non-secret settings:

| Setting | Meaning |
| --- | --- |
| `GITHUB_REPO` | `owner/repo` that receives the issues |
| `ALLOWED_ORIGINS` | Comma-separated sites allowed to post. Add `http://localhost:4173` while testing locally |

Secrets (`GITHUB_TOKEN`, `TURNSTILE_SECRET`) are set with `wrangler secret put`
and are never written to the repo.

## Testing

```bash
npm test
```

Runs the Worker with GitHub and Turnstile stubbed out — no network, no
credentials. It covers validation, the origin allow-list, spam-check
enforcement, and markdown-injection hardening of submitted text.

To try it against a real browser:

```bash
npx wrangler dev        # serves on http://localhost:8787
```

Set `SUBMIT_ENDPOINT` to `http://localhost:8787` and add `http://localhost:4173`
to `ALLOWED_ORIGINS`.

## Watching it run

```bash
npx wrangler tail
```

Streams live logs, including the reason behind any failed submission. Visitors
only ever see a generic error message — GitHub API details stay in the log.

## How submissions are kept safe

- **Origin allow-list.** Only your site may post; an empty list fails closed.
- **Strict validation.** Required fields, length caps, coordinate ranges, and a
  fixed list of allowed problem types. Coordinates outside India are accepted
  but flagged in the issue.
- **`verified: false` is forced** on every submission — a contributor cannot
  mark their own entry as verified.
- **Submitted text is neutralised** before it goes into the issue: triple
  backticks, HTML comments, heading markers, and `@`-mentions are defused, so a
  submission cannot break the issue layout or ping your team.
- **The token never leaves the Worker.** GitHub errors are logged server-side
  and returned to the visitor as a generic message.
