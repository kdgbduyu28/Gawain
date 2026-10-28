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

## Built (sync, live)

- Optional sign-in (Settings → Account & sync): Google or email link. Signed out, nothing changes
- Own Supabase project `gawain` (ref jiowntosdcsxrqthmzzq, Singapore), separate from the health platform. DB password in the macOS Keychain as `gawain-supabase-db`
- Syncs chores, done history, pantry/list items (shared per household), weekly meetings and work hours (per person). Last write wins per row; soft deletes; first sign-in asks to combine or replace when both sides have data
- Stays on the device: calendar links and calendar choices, saved places and each item's store, timers, theme, notification toggles
- Tests: merge logic, table mapping, migrations + policies in PGlite, and a multi-device sync test running the real engine against them

## Built (smart home, live)

- Settings → Smart home: a private link per household (only a hash is stored; make a new one or turn it off any time) and triggers that sync with the household
- Trigger kinds: "marks a chore done" (Zigbee/Tuya button, NFC tag with an iPhone Shortcut, robot vacuum docking) and "appliance timer" (smart plug on the washer: started / finished)
- Hubs POST to `https://gawain-ccn.pages.dev/api/home/<token>` (`functions/api/home/[[path]].ts`) → `post_home_event` (anyone with the token, no sign-in; 120 events/hour cap, kept 14 days)
- Devices pull events during sync (and right away over Supabase Realtime while open) and apply them with the app's rules: double presses within 30 min count once, a finish during a meeting reminds after it, plugs that report finishes stop the estimate reminder, and cycle length is learned
- Setup screen writes the Home Assistant `rest_command` and automation YAML, iPhone Shortcuts / Android steps and a curl example; "Send a test" and a log of recently received events
- Migration `20261019120000_smart_home.sql`; tests for the logic, the database rules, the Pages Function and two devices end to end
- Settings → Say reminders out loud: Home Assistant address + long-lived token + speaker + voice (picked from HA's own list), all on the device only and left out of backups; calls `tts.speak` when a reminder fires (appliance timers and morning summary by default, free-time nudges optional), never during a meeting or outside your day. Works in the browser (needs the site in HA's CORS allowed origins) and on phones while Gawain is open; no account needed

## Built (meal planner, live)

- Meals tab with a 10-step questionnaire: where you shop (palengke / supermarket / both) and region, adults and kids, meals and cooking days, kitchen equipment, restrictions, goals (high protein, low carb, GLP-1), cuisines, vibe (quick, one pan, batch, tipid, kid friendly, comfort, healthy, no cook), allergies, dislikes, what you already have, weekly budget with live stats (plates a week, per plate, tipid vs typical week, Very tight → Comfortable)
- Prices from Presyo's published data (presyo.pages.dev/data, open CORS): PSA regional retail, DA Metro Manila markets, DTI SRP; estimates for the rest. About 60% of ingredients priced from government data in NCR
- 72 recipes (Filipino-first, plus Asian, Mexican, Italian, Mediterranean, Indian, American; breakfasts, merienda, sides) and ~110 ingredients in `src/lib/meals`
- Planner: rules first (allergies, dislikes, restrictions, equipment), then scoring (cuisine, vibe, goals, uses what you have, shares ingredients, cost vs budget, no repeated dish families, quick weekday lunches), then swaps until it fits the budget. Batch cooking turns dinner into the next day's lunch
- Plan screen: expected groceries vs budget, days and meals, shuffle. Dish screen: scaled ingredients with prices, steps, sides to add, cheaper swaps. Grocery list in aisle order with staples apart; one tap puts it on the Groceries list
- "Add to chores" makes a one-off Kitchen chore on the planned day (plus a marinate/soak chore the day before when a recipe needs it), so cooking fits around meetings like any chore
- Plan and answers are stored on the device only (not synced yet)
- Ahead of NeatEat (2026-10-20):
  - Calendar-aware: days with 4+ hours of meetings get quick dishes; light days get the slow ones; weekday lunches stay quick. The day header says so
  - Price watch: each ingredient's move over the last month (DA daily / PSA monthly via Presyo); dishes whose ingredients jumped are avoided, ones that got cheaper are favoured; "Swap" link from a rising ingredient
  - Cheapest markets for your list: the week's DA-priced items costed at each Metro Manila market (DA per-market prices), cheapest three vs a typical market
  - Kitchen stock: ticking a plan item off in Groceries puts it in the kitchen; "Mark cooked" (or finishing the Cook chore) uses it up; shelf life per ingredient; "Use soon" card and plans that cook what's about to go off first; next plan treats stock and Plenty pantry items as already at home
  - Baon: weeknight dinners cook extra packed lunches for tomorrow; cooking rotation by day with names on the chores
  - Palengke units on the list: ¼/½/¾ kilo, tali, piraso (supermarket keeps grams and packs)
  - One-tap timers on recipe steps that mention a time (meeting-aware like appliance timers)
  - Household sync of the meal plan (2026-10-20): answers, plan, cooked dishes, "Cook" chore links and kitchen stock sync through a new `meals` table (migration 20261020120000_meals.sql, applied LIVE 2026-10-20); prices stay per device
  - Nutrition (2026-10-20): per adult portion on each dish and per person per day on the Meals tab (kcal, protein, carbs, fat, fiber, sodium vs FDA PH label values / WHO sodium), salty-dish warning, frying oil counted at what's absorbed. Values are approximate per-100 g figures compiled into lib/meals/nutrition.ts, not pulled from FNRI's database
  - Filipino language (2026-10-20): Settings → Appearance → Language. Covers the tab bar and the whole meal planner; recipe steps, ingredient names and the rest of the app are still English
  - Outside-the-box batch (2026-10-20):
    - Payday-aware budget (15th/30th etc.): week before payday ×0.85 "petsa de peligro", week after ×1.15
    - PH calendar: holidays by law (Easter-based Holy Week, last-Monday Heroes Day; Eid not included, proclaimed yearly), no baon before a holiday, handaan dishes on holidays and Noche Buena/Media Noche, optional meatless Fridays in Lent
    - Weather from Open-Meteo (home place or region city): sabaw on rainy days, lighter cooking on hot days, storm-like forecasts (gusts ≥70 km/h or ≥60 mm) and manual bagyo mode plan pantry dishes; storm supplies button
    - Leftover chains: sinangag from last night's rice, adobo flakes, paksiw na lechon, sarciadong isda (source cooked bigger, reused lines not bought)
    - Gas and power: LPG kg and kWh per dish and per week priced with Presyo's DOE LPG (NCR) and regional power rates; LPG tank tracker that learns from real tank swaps
    - Start-by times around meetings; rice-cooker smart plug through Home Assistant (switch.turn_on at the right time, only while Gawain is open)
    - Hands-free cook mode: big steps, read aloud and voice commands (browser only; phones would need native speech modules), keeps screen awake
    - Palengke route order + cash to bring; Handaan party calculator; Who paid (even split, synced)
