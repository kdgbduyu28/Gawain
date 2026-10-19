import * as Clipboard from 'expo-clipboard';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Button, Card, Chip, Chips, Icon, LinkRow, Note, Screen, Section, confirm } from '../components/bits';
import { HomeEvent, Trigger, curlExample, haAutomation, haRestCommand, hookUrl, verb } from '../lib/smarthome';
import { supabase } from '../lib/supabase';
import { syncNow, useSync } from '../lib/sync/engine';
import { useNow } from '../lib/hooks';
import { fmtDay, fmtTime } from '../lib/time';
import { useHome } from '../store/useHome';
import { C, R, themed } from '../theme';

/** Where the website (and its /api/home function) lives; hubs post there from anywhere. */
const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://gawain-ccn.pages.dev';

const when = (t: number) => {
  const d = fmtDay(t, Date.now());
  return `${d[0].toUpperCase()}${d.slice(1)}, ${fmtTime(t, true)}`;
};

function errorText(e: unknown): string {
  const msg = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : String(e);
  // The database hasn't had the smart-home migration yet.
  return /could not find the function/i.test(msg) ? "Smart home isn't switched on on Gawain's server yet." : msg;
}

export default function SmartHome() {
  const { configured, email } = useSync();
  return (
    <Screen stack title="Smart home" subtitle="Let buttons, smart plugs and Home Assistant tell Gawain when something's done.">
      {!configured ? (
        <Section>
          <Note>{"Smart home needs sync, which isn't set up in this version of Gawain."}</Note>
        </Section>
      ) : !email ? (
        <Section>
          <Card>
            <Text style={styles.body}>
              Smart home works through your Gawain account: your hub sends events to a private link, and every device signed in to your household picks
              them up.
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <Button small icon="person-circle-outline" label="Sign in" onPress={() => router.push('/account')} />
            </View>
          </Card>
        </Section>
      ) : (
        <SignedIn />
      )}
      <SpeakerLink />
      <Ideas />
    </Screen>
  );
}

function SignedIn() {
  const triggers = useHome((s) => s.triggers);
  const chores = useHome((s) => s.chores);
  const token = useHome((s) => s.settings.hookToken);
  const [events, setEvents] = useState<HomeEvent[] | null>(null);

  const loadEvents = useCallback(async () => {
    const { data, error } = await supabase!.from('home_events').select('id, trigger_key, event, at').order('id', { ascending: false }).limit(8);
    if (!error) setEvents((data as { id: number; trigger_key: string; event: string; at: string }[]).map((r) => ({ id: Number(r.id), key: r.trigger_key, event: r.event, at: new Date(r.at).getTime() })));
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvents();
    }, [loadEvents]),
  );

  const describe = (t: Trigger) =>
    t.kind === 'chore'
      ? `Marks ${chores.find((c) => c.id === t.choreId)?.name ?? 'a deleted chore'} done`
      : `Appliance timer, usually ${t.minutes} min`;

  return (
    <>
      <LinkSection onTested={() => setTimeout(() => { syncNow(); loadEvents(); }, 1500)} />

      <Section title="Triggers" right={<Button small kind="ghost" icon="add" label="Add" onPress={() => router.push('/trigger')} />}>
        {triggers.length ? (
          <Card>
            {triggers.map((t) => (
              <LinkRow key={t.id} icon={t.icon} label={t.name} hint={`${describe(t)} · sends "${t.key}"`} onPress={() => router.push({ pathname: '/trigger', params: { id: t.id } })} />
            ))}
          </Card>
        ) : (
          <Card>
            <Text style={styles.body}>
              {
                'A trigger is a name your hub sends, like "washer" or "trash", and what Gawain does when it arrives: mark a chore done, or start and finish an appliance timer.'
              }
            </Text>
            <View style={{ flexDirection: 'row', marginTop: 12 }}>
              <Button small icon="add" label="Add a trigger" onPress={() => router.push('/trigger')} />
            </View>
          </Card>
        )}
      </Section>

      {token && triggers.length > 0 && <Setup url={hookUrl(SITE, token)} triggers={triggers} />}

      {events && events.length > 0 && (
        <Section title="Recently received" right={<Button small kind="ghost" icon="refresh" label="Refresh" onPress={loadEvents} />}>
          <Card>
            {events.map((e) => {
              const t = triggers.find((x) => x.key === e.key);
              const v = t ? verb(t, e.event) : null;
              return (
                <View key={e.id} style={styles.event}>
                  <Icon name={v ? 'checkmark-circle' : 'help-circle-outline'} size={18} color={v ? C.primaryText : C.muted} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventTitle}>
                      {e.key} {e.event || '(no event)'}
                    </Text>
                    <Text style={styles.hint}>
                      {when(e.at)} ·{' '}
                      {!t ? 'No trigger with this name' : v ? (t.kind === 'chore' ? 'Marks the chore done' : `${t.name} ${v}`) : `"${e.event}" isn't an event ${t.name} uses`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </Section>
      )}
    </>
  );
}

/** The household's secret link: make it, copy it, test it, replace it. */
function LinkSection({ onTested }: { onTested: () => void }) {
  const token = useHome((s) => s.settings.hookToken);
  const triggers = useHome((s) => s.triggers);
  const setSettings = useHome((s) => s.setSettings);
  const [madeAt, setMadeAt] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const now = useNow();

  useEffect(() => {
    supabase!
      .rpc('home_hook_made_at')
      .then(({ data, error }) => {
        if (error) setMsg(errorText(error));
        setMadeAt(data ? new Date(data as string).getTime() : null);
        // Turned off from another device.
        if (!error && !data && useHome.getState().settings.hookToken) setSettings({ hookToken: null });
      });
  }, [setSettings]);

  const make = async () => {
    if (madeAt && !(await confirm('Make a new link?', 'The current link stops working. Anything using it (Home Assistant, Shortcuts) needs the new one.', 'Make new link'))) return;
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase!.rpc('new_home_hook');
    setBusy(false);
    if (error) return setMsg(errorText(error));
    setSettings({ hookToken: data as string });
    setMadeAt(Date.now());
  };

  const remove = async () => {
    if (!(await confirm('Turn off the link?', 'Events sent to it will be turned away. You can make a new link any time.', 'Turn off'))) return;
    const { error } = await supabase!.rpc('remove_home_hook');
    if (error) return setMsg(errorText(error));
    setSettings({ hookToken: null });
    setMadeAt(null);
  };

  const test = async () => {
    if (!token) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(hookUrl(SITE, token), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ trigger: triggers[0]?.key ?? 'test', event: 'test' }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setMsg(res.ok ? 'Test received. It shows under Recently received, and changes nothing.' : (body.error ?? `The link answered ${res.status}.`));
      if (res.ok) onTested();
    } catch {
      setMsg("Couldn't reach the link. Check you're online.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Your private link">
      <Card>
        {madeAt === undefined ? (
          <Text style={styles.hint}>Checking…</Text>
        ) : token ? (
          <>
            <Text style={styles.body}>Anything that sends a request to this link can tell Gawain what happened. Keep it private, like a password.</Text>
            <Code text={hookUrl(SITE, token)} />
            <View style={styles.buttons}>
              <Button small kind="soft" icon="paper-plane-outline" label="Send a test" onPress={test} disabled={busy} />
              <Button small kind="ghost" icon="refresh" label="New link" onPress={make} disabled={busy} />
              <Button small kind="ghost" icon="close-circle-outline" label="Turn off" onPress={remove} disabled={busy} />
            </View>
          </>
        ) : madeAt ? (
          <>
            <Text style={styles.body}>
              {`Your household's link was made on another device (${fmtDay(madeAt, now)}). It's only shown where it was made. To use it here, copy it from that device, or make a new one (the old one then stops working).`}
            </Text>
            <View style={styles.buttons}>
              <Button small icon="refresh" label="Make a new link" onPress={make} disabled={busy} />
              <Button small kind="ghost" icon="close-circle-outline" label="Turn off" onPress={remove} disabled={busy} />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.body}>Make a private link for your household. Your hub, shortcuts or scripts send events to it.</Text>
            <View style={styles.buttons}>
              <Button small icon="link" label="Make my link" onPress={make} disabled={busy} />
            </View>
          </>
        )}
        {msg && <Text style={[styles.hint, { marginTop: 10 }]}>{msg}</Text>}
      </Card>
    </Section>
  );
}

type Tool = 'ha' | 'shortcuts' | 'other';

function Setup({ url, triggers }: { url: string; triggers: Trigger[] }) {
  const chores = useHome((s) => s.chores);
  const [tool, setTool] = useState<Tool>('ha');
  const [pick, setPick] = useState(triggers[0].id);
  const t = triggers.find((x) => x.id === pick) ?? triggers[0];
  const event = t.kind === 'appliance' ? 'finished' : 'pressed';

  return (
    <Section title="Set it up">
      <Chips>
        <Chip label="Home Assistant" active={tool === 'ha'} onPress={() => setTool('ha')} />
        <Chip label="iPhone & Android" active={tool === 'shortcuts'} onPress={() => setTool('shortcuts')} />
        <Chip label="Anything else" active={tool === 'other'} onPress={() => setTool('other')} />
      </Chips>
      {triggers.length > 1 && (
        <>
          <Text style={[styles.hint, { marginTop: 12 }]}>Examples for</Text>
          <Chips>
            {triggers.map((x) => (
              <Chip key={x.id} icon={x.icon} label={x.name} active={x.id === t.id} onPress={() => setPick(x.id)} />
            ))}
          </Chips>
        </>
      )}

      {tool === 'ha' && (
        <Card style={{ marginTop: 12 }}>
          <Step n={1}>Add this to configuration.yaml, then restart Home Assistant. Do this once; every automation uses it.</Step>
          <Code text={haRestCommand(url)} />
          <Step n={2}>Settings → Automations & scenes → Create automation → ⋮ → Edit in YAML. Paste this:</Step>
          <Code text={haAutomation(t, chores.find((c) => c.id === t.choreId)?.name)} />
          <Text style={styles.hint}>
            {t.kind === 'appliance'
              ? 'Change the sensor to your plug\'s power sensor. Tapo P110/P115 and Tuya or Smart Life energy plugs report power. To start the timer when the cycle begins too, copy the automation, use "above: 10" and "event: started", and Gawain will learn how long a cycle really takes.'
              : 'Easiest: switch back to the visual editor, set the trigger to your button (Zigbee, Tuya or any device), and keep the action. A robot vacuum works too: trigger when it returns to the dock.'}
          </Text>
        </Card>
      )}

      {tool === 'shortcuts' && (
        <Card style={{ marginTop: 12 }}>
          <Text style={styles.body}>No hub needed. Stick a cheap NFC tag on the {t.kind === 'appliance' ? 'appliance' : 'trash bin, plant or washer'} and tap your phone on it.</Text>
          <Step n={1}>iPhone: Shortcuts → Automation → New → NFC → scan the tag → Run immediately → New blank automation.</Step>
          <Step n={2}>{'Add "Get contents of URL". URL: the link below. Method: POST. Request body: JSON with these two text fields:'}</Step>
          <Code text={`trigger: ${t.key}\nevent: ${event}`} />
          <Code text={url} />
          <Text style={styles.hint}>Android: the free HTTP Shortcuts app (or Tasker with an NFC plugin) does the same: a POST to the link with the JSON body below.</Text>
          <Code text={JSON.stringify({ trigger: t.key, event })} />
        </Card>
      )}

      {tool === 'other' && (
        <Card style={{ marginTop: 12 }}>
          <Text style={styles.body}>Send a POST with a JSON body. IFTTT webhooks, Node-RED, Tasker or a script all work.</Text>
          <Code text={curlExample(url, t)} />
          <Text style={styles.hint}>
            {`Tools that can't send a body can POST to <link>/${t.key}/${event} instead. Events: ${t.kind === 'appliance' ? '"started" and "finished"' : '"pressed" (or "done")'}.`}
          </Text>
        </Card>
      )}
    </Section>
  );
}

function Step({ n, children }: { n: number; children: string }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepN}>{n}</Text>
      <Text style={[styles.body, { flex: 1 }]}>{children}</Text>
    </View>
  );
}

/** Copyable text in a monospace box. */
function Code({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <View style={styles.code}>
      <Text style={styles.codeText} selectable>
        {text}
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Copy"
        hitSlop={8}
        onPress={() =>
          Clipboard.setStringAsync(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          })
        }
        style={styles.copy}
      >
        <Icon name={copied ? 'checkmark' : 'copy-outline'} size={16} color={C.primaryText} />
        <Text style={styles.copyText}>{copied ? 'Copied' : 'Copy'}</Text>
      </Pressable>
    </View>
  );
}

/** Outgoing: reminders said on a speaker. Needs no account, just Home Assistant. */
function SpeakerLink() {
  const a = useHome((s) => s.settings.announce);
  return (
    <Section title="Speakers">
      <Card>
        <LinkRow
          icon="volume-high-outline"
          label="Say reminders out loud"
          hint={a.on ? `On · ${a.speaker.replace(/^media_player\./, '')}` : 'On a Sonos, Google Nest or any speaker in Home Assistant'}
          onPress={() => router.push('/speaker')}
        />
      </Card>
    </Section>
  );
}

function Ideas() {
  const ideas: [string, string][] = [
    ['water-outline', 'A smart plug on the washer (Tapo P110, Tuya energy plugs). When the power drops, Gawain says the laundry is done, after your meeting if you\'re in one.'],
    ['radio-button-on-outline', 'A Zigbee or Tuya button on the trash bin. One press marks "Take out the trash" done.'],
    ['phone-portrait-outline', 'An NFC sticker on the plant pot. Tap your phone, and watering is done.'],
    ['sparkles-outline', 'Robot vacuum back on its dock: "Vacuum" is done.'],
  ];
  return (
    <Section title="Ideas">
      <Card>
        {ideas.map(([icon, text]) => (
          <View key={text} style={styles.event}>
            <Icon name={icon} size={18} color={C.primaryText} />
            <Text style={[styles.body, { flex: 1 }]}>{text}</Text>
          </View>
        ))}
      </Card>
    </Section>
  );
}

const styles = themed(() => ({
  body: { color: C.text, fontSize: 14, lineHeight: 20 },
  hint: { color: C.muted, fontSize: 13, lineHeight: 18 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  event: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 8 },
  eventTitle: { color: C.text, fontSize: 14, fontWeight: '600' },
  step: { flexDirection: 'row', gap: 10, marginTop: 12 },
  stepN: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.primarySoft,
    color: C.primaryText,
    textAlign: 'center',
    lineHeight: 22,
    fontSize: 12,
    fontWeight: '800',
    overflow: 'hidden',
  },
  code: { backgroundColor: C.surface, borderRadius: R.md, padding: 12, paddingRight: 76, marginTop: 10, marginBottom: 6 },
  codeText: { color: C.text, fontSize: 12, lineHeight: 18, fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'ui-monospace, Menlo, Consolas, monospace' }) },
  copy: { position: 'absolute', top: 8, right: 8, flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  copyText: { color: C.primaryText, fontSize: 12, fontWeight: '700' },
}));
