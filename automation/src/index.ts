/**
 * tws-ifpv-rebuild — a Cloudflare Worker whose only job is to poke the site's
 * Cloudflare Pages "Deploy Hook" on a schedule. Each poke triggers a fresh
 * Pages build, which re-runs the iFPV scrape (src/lib/ifpv.ts) and bakes the
 * latest Social Flight Night events into the static site.
 *
 * Set DEPLOY_HOOK_URL as a secret:  wrangler secret put DEPLOY_HOOK_URL
 * Schedule is defined in wrangler.toml ([triggers] crons).
 */
export interface Env {
  DEPLOY_HOOK_URL: string;
}

export default {
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    if (!env.DEPLOY_HOOK_URL) {
      console.error('DEPLOY_HOOK_URL not set — nothing to trigger.');
      return;
    }
    const res = await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' });
    console.log(`Deploy hook POST -> ${res.status} ${res.statusText}`);
  },

  // Optional: lets you trigger a rebuild manually by visiting the Worker URL.
  async fetch(_req: Request, env: Env): Promise<Response> {
    if (!env.DEPLOY_HOOK_URL) return new Response('DEPLOY_HOOK_URL not set', { status: 500 });
    const res = await fetch(env.DEPLOY_HOOK_URL, { method: 'POST' });
    return new Response(`Triggered rebuild: ${res.status}\n`, { status: res.ok ? 200 : 502 });
  },
};
