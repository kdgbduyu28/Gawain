import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Button, Card, Chip, Chips, Label, LinkRow, Note, Screen, Section, TimeField, ToggleRow } from '../../components/bits';
import { CALENDAR_SUPPORTED, calendarAccess } from '../../lib/calendar';
import { LOCATION_SUPPORTED } from '../../lib/places';
import { useSync } from '../../lib/sync/engine';
import { fmtClock, weekdayName } from '../../lib/time';
import { IS_WEB, WebPermission, downloadJson, installState, onInstallChange, pickJson, promptInstall, requestWebNotify, webNotifyPermission } from '../../lib/web';
import { useHome } from '../../store/useHome';
import { C } from '../../theme';

const CONTACT_EMAIL = 'timothyborja28@gmail.com';

export default function Settings() {
  const settings = useHome((s) => s.settings);
  const blocks = useHome((s) => s.blocks);
  const places = useHome((s) => s.places);
  const triggers = useHome((s) => s.triggers);
  const speakerOn = useHome((s) => s.settings.announce.on);
  const calendarBusy = useHome((s) => s.calendarBusy);
  const calendarError = useHome((s) => s.calendarError);
  const setSettings = useHome((s) => s.setSettings);
  const { workDays, workStart, workEnd } = settings.schedule;
  const days = workDays.length === 5 && [1, 2, 3, 4, 5].every((d) => workDays.includes(d)) ? 'Mon–Fri' : workDays.map(weekdayName).join(', ');
  const home = places.find((p) => p.kind === 'home');
  const stores = places.filter((p) => p.kind === 'store').length;
  const sync = useSync();

  return (
    <Screen title="Settings">
      {sync.configured && (
        <Section title="Account">
          <Card>
            <LinkRow
              icon={sync.email ? 'cloud-done-outline' : 'person-circle-outline'}
              label={sync.email ?? 'Sign in to sync'}
              hint={
                !sync.email
                  ? 'Optional. Back up and use Gawain on your phone and computer.'
                  : sync.status === 'choose'
                    ? 'Choose how to put your data together'
                    : sync.status === 'offline'
                      ? 'Offline, will sync later'
                      : sync.status === 'error'
                        ? "Couldn't sync"
                        : 'Syncing between your devices'
              }
              onPress={() => router.push('/account')}
            />
          </Card>
        </Section>
      )}

      <Section title="Your day">
        <Card>
          <LinkRow
            icon="briefcase-outline"
            label="Work schedule & meetings"
            hint={`${days}, ${fmtClock(workStart)}–${fmtClock(workEnd)} · ${blocks.length} regular meeting${blocks.length === 1 ? '' : 's'}`}
            onPress={() => router.push('/schedule')}
          />
          {CALENDAR_SUPPORTED && (
            <ToggleRow
              label="Read this phone's calendars"
              hint={settings.useCalendar ? 'Busy times only, read-only.' : 'Google, Outlook or iCloud accounts signed in on this phone.'}
              value={settings.useCalendar}
              onChange={async (v) => {
                if (v && !(await calendarAccess(true))) return;
                setSettings({ useCalendar: v });
              }}
            />
          )}
          <LinkRow
            icon="calendar-outline"
            label={CALENDAR_SUPPORTED ? 'Calendars and links' : 'Connect a calendar'}
            hint={
              calendarError
                ? calendarError
                : settings.icsUrls.length || settings.useCalendar
                  ? `${calendarBusy.length} busy time${calendarBusy.length === 1 ? '' : 's'} this week`
                  : 'Paste a Google or Outlook iCal link'
            }
            onPress={() => router.push('/calendars')}
          />
        </Card>
      </Section>

      <Section title="Reminders">
        <Card>
          {IS_WEB && <WebNotifyRow />}
          <ToggleRow
            label={IS_WEB ? 'Reminders' : 'Notifications'}
            value={settings.notifications}
            onChange={async (v) => {
              if (v && IS_WEB) await requestWebNotify();
              setSettings({ notifications: v });
            }}
          />
          <ToggleRow
            label="Suggest chores in free time"
            hint="A nudge when a gap between meetings fits a chore that's due"
            value={settings.gapNudges}
            disabled={!settings.notifications}
            onChange={(v) => setSettings({ gapNudges: v })}
          />
          <ToggleRow
            label="Morning summary"
            hint="What's due today and what's on the list"
            value={settings.digest !== null}
            disabled={!settings.notifications}
            onChange={(v) => setSettings({ digest: v ? '08:00' : null })}
          />
          {settings.digest && (
            <View style={{ paddingVertical: 12 }}>
              <TimeField label="Summary time" value={settings.digest} onChange={(c) => setSettings({ digest: c })} />
            </View>
          )}
          <LinkRow
            icon="navigate-outline"
            label="Away from home"
            hint={
              !LOCATION_SUPPORTED
                ? 'Phone app only'
                : settings.awayReminders
                  ? `On · ${home ? 'home set' : 'home not set'} · ${stores} store${stores === 1 ? '' : 's'}`
                  : 'Grocery list when you leave home or reach a store'
            }
            onPress={() => router.push('/places')}
          />
        </Card>
      </Section>

      <Section title="Smart home">
        <Card>
          {sync.configured && (
            <LinkRow
              icon="bulb-outline"
              label="Buttons, smart plugs & Home Assistant"
              hint={
                triggers.length
                  ? `${triggers.length} trigger${triggers.length === 1 ? '' : 's'}${sync.email ? '' : ' · sign in to receive events'}`
                  : 'Mark chores done with a button or NFC tag; know when the washer finishes'
              }
              onPress={() => router.push('/smarthome')}
            />
          )}
          <LinkRow
            icon="volume-high-outline"
            label="Say reminders out loud"
            hint={speakerOn ? 'On, through Home Assistant' : 'On a Sonos or Google Nest speaker, through Home Assistant'}
            onPress={() => router.push('/speaker')}
          />
        </Card>
      </Section>

      {IS_WEB && <WebAppSection />}

      <Section title="Appearance">
        <Label>Theme</Label>
        <Chips>
          {(['system', 'light', 'dark'] as const).map((t) => (
            <Chip key={t} label={t === 'system' ? 'Match phone' : t[0].toUpperCase() + t.slice(1)} active={settings.theme === t} onPress={() => setSettings({ theme: t })} />
          ))}
        </Chips>
      </Section>

      <Section title="Contact">
        <Card>
          <LinkRow
            icon="mail-outline"
            label="Contact me"
            hint={`Bugs, ideas or questions: ${CONTACT_EMAIL}`}
            onPress={() => Linking.openURL(`mailto:${CONTACT_EMAIL}?subject=Gawain`).catch(() => {})}
          />
        </Card>
      </Section>

      <Section title="About">
        <Text style={{ color: C.muted, fontSize: 13, lineHeight: 19 }}>
          {sync.email
            ? 'Gawain keeps everything on this device and syncs your chores, groceries and work hours through your account. '
            : 'Gawain keeps everything on this device. '}
          It never writes to your calendar. In the browser, calendar links are fetched through Gawain's server, which passes the calendar along without storing it.
        </Text>
      </Section>
    </Screen>
  );
}

/** Browser notifications only fire while Gawain is open in a tab or installed as an app. */
function WebNotifyRow() {
  const [perm, setPerm] = useState<WebPermission>(webNotifyPermission());
  if (perm === 'unsupported') return <Note>This browser can't show notifications. Gawain will show reminders inside the page while it's open.</Note>;
  return (
    <>
      <Note icon="notifications-outline">
        In the browser, reminders only arrive while Gawain is open (a background tab is fine). Install it for the best results.
        {perm === 'denied' ? ' Notifications are blocked for this site; allow them in the browser\'s site settings.' : ''}
      </Note>
      {perm === 'default' && (
        <View style={{ flexDirection: 'row', marginTop: 10, marginBottom: 4 }}>
          <Button small kind="soft" icon="notifications-outline" label="Allow notifications" onPress={() => requestWebNotify().then(setPerm)} />
        </View>
      )}
    </>
  );
}

function WebAppSection() {
  const [install, setInstall] = useState(installState());
  const signedIn = useSync((s) => !!s.email);
  const [msg, setMsg] = useState<string | null>(null);
  const { backup, restore } = useHome.getState();
  useEffect(() => onInstallChange(() => setInstall(installState())), []);

  return (
    <Section title="Web app">
      <Card>
        {install === 'prompt' && (
          <LinkRow icon="download-outline" label="Install Gawain" hint="Opens like an app, works offline, keeps your data safer" onPress={() => promptInstall().then(() => setInstall(installState()))} />
        )}
        {install === 'ios' && (
          <LinkRow
            icon="share-outline"
            label="Add to Home Screen"
            hint="In Safari, tap Share, then Add to Home Screen. Needed for notifications on iPhone, and Safari may clear data of sites you don't open for a week."
            onPress={() => setMsg('Tap the Share button in Safari\'s toolbar, then "Add to Home Screen".')}
          />
        )}
        {install === 'installed' && <LinkRow icon="checkmark-circle-outline" label="Installed" hint="Running as an app" onPress={() => {}} />}
        <LinkRow
          icon="cloud-download-outline"
          label="Back up"
          hint={`Save your chores, pantry and settings to a file.${signedIn ? '' : ' Your data lives only in this browser.'}`}
          onPress={() => {
            const d = new Date();
            downloadJson(`gawain-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`, backup());
            setMsg('Backup saved to your downloads.');
          }}
        />
        <LinkRow
          icon="cloud-upload-outline"
          label="Restore from backup"
          hint="Replaces everything here with the file's contents"
          onPress={() =>
            pickJson()
              .then((data) => {
                if (data === null || !window.confirm('Replace everything in Gawain with this backup?')) return;
                restore(data);
                setMsg('Restored.');
              })
              .catch((e: Error) => setMsg(e.message))
          }
        />
        {msg && <Text style={{ color: C.muted, fontSize: 13, marginTop: 10 }}>{msg}</Text>}
      </Card>
    </Section>
  );
}
