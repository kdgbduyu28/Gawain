# Gawain roadmap

## Built (v1)

- Chores that repeat from when you last did them (late moves the next one too), one-offs, errands, snooze, history and streaks
- Free-time suggestions between meetings: short chores during work hours, bigger ones after; buffer before meetings
- Busy times from the phone's calendars (read-only) or typed-in weekly meetings
- Appliance timers that remind you after the meeting they finish in
- Pantry with Plenty / Low / Out, learned "lasts about N days", run-out warnings
- Shopping list grouped by aisle, per-store filter, one-off items
- Away reminders: list + errands when you leave home, that store's items when you arrive (geofencing)
- Local notifications: free-time nudges, timers, morning summary
- Dark mode, everything stored on the device

## Built (web app, live at https://gawain-ccn.pages.dev)

- Calendar links: paste a Google/Outlook secret iCal address; parsed on the device (repeating meetings, time zones, moved/cancelled ones). Browsers fetch it through `functions/api/ics.ts` (calendar hosts only, link in POST body, nothing stored); phones fetch directly
- Reminders in the browser while Gawain is open: system notification (if allowed) plus an in-app banner
- Installable, works offline (service worker precaches the build), install / Add to Home Screen hints
- Side navigation on wide screens
- Back up to a file / restore (browser data can be cleared; Safari clears sites unused for 7 days unless installed)

## Built (sync, not deployed yet)

- Optional sign-in (Settings → Account & sync): Google or email link. Signed out, nothing changes
- Own Supabase project `gawain` (ref jiowntosdcsxrqthmzzq, Singapore), separate from the health platform. DB password in the macOS Keychain as `gawain-supabase-db`
- Syncs chores, done history, pantry/list items (shared per household), weekly meetings and work hours (per person). Last write wins per row; soft deletes; first sign-in asks to combine or replace when both sides have data
- Stays on the device: calendar links and calendar choices, saved places and each item's store, timers, theme, notification toggles
- Tests: merge logic, table mapping, migrations + policies in PGlite, and a multi-device sync test running the real engine against them

## Built (smart home, not deployed yet)

- Settings → Smart home: a private link per household (only a hash is stored; make a new one or turn it off any time) and triggers that sync with the household
- Trigger kinds: "marks a chore done" (Zigbee/Tuya button, NFC tag with an iPhone Shortcut, robot vacuum docking) and "appliance timer" (smart plug on the washer: started / finished)
- Hubs POST to `https://gawain-ccn.pages.dev/api/home/<token>` (`functions/api/home/[[path]].ts`) → `post_home_event` (anyone with the token, no sign-in; 120 events/hour cap, kept 14 days)
- Devices pull events during sync (and right away over Supabase Realtime while open) and apply them with the app's rules: double presses within 30 min count once, a finish during a meeting reminds after it, plugs that report finishes stop the estimate reminder, and cycle length is learned
- Setup screen writes the Home Assistant `rest_command` and automation YAML, iPhone Shortcuts / Android steps and a curl example; "Send a test" and a log of recently received events
- Migration `20261019120000_smart_home.sql`; tests for the logic, the database rules, the Pages Function and two devices end to end
- Settings → Say reminders out loud: Home Assistant address + long-lived token + speaker + voice (picked from HA's own list), all on the device only and left out of backups; calls `tts.speak` when a reminder fires (appliance timers and morning summary by default, free-time nudges optional), never during a meeting or outside your day. Works in the browser (needs the site in HA's CORS allowed origins) and on phones while Gawain is open; no account needed

## Next

- First phone build (EAS development build) and test calendar, notifications and geofencing on a real device
- Real web push (reminders with the tab closed): needs a push server and stored subscriptions
- Home-screen widget: what fits right now
- Filipino / English toggle, like Pabili
- Mark several chores done at once; "done earlier today at…"

## Later (backend is there now)

- Enable Google sign-in (Supabase dashboard → Auth → Providers, needs a Google Cloud OAuth client)
- Custom SMTP (e.g. Resend) so sign-in emails can carry a code and aren't limited to a few an hour; then add {{ .Token }} to the templates
- Invite a partner or housemates into your household (tables are ready: household_members)
- Who-did-what (done_history rows already record updated_by) and fair rotation
- Delete my account and cloud data
- Realtime updates instead of pulling on focus / every 2 minutes (smart-home events already use Realtime)
- Smart home: chores that repeat by appliance run time (clean the aircon filter every 200 hours)
