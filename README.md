# Tiny Whoop Staffordshire — club website

An [Astro](https://astro.build) static site for the Tiny Whoop Staffordshire
(TWS) club, hosted on **Cloudflare Pages**. The **Upcoming events** section is
synced from the club's events on the iFPV calendar — fetched at *build time* and
baked into the static HTML.

Two iFPV series are merged, because the club's events live in both:

| Series | What's in it |
| --- | --- |
| [Social Flight Night (SFN)][sfn] | The original flight-night series (up to #33) |
| [TWStaffordshire][tws] | Current series — flight nights #34 on, plus one-off club events like race days |

Events listed in both are de-duplicated by iFPV event id, and only today-or-later
dates are shown. The page lists the next `MAX_EVENTS` (6, set in `index.astro`)
with a *"View N more events on iFPV"* link for the rest.

Built from the *"Tiny Whoop Staffordshire Design System"* Claude Design project.

[sfn]: https://www.ifpv.co.uk/series/Social%20Flight%20Night%20(SFN)
[tws]: https://www.ifpv.co.uk/series/TWStaffordshire

## Project layout

```
src/pages/index.astro     The home page (single scroll: intro · events · join)
src/lib/ifpv.ts           iFPV event sync — fetch + merge both series, at build time
src/styles/global.css     Design system (colours, type, spacing, buttons)
public/assets/logo.jpg    Club logo
automation/               Cloudflare Worker that triggers scheduled rebuilds
```

## Local development

```powershell
npm install
npm run dev        # http://localhost:4321  (fetches live iFPV events)
npm run build      # outputs static site to /dist
npm run preview    # serve the built /dist locally
```

## How the events stay up to date on Cloudflare

iFPV has no RSS/iCal feed, so `src/lib/ifpv.ts` reads its clean, static HTML.
Because Cloudflare Pages has **no always-on server** to run a cron job, the
sync runs as part of each **build**:

```
Cloudflare Cron Worker  ──POST──▶  Pages Deploy Hook  ──▶  Pages rebuild
                                                             └─ re-runs ifpv.ts
                                                             └─ fresh events baked in
```

### 1. Deploy the site to Cloudflare Pages

- Push this repo to GitHub/GitLab.
- Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
- Build settings: **Framework preset: Astro**, build command `npm run build`,
  output directory `dist`.
- Deploy. Every push rebuilds and re-syncs events.

### 2. Create a Deploy Hook

- Pages project → **Settings → Builds & deployments → Deploy hooks → Add**.
- Name it e.g. `scheduled-rebuild`, pick the production branch. Copy the URL
  (looks like `https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/<id>`).
- POSTing to that URL triggers a fresh build. Test it:
  `curl -X POST "<deploy-hook-url>"`

### 3. Schedule the rebuild (Cloudflare Worker Cron Trigger)

```powershell
cd automation
npx wrangler deploy                      # deploys the tws-ifpv-rebuild worker
npx wrangler secret put DEPLOY_HOOK_URL  # paste the deploy hook URL when prompted
```

The schedule lives in `automation/wrangler.toml` (`crons = ["0 7 */3 * *"]` =
07:00 UTC every 3rd day). The Worker POSTs the deploy hook on that schedule, and
visiting the Worker's URL triggers a rebuild on demand too.

> **Simpler alternative:** if the repo is on GitHub, a scheduled GitHub Action
> that `curl -X POST`s the deploy hook does the same job without a Worker.

## Notes

- **Why build-time, not client-side?** iFPV sends no CORS headers, so a browser
  can't fetch it directly. Fetching during the build sidesteps that entirely and
  keeps the page fast, cached at the edge, and search-friendly.
- **Availability badges** (`Open` / `N spots left` / `Full`) are derived from the
  real registration counts; each **Book** button links to the live iFPV page.
  Events whose registration hasn't opened yet show `Opens 17 Aug` / `Opens today`
  and a **Details** button instead — iFPV gives the day, not the hour, so on the
  day itself the card says "today" rather than claiming a bookable spot.
- **Venue and time** come from the free-text event description, which is written
  by hand and varies (`Where:` / `When:` on newer events, prose on older ones).
  `tidyVenue()` shortens whatever it finds to `Venue, Town`, falling back to the
  postcode when an event has no description text at all (common for race days).
- **Adding another series:** append it to the `SERIES` array in `src/lib/ifpv.ts`.
  A series that fails to fetch is warned about and skipped, so it can't break the
  build.
- **Logo:** `public/assets/logo.jpg` has a light-grey matte (JPEGs can't be
  transparent). A transparent **PNG** would sit more cleanly on the hero panel —
  drop one in as `logo.png` and update the references in `index.astro`.
