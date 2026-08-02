# Contributing to Bohra Masjid Finder

Jazakallah for helping keep the map accurate! There are two ways to contribute —
the first needs no coding knowledge and no account of any kind.

## 1. Via the website (easiest — no account needed)

- **Add a missing masjid:** click **“＋ Add a masjid”** in the site header. Fill
  in the name, city and state, then set the location in whichever way is easiest:
  - **🔍 Search & pick on map** — search by **city name, plus the pincode** if
    you know it, to jump to the right place, then zoom in and tap the masjid.
    Drag the pin to fine-tune it. (Search area and landmark names are unreliable
    in OpenStreetMap's Indian data, so city/pincode gets you there far more
    dependably.)
  - **Google Maps link** — optional, but if you paste one we'll read the
    coordinates straight out of it. You can also paste bare coordinates here.
    For a shortened `maps.app.goo.gl` link, tap it to open Google Maps,
    long-press the masjid, then copy the coordinates it shows and paste those.
  - **📍 I'm here now** — uses your device location if you're standing there.
  - **Type latitude and longitude** directly, if you already know them.
- **Report wrong info:** click **“⚠ Report”** on any masjid in the list or its
  map popup, choose what's wrong, and add any detail that helps us fix it.

Leaving your name or email is optional and only used to thank you or ask a
follow-up question.

The maintainer reviews every submission and verifies the location before it
appears on the map.

> If the site's owner hasn't set up the submission worker yet, these buttons open
> a pre-filled GitHub issue form instead — which does need a free GitHub account.

## 2. Via pull request (for the git-comfortable)

1. Fork the repo and edit [`data/masjids.json`](data/masjids.json).
2. Follow the existing entry format:
   - `id`: lowercase `city-masjid-name` slug, unique across the file
   - `lat` / `lng`: decimal degrees (long-press in Google Maps to copy)
   - `verified`: always `false` for new entries — the maintainer flips it after verification
   - `googleMapsQuery`: what someone would type into Google Maps to find it
3. Keep entries sorted roughly by city.
4. Open a pull request describing how you know the location is correct.

## Verification standards

An entry is marked `verified: true` only when at least one of:

- The coordinates match an existing Google Maps listing for the masjid.
- A community member has confirmed the pin is on the correct building.
- The submitter provided a Google Maps share link that resolves to the masjid.

## Ground rules

- Only Dawoodi Bohra masjids in India (markazes/jamaat khanas with masjids count;
  private residences do not).
- Be respectful in issues and reviews.
- Don't submit locations you haven't reasonably confirmed.
