/**
 * tws-ifpv-rebuild — a Cloudflare Worker whose only job is to poke the site's
 * Workers Builds "Deploy Hook" on a schedule. Each poke runs a fresh build of
 * the `tws` Worker, which re-runs the iFPV scrape (src/lib/ifpv.ts) and bakes
 * the latest events into the site.
 *
 * Set DEPLOY_HOOK_URL as a secret:  npx wrangler secret put DEPLOY_HOOK_URL --config wrangler.toml
 * (Cloudflare dashboard → Workers & Pages → tws → Settings → Builds → Deploy Hooks)
 * Schedule is defined in wrangler.toml ([triggers] crons).
 */
export interface Env {
  DEPLOY_HOOK_URL: string;
}

export default {
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    if (!env.DEPLOY_HOOK_URL) {
      throw new Error('DEPLOY_HOOK_URL not set — nothing to trigger.');
    }
    const res = await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' });
    const body = await res.text();
    console.log(`Deploy hook POST -> ${res.status} ${body}`);
    // Throwing marks the cron run as failed in the dashboard, so it's visible.
    if (!res.ok) throw new Error(`Deploy hook failed: ${res.status}`);
  },
};
