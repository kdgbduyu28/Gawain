/**
 * Cloudflare Pages Function: POST /api/ics { url } → the calendar's .ics text.
 *
 * Browsers can't fetch Google/Outlook iCal links directly (no CORS headers), so
 * the web build asks this function instead. The phone app fetches directly.
 * The secret link travels in the POST body, never the URL, so it stays out of
 * request logs; nothing is stored or cached. Only calendar hosts are allowed so
 * this can't be used as an open proxy.
 */

const ALLOWED_HOSTS = [
  /^calendar\.google\.com$/,
  /^outlook\.office365\.com$/,
  /^outlook\.office\.com$/,
  /^outlook\.live\.com$/,
  /^p\d+-caldav\.icloud\.com$/,
  /^(.+\.)?icloud\.com$/,
  /^calendar\.zoho\.(com|eu|in)$/,
  /^(.+\.)?fastmail\.com$/,
];
const MAX_BYTES = 5 * 1024 * 1024;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function onRequestPost({ request }: { request: Request }): Promise<Response> {
  let url: URL;
  try {
    const body = (await request.json()) as { url?: unknown };
    url = new URL(String(body.url ?? '').replace(/^webcals?:\/\//i, 'https://'));
  } catch {
    return json(400, { error: 'Send { "url": "<your calendar link>" }.' });
  }
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.some((h) => h.test(url.hostname))) {
    return json(400, { error: 'Only Google, Outlook, iCloud, Zoho and Fastmail calendar links are supported.' });
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: { accept: 'text/calendar' }, redirect: 'follow' });
  } catch {
    return json(502, { error: "Couldn't reach the calendar." });
  }
  if (!res.ok) return json(502, { error: `The calendar answered ${res.status}. Check the link is the secret iCal address.` });
  const text = await res.text();
  if (text.length > MAX_BYTES) return json(413, { error: 'That calendar is too big.' });
  if (!text.trimStart().startsWith('BEGIN:VCALENDAR')) return json(502, { error: "That link didn't return a calendar." });

  return new Response(text, { headers: { 'content-type': 'text/calendar; charset=utf-8', 'cache-control': 'no-store' } });
}
