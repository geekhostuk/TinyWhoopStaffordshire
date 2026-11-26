# Tiny Whoop Staffordshire — club website

An [Astro](https://astro.build) static site for the Tiny Whoop Staffordshire
(TWS) club, hosted on **Cloudflare Workers**. The **Upcoming events** section is
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
public/assets/            Logo (transparent PNG), social card, icons
automation/               Cron Worker that triggers a daily rebuild
```

## Local development

```powershell
npm install
npm run dev        # http://localhost:4321  (fetches live iFPV events)
npm run build      # outputs static site to /dist
npm run preview    # serve the built /dist locally
```

## How the events stay up to date on Cloudflare

iFPV has no RSS/iCal feed, so `src/lib/ifpv.ts` reads its clean, static HTML
during the **build**. The site is deployed with **Cloudflare Workers Builds**
(the `tws` Worker, git-connected, so every push to `main` rebuilds). A small
cron Worker rebuilds it daily as well, so new events show up without a push:

```
tws-ifpv-rebuild (cron, daily 05:00 UTC)  ──POST──▶  Workers Builds deploy hook
                                                       └─ npm run build (re-runs ifpv.ts)
                                                       └─ wrangler deploy → fresh events live
```

### One-time setup

1. **Create a deploy hook.** Cloudflare dashboard → **Workers & Pages → tws →
   Settings → Builds → Deploy Hooks**. Name it `daily-events-refresh`, branch
   `main`, **Create**, and copy the URL
   (`https://api.cloudflare.com/client/v4/workers/builds/deploy_hooks/<id>`).
   Treat it like a password: anyone with it can trigger builds.
2. **Deploy the cron Worker** and give it the hook URL:

   ```powershell
   cd automation
   npx wrangler login                                              # if not already logged in
   npx wrangler deploy --config wrangler.toml                      # deploys tws-ifpv-rebuild
   npx wrangler secret put DEPLOY_HOOK_URL --config wrangler.toml  # paste the hook URL
   ```

3. **Check it works.** Optional: `curl -X POST "<hook-url>"` should start a build
   under **tws → Deployments / Builds**. After the first scheduled run, the cron
   Worker's **Logs** tab shows `Deploy hook POST -> 200`.

The schedule lives in `automation/wrangler.toml` (`crons = ["0 5 * * *"]`;
use `"0 5 */2 * *"` for every 48 hours). The cron Worker has no public URL; to
rebuild on demand, POST the hook or use **Retry build** in the dashboard.
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
- **Logo:** `public/assets/logo.png` is the transparent logo (trimmed, 480px wide).
  `og-image.jpg` (1200×630, logo on navy) is the social share card, and
  `icon-512.png` / `apple-touch-icon.png` / `favicon-48.png` are the square icons.
  All are generated from one master PNG, so regenerate them all if the logo changes.
