# Gawain

Chores and groceries for a work-from-home day. Gawain fits chores into the gaps between your meetings, reminds you about the washer after the call it finished during, and keeps the grocery list in step with what's running low.

**Web app:** https://gawain-ccn.pages.dev

## What it does

- **Chores that repeat from when you last did them.** Doing one late moves the next one too. One-offs, errands, snooze, history and streaks.
- **Free-time suggestions.** Reads busy times from your calendar (the phone's calendars, or a Google/Outlook secret iCal link) and suggests chores that fit each gap: short ones during work hours, bigger ones after.
- **Appliance timers** that wait until your meeting is over before reminding you.
- **Pantry and grocery list.** Plenty / Low / Out, learned "lasts about N days", run-out warnings, list grouped by aisle and store.
- **Away reminders** (phone): the list when you leave home, that store's items when you arrive.
- **Optional sign-in and sync** across your phone and browsers, shared with your household.
- **Smart home.** Buttons, NFC tags, smart plugs and Home Assistant can mark chores done or end a washer timer through a private link. Reminders can be said out loud on a Sonos or Google Nest speaker.

## Stack

Expo SDK 57 (React Native, Expo Router) for iOS, Android and the web · zustand, stored on the device · Supabase (Postgres with row-level security, Realtime) for optional sync · Cloudflare Pages and Pages Functions for the web app.

## Develop

```bash
npm install
cp .env.example .env   # or leave the values empty for device-only
npx expo start --web
```

```bash
npm test               # vitest: app logic, migrations and policies in PGlite, multi-device sync
npm run typecheck
./scripts/release.sh   # build the web app and deploy to Cloudflare Pages
```

Database changes live in `supabase/migrations`. Plans are in [ROADMAP.md](ROADMAP.md).
