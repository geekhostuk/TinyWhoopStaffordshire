// @ts-check
import { defineConfig } from 'astro/config';

// Static output — the whole site is prerendered to /dist and served from
// Cloudflare Pages. The iFPV events are fetched at build time (see
// src/lib/ifpv.ts), so a fresh build = fresh events. A scheduled Cloudflare
// Worker (see automation/) pings a Pages deploy hook to rebuild every few days.
export default defineConfig({
  output: 'static',
  // site: 'https://tinywhoopstaffs.uk',  // set to your final domain for correct canonical URLs
});
