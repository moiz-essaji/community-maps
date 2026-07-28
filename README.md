# 🕌 Bohra Masjid Finder

An open-source, community-maintained map of **Dawoodi Bohra masjids across India**.
Find the nearest masjid, see it on a map, and get one-tap **turn-by-turn navigation
via Google Maps** — from any browser, on any device.

**Live site:** <https://moiz-essaji.github.io/community-maps/>

## Features

- 🗺️ Interactive map of Bohra masjids (Leaflet + OpenStreetMap — no API keys, no billing)
- 🔍 Search by masjid name, locality, city, or state
- 📍 "Near me" — sorts masjids by distance from your location
- 🧭 One-tap **Navigate** button that opens Google Maps with directions
- ➕ Anyone can suggest a new masjid or report wrong info — **no GitHub account needed**
- ✅ Maintainer-approved: nothing appears on the map until reviewed and merged
- 💸 Completely free to run: static site, open data, free-tier worker

## How the data works

All masjid data lives in one file: [`data/masjids.json`](data/masjids.json).
The site is fully static — the map renders whatever that file contains.

Contribution flow:

1. A visitor clicks **“＋ Add a masjid”** or **“⚠ Report”** in the app.
2. They fill in a short form **without leaving the site**, picking the exact spot
   on the map. No GitHub account, no git, no coding.
3. The submission arrives as a labelled GitHub issue containing a ready-to-paste
   JSON entry.
4. The maintainer verifies it, pastes the entry into `data/masjids.json`, and commits.
5. GitHub Pages redeploys automatically — the map updates within a minute.

The in-app form needs the small [submission worker](worker/README.md) to be
deployed (free, ~10 minutes, one-time). **Until then the site still works**: the
same buttons fall back to opening a pre-filled GitHub issue instead.

Each entry looks like:

```json
{
  "id": "mumbai-saifee-masjid",
  "name": "Saifee Masjid",
  "locality": "Bhendi Bazaar",
  "city": "Mumbai",
  "state": "Maharashtra",
  "lat": 18.9578,
  "lng": 72.8321,
  "verified": false,
  "googleMapsQuery": "Saifee Masjid Bhendi Bazaar Mumbai"
}
```

`verified` starts as `false` (shown with an "Unverified" badge) and is flipped to
`true` once the location has been confirmed on the ground.

> ⚠️ **The seed data in this repo is approximate and unverified.** Coordinates
> point at known Bohra localities, not necessarily the exact building. Help us
> verify them!

## Getting visibility on Google Maps itself

This app deep-links into Google Maps for navigation, but pins can't be injected
into Google's own base map. To make a masjid visible *inside* Google Maps, submit
it through Google's **“Add a missing place”** feature — this repo's verified data
makes those submissions easy and accurate. Once a masjid has its own Google
listing, add its share link to the entry's `googleMapsQuery`.

## Running locally

No build step. Any static file server works:

```bash
npx serve            # or: python -m http.server 8000
```

Then open the printed URL. (Opening `index.html` directly from disk won't load
the data file due to browser security rules.)

## Deploying

### The site (GitHub Pages)

1. Push this repo to GitHub.
2. Set `GITHUB_REPO` in [`js/config.js`](js/config.js) to your `owner/repo`.
   **If this is wrong, every Add / Report link 404s.**
3. Repo **Settings → Pages → Source: Deploy from a branch → `main` / root**.
4. Your site is live at `https://<owner>.github.io/<repo>/`.

### The submission form (optional, free)

So visitors can contribute without a GitHub account, deploy the Cloudflare
Worker in [`worker/`](worker/README.md) and put its URL in `SUBMIT_ENDPOINT` in
`js/config.js`. Full instructions are in [worker/README.md](worker/README.md).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Short version: use the in-app buttons,
or open a pull request editing `data/masjids.json` directly.

## Disclaimer

**Map imagery, boundaries and borders are not ours.** The base map is supplied by
[OpenStreetMap](https://www.openstreetmap.org/copyright) and other public sources.
All international, national and state borders, along with place names and
territorial depictions, are rendered exactly as those public sources provide them.

The developer and contributors of this project **have no control over how any
border or boundary is depicted**, do not edit or endorse those depictions, and
intend no political statement by them. Nothing shown here is authoritative. For
official boundaries of India, refer to the Survey of India.

Masjid locations are contributed by the community and offered in good faith.
Entries marked *Unverified* are approximate and awaiting confirmation — please
verify before travelling.

## License

- Code: [MIT](LICENSE)
- Masjid data (`data/masjids.json`): [ODbL](https://opendatacommons.org/licenses/odbl/) — free to use with attribution
- Map tiles: © [OpenStreetMap](https://www.openstreetmap.org/copyright) contributors
