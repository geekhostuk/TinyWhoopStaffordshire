// @ts-check
import { defineConfig } from 'astro/config';

import sitemap from '@astrojs/sitemap';

import cloudflare from "@astrojs/cloudflare";

// Static output — the whole site is prerendered to /dist and served from
// Cloudflare Pages. The iFPV events are fetched at build time (see
// src/lib/ifpv.ts), so a fresh build = fresh events. A scheduled Cloudflare
// Worker (see automation/) pings a Pages deploy hook to rebuild every few days.
export default defineConfig({
  // Canonical site URL — used for <link rel="canonical">, the sitemap and
  // robots.txt. Must be the HTTPS apex domain served by Cloudflare.
  site: 'https://tinywhoopstaffs.co.uk',

  output: 'static',
  integrations: [sitemap()],
  adapter: cloudflare()
});