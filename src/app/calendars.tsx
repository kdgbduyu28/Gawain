import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { refreshCalendar } from '../components/Background';
import { Button, Card, Field, Icon, Note, Screen, Section } from '../components/bits';
import { CALENDAR_SUPPORTED, CalendarInfo, listCalendars } from '../lib/calendar';
import { normalizeIcsUrl } from '../lib/ics';
import { fmtTime } from '../lib/time';
import { useHome } from '../store/useHome';
import { C, R, themed } from '../theme';

/** Shows enough of a secret link to recognise it without putting the whole secret on screen. */
function shortLink(u: string): string {
  try {
    const url = new URL(u);
    return `${url.hostname}/…${url.pathname.slice(-12)}`;
  } catch {
    return u.slice(0, 32) + '…';
  }
}

export default function CalendarsScreen() {
  const ids = useHome((s) => s.settings.calendarIds);
  const useCalendar = useHome((s) => s.settings.useCalendar);
  const icsUrls = useHome((s) => s.settings.icsUrls);
  const calendarBusy = useHome((s) => s.calendarBusy);
  const calendarReadAt = useHome((s) => s.calendarReadAt);
  const calendarError = useHome((s) => s.calendarError);
  const setSettings = useHome((s) => s.setSettings);
  const [cals, setCals] = useState<CalendarInfo[] | null>(null);
  const [link, setLink] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (CALENDAR_SUPPORTED && useCalendar) listCalendars().then(setCals, () => setCals([]));
  }, [useCalendar]);

  const selected = (id: string) => ids === null || ids.includes(id);
  const toggle = (id: string) => {
    const all = (cals ?? []).map((c) => c.id);
    const current = ids ?? all;
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    setSettings({ calendarIds: next.length === all.length ? null : next });
  };

  const addLink = () => {
    const url = normalizeIcsUrl(link);
    if (!url) {
      setLinkError("That doesn't look like a link. It should start with https:// or webcal://");
      return;
    }
    setLinkError(null);
    setLink('');
    if (!icsUrls.includes(url)) setSettings({ icsUrls: [...icsUrls, url] });
  };

  return (
    <Screen stack title="Calendars" subtitle="Busy times count as meetings. Gawain never changes your calendar.">
      <Section title="Calendar link">
        <Text style={styles.help}>
          Paste your calendar's secret iCal address. It works in the browser and on phones where your work account isn't on the phone.
        </Text>
        <Card style={{ marginTop: 10 }}>
          <Text style={styles.how}>
            <Text style={styles.bold}>Google Calendar:</Text> on a computer, Settings → click your calendar → Integrate calendar → copy "Secret
            address in iCal format".
          </Text>
          <Text style={[styles.how, { marginTop: 8 }]}>
            <Text style={styles.bold}>Outlook:</Text> Settings → Calendar → Shared calendars → Publish a calendar → "Can view when I'm busy" →
            copy the ICS link.
          </Text>
        </Card>
        {icsUrls.map((u) => (
          <View key={u} style={styles.linkRow}>
            <Icon name="link-outline" size={18} color={C.primaryText} />
            <Text style={[styles.title, { flex: 1 }]} numberOfLines={1}>
              {shortLink(u)}
            </Text>
            <Pressable onPress={() => setSettings({ icsUrls: icsUrls.filter((x) => x !== u) })} hitSlop={10} accessibilityLabel="Remove calendar link">
              <Icon name="trash-outline" size={20} color={C.muted} />
            </Pressable>
          </View>
        ))}
        <Field
          label={icsUrls.length ? 'Add another link' : 'Link'}
          value={link}
          onChangeText={setLink}
          onSubmitEditing={addLink}
          placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          <Button small icon="add" label="Add link" onPress={addLink} disabled={!link.trim()} />
          {icsUrls.length > 0 && (
            <Button
              small
              kind="soft"
              icon="refresh"
              label={checking ? 'Reading…' : 'Read now'}
              disabled={checking}
              onPress={() => {
                setChecking(true);
                refreshCalendar().finally(() => setChecking(false));
              }}
            />
          )}
        </View>
        {linkError && <Note icon="alert-circle-outline">{linkError}</Note>}
        {calendarError && icsUrls.length > 0 && <Note icon="alert-circle-outline">{calendarError}</Note>}
        {!calendarError && calendarReadAt && (icsUrls.length > 0 || useCalendar) && (
          <Text style={[styles.help, { marginTop: 10 }]}>
            {calendarBusy.length} busy time{calendarBusy.length === 1 ? '' : 's'} this week · read at {fmtTime(calendarReadAt, true)}
          </Text>
        )}
        <Text style={[styles.help, { marginTop: 10 }]}>
          Keep the link private: anyone with it can see your calendar. Gawain keeps it on this device and only uses it to read busy times.
        </Text>
      </Section>

      {CALENDAR_SUPPORTED && useCalendar && (
        <Section title="Calendars on this phone">
          {cals === null && <Text style={styles.help}>Loading…</Text>}
          {cals?.length === 0 && <Text style={styles.help}>No calendars found. Add your work account in the phone's Settings → Calendar → Accounts.</Text>}
          {cals?.map((c) => (
            <Pressable key={c.id} onPress={() => toggle(c.id)} style={styles.row} accessibilityRole="checkbox" accessibilityState={{ checked: selected(c.id) }}>
              <View style={[styles.dot, { backgroundColor: c.color ?? C.muted }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{c.title}</Text>
                {c.account ? <Text style={styles.help}>{c.account}</Text> : null}
              </View>
              <Icon name={selected(c.id) ? 'checkbox' : 'square-outline'} size={22} color={selected(c.id) ? C.primaryText : C.muted} />
            </Pressable>
          ))}
        </Section>
      )}
    </Screen>
  );
}

const styles = themed(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.lg,
    padding: 12,
    marginTop: 10,
  },
  dot: { width: 12, height: 12, borderRadius: 6 },
  title: { fontSize: 16, color: C.text, fontWeight: '500' },
  help: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  how: { fontSize: 13, color: C.text, lineHeight: 19 },
  bold: { fontWeight: '700' },
}));
