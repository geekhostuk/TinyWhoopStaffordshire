/**
 * ifpv.ts — Fetch Tiny Whoop Staffordshire "Social Flight Night" events from
 * the iFPV calendar, at Astro *build time*.
 *
 * iFPV publishes no RSS/iCal feed, so we read its clean, static HTML. This is a
 * TypeScript port of the original Python scraper — it runs in the Astro build
 * (Node / Cloudflare Pages build runner), so a fresh build bakes in fresh
 * events. No browser, no client-side fetch, no CORS issues.
 */

const SERIES_URL =
  'https://www.ifpv.co.uk/series/Social%20Flight%20Night%20(SFN)';
const EVENT_URL = (id: number) => `https://www.ifpv.co.uk/events/${id}`;
const UA = 'Mozilla/5.0 (TWS-SFN-sync; +https://tinywhoopstaffs.uk)';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export interface SfnEvent {
  id: number;
  name: string;
  registered: number;
  capacity: number;
  iso: string;
  postcode: string;
  venue: string;
  time: string;
  day: number;
  month: string;
  dateLabel: string;
  status: string;
  statusClass: 'open' | 'low' | 'full';
  url: string;
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ');
}

interface SeriesRow { id: number; name: string; registered: number; capacity: number; }

function parseSeries(html: string): SeriesRow[] {
  const start = html.indexOf('<tbody>');
  const end = html.indexOf('</tbody>');
  const body = start >= 0 && end >= 0 ? html.slice(start, end) : html;
  const rows: SeriesRow[] = [];
  for (const row of body.split('<tr').slice(1)) {
    const m = row.match(/\/events\/(\d+)">([^<]+)<\/a>/);
    if (!m) continue;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);
    const regTxt = tds.length >= 4 ? stripTags(tds[3]) : '';
    const cap = regTxt.match(/(\d+)\s*\/\s*(\d+)/);
    rows.push({
      id: Number(m[1]),
      name: decodeEntities(m[2]).trim(),
      registered: cap ? Number(cap[1]) : 0,
      capacity: cap ? Number(cap[2]) : 0,
    });
  }
  return rows;
}

interface Detail { iso: string | null; postcode: string; venue: string; time: string; }

async function fetchDetail(id: number): Promise<Detail> {
  const fallback: Detail = { iso: null, postcode: '', venue: 'Crown Wharf, Stone', time: '6pm onwards' };
  let text: string;
  try {
    text = stripTags(await fetchText(EVENT_URL(id)));
  } catch (e) {
    console.warn(`  ! detail fetch failed for ${id}: ${(e as Error).message}`);
    return fallback;
  }

  const d = text.match(/Date:\s*(\d{2})\/(\d{2})\/(\d{2})/);
  const iso = d ? `20${d[3]}-${d[2]}-${d[1]}` : null;

  const loc = text.match(/Location:\s*([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/);
  const venue = text.match(/\bat\s+(.+?)\s+from\b/);
  const when = text.match(/When:\s*(.+?)(?:\s+Our\b|\.|$)/);

  return {
    iso,
    postcode: loc ? loc[1].trim() : fallback.postcode,
    venue: venue ? venue[1].trim() : fallback.venue,
    time: when ? when[1].trim() : fallback.time,
  };
}

function statusFor(registered: number, capacity: number): { status: string; statusClass: SfnEvent['statusClass'] } {
  const spots = capacity - registered;
  if (capacity && spots <= 0) return { status: 'Full', statusClass: 'full' };
  if (capacity && spots <= 3) return { status: `${spots} spot${spots !== 1 ? 's' : ''} left`, statusClass: 'low' };
  return { status: 'Open', statusClass: 'open' };
}

const LABEL_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

/** Fetch, filter to today-or-later, and sort soonest-first. */
export async function getUpcomingEvents(): Promise<SfnEvent[]> {
  const rows = parseSeries(await fetchText(SERIES_URL));
  const details = await Promise.all(rows.map((r) => fetchDetail(r.id)));

  const today = new Date().toISOString().slice(0, 10);
  const events: SfnEvent[] = [];

  rows.forEach((r, i) => {
    const det = details[i];
    if (!det.iso || det.iso < today) return;
    const [y, mo, da] = det.iso.split('-').map(Number);
    const { status, statusClass } = statusFor(r.registered, r.capacity);
    events.push({
      ...r,
      iso: det.iso,
      postcode: det.postcode,
      venue: det.venue,
      time: det.time,
      day: da,
      month: MONTHS[mo],
      dateLabel: LABEL_FMT.format(new Date(Date.UTC(y, mo - 1, da))),
      status,
      statusClass,
      url: EVENT_URL(r.id),
    });
  });

  events.sort((a, b) => a.iso.localeCompare(b.iso));
  return events;
}
