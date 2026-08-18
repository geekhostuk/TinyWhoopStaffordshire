/**
 * ifpv.ts — Fetch Tiny Whoop Staffordshire events from the iFPV calendar, at
 * Astro *build time*.
 *
 * iFPV publishes no RSS/iCal feed, so we read its clean, static HTML. This runs
 * in the Astro build (Node / Cloudflare build runner), so a fresh build bakes in
 * fresh events. No browser, no client-side fetch, no CORS issues.
 *
 * Two series are merged, because the club's events live in both:
 *   - "Social Flight Night (SFN)"  — the original flight-night series
 *   - "TWStaffordshire"            — current series: later flight nights plus
 *                                    one-off club events such as race days
 * Events appearing in both are de-duplicated by iFPV event id.
 */

interface Series { label: string; url: string }

const SERIES: Series[] = [
  {
    label: 'Social Flight Night (SFN)',
    url: 'https://www.ifpv.co.uk/series/Social%20Flight%20Night%20(SFN)',
  },
  {
    label: 'Tiny Whoop Staffordshire',
    url: 'https://www.ifpv.co.uk/series/TWStaffordshire',
  },
];

const EVENT_URL = (id: number) => `https://www.ifpv.co.uk/events/${id}`;
const UA = 'Mozilla/5.0 (TWS-sync; +https://tinywhoopstaffs.co.uk)';

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** UK postcode, e.g. ST18 9QA. */
const POSTCODE = /[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/;

export interface IfpvEvent {
  id: number;
  name: string;
  /** Human label for the sort of event: "Social Flight Night", "Race day", … */
  kind: string;
  registered: number;
  capacity: number;
  /** Date registration opens (ISO), when iFPV says it hasn't opened yet. */
  regOpens: string | null;
  iso: string;
  postcode: string;
  venue: string;
  time: string;
  day: number;
  month: string;
  dateLabel: string;
  status: string;
  statusClass: 'open' | 'low' | 'full' | 'soon';
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
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ').trim();
}

/** "Social Flight Night #34" → "Social Flight Night"; race days get their own label. */
function kindFor(name: string): string {
  if (/social\s*flight\s*night|\bsfn\b/i.test(name)) return 'Social Flight Night';
  if (/\b(cup|race|racing|league|round|heat)\b/i.test(name)) return 'Race day';
  return 'Club event';
}

interface SeriesRow {
  id: number;
  name: string;
  registered: number;
  capacity: number;
  regOpens: string | null;
}

function parseSeries(html: string): SeriesRow[] {
  const start = html.indexOf('<tbody>');
  const end = html.indexOf('</tbody>');
  const body = start >= 0 && end >= 0 ? html.slice(start, end) : html;
  const rows: SeriesRow[] = [];

  for (const row of body.split('<tr').slice(1)) {
    const m = row.match(/\/events\/(\d+)">([^<]+)<\/a>/);
    if (!m) continue;
    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((x) => x[1]);

    // The registration cell reads either "Currently: 12 / 20" (registration
    // open) or "Reg open: 17-08-2026" (not open yet).
    const regTxt = tds.length >= 4 ? stripTags(tds[3]) : '';
    const opens = regTxt.match(/open\w*:?\s*(\d{2})-(\d{2})-(\d{4})/i);
    const counts = opens ? null : regTxt.match(/(\d+)\s*\/\s*(\d+)/);

    rows.push({
      id: Number(m[1]),
      name: decodeEntities(m[2]),
      registered: counts ? Number(counts[1]) : 0,
      capacity: counts ? Number(counts[2]) : 0,
      regOpens: opens ? `${opens[3]}-${opens[2]}-${opens[1]}` : null,
    });
  }
  return rows;
}

/** Merge rows from every series, newest data winning, de-duplicated by event id. */
function mergeRows(lists: SeriesRow[][]): SeriesRow[] {
  const byId = new Map<number, SeriesRow>();
  for (const row of lists.flat()) {
    const seen = byId.get(row.id);
    if (!seen) { byId.set(row.id, row); continue; }
    // A listing shows *either* live counts or a registration-opens date, so take
    // the registration state as a set from whichever row has real counts.
    const reg = seen.capacity || !row.capacity ? seen : row;
    byId.set(row.id, {
      ...seen,
      registered: reg.registered,
      capacity: reg.capacity,
      regOpens: reg.regOpens,
    });
  }
  return [...byId.values()];
}

interface Detail { iso: string | null; postcode: string; venue: string; time: string }

/**
 * Pull a short venue label out of the free-text "Where:" line. Descriptions are
 * written by hand and vary, e.g.
 *   "Located in the upstairs function room of the Crown Wharf, Stone, ST15 8QN"
 *     → "Crown Wharf, Stone"
 *   "The Mill at Worston, Worston Lane, …, Stafford ST18 9QA"
 *     → "The Mill at Worston, Stafford"
 */
function tidyVenue(where: string): string {
  let s = where.replace(new RegExp(`\\s*${POSTCODE.source}\\.?$`), '').trim();
  const of = s.toLowerCase().lastIndexOf(' of the ');
  if (of >= 0) s = s.slice(of + ' of the '.length);
  const parts = s.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length <= 2) return parts.join(', ');
  return `${parts[0]}, ${parts[parts.length - 1]}`;
}

/** "6pm to 11pm, every other Thursday" → "6pm to 11pm" (the date says which day). */
function tidyTime(when: string): string {
  const s = when
    .replace(/,?\s*every\s+other\s+\w+day.*$/i, '')
    .replace(/[\s,;]+$/, '')
    .trim();
  return s.length > 60 ? '' : s;
}

function parseDetail(html: string): Detail {
  const text = decodeEntities(stripTags(html));

  const d = text.match(/Date:\s*(\d{2})\/(\d{2})\/(\d{2})/);
  const loc = text.match(new RegExp(`Location:\\s*(${POSTCODE.source})`));

  // Newer descriptions use "Where:" / "When:"; older ones only have prose.
  const where = text.match(/Where:\s*(.+?)(?=[.⭐❓]|$)/);
  const prose = text.match(/\bat\s+(.+?)\s+from\b/);
  const when = text.match(/When:\s*(.+?)(?=\s+Our\b|[.⭐❓]|$)/);

  const venue = where ? tidyVenue(where[1]) : prose ? tidyVenue(prose[1]) : '';
  const postcode = loc ? loc[1].replace(/\s+/g, ' ').trim() : '';

  return {
    iso: d ? `20${d[3]}-${d[2]}-${d[1]}` : null,
    postcode,
    // No usable venue text (one-off events often have none) — the postcode at
    // least tells people where to go.
    venue: venue || postcode,
    time: when ? tidyTime(when[1]) : '',
  };
}

async function fetchDetail(id: number): Promise<Detail> {
  try {
    return parseDetail(await fetchText(EVENT_URL(id)));
  } catch (e) {
    console.warn(`  ! detail fetch failed for ${id}: ${(e as Error).message}`);
    return { iso: null, postcode: '', venue: '', time: '' };
  }
}

const SHORT_FMT = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function statusFor(row: SeriesRow, today: string): Pick<IfpvEvent, 'status' | 'statusClass'> {
  // Live counts mean registration is open, whatever an older listing claimed.
  if (row.regOpens && !row.capacity && row.regOpens >= today) {
    // iFPV only gives the day registration opens, not the hour — so on the day
    // itself say "today" rather than claiming a spot is already bookable.
    const label = row.regOpens === today
      ? 'Opens today'
      : `Opens ${SHORT_FMT.format(isoToDate(row.regOpens))}`;
    return { status: label, statusClass: 'soon' };
  }
  const spots = row.capacity - row.registered;
  if (row.capacity && spots <= 0) return { status: 'Full', statusClass: 'full' };
  if (row.capacity && spots <= 3) {
    return { status: `${spots} spot${spots !== 1 ? 's' : ''} left`, statusClass: 'low' };
  }
  return { status: 'Open', statusClass: 'open' };
}

const LABEL_FMT = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
});

/** Fetch every series, filter to today-or-later, and sort soonest-first. */
export async function getUpcomingEvents(): Promise<IfpvEvent[]> {
  const fetched = await Promise.allSettled(SERIES.map((s) => fetchText(s.url)));

  const lists: SeriesRow[][] = [];
  fetched.forEach((res, i) => {
    if (res.status === 'fulfilled') {
      lists.push(parseSeries(res.value));
    } else {
      // One series being down shouldn't fail the whole build.
      console.warn(`  ! series fetch failed (${SERIES[i].label}): ${res.reason}`);
    }
  });
  if (lists.length === 0) {
    console.warn('  ! no iFPV series could be read — events section will be empty');
    return [];
  }

  const rows = mergeRows(lists);
  const details = await Promise.all(rows.map((r) => fetchDetail(r.id)));

  const today = new Date().toISOString().slice(0, 10);
  const events: IfpvEvent[] = [];

  rows.forEach((r, i) => {
    const det = details[i];
    if (!det.iso || det.iso < today) return;
    const [, mo, da] = det.iso.split('-').map(Number);
    events.push({
      ...r,
      kind: kindFor(r.name),
      iso: det.iso,
      postcode: det.postcode,
      venue: det.venue,
      time: det.time,
      day: da,
      month: MONTHS[mo],
      dateLabel: LABEL_FMT.format(isoToDate(det.iso)),
      ...statusFor(r, today),
      url: EVENT_URL(r.id),
    });
  });

  events.sort((a, b) => a.iso.localeCompare(b.iso) || a.id - b.id);
  return events;
}
