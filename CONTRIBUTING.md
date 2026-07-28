# Contributing to Bohra Masjid Finder

Jazakallah for helping keep the map accurate! There are two ways to contribute —
no coding knowledge is required for the first.

## 1. Via the website (easiest)

- **Add a missing masjid:** click **“＋ Add a masjid”** in the site header. A
  GitHub form opens — fill in the name, city, and coordinates (long-press the
  spot in Google Maps to copy them) and submit. You only need a free GitHub
  account.
- **Report wrong info:** click **“⚠ Report”** on any masjid in the list or its
  map popup. The form is pre-filled with that masjid's ID.

The maintainer reviews every submission, verifies the location, and updates the
map. You'll be notified on your issue when it's live.

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
