import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Chip, Chips, Field, Label, Note, Screen, Section, ToggleRow } from '../components/bits';
import { Announce, HaEntity, findEntities, haBase, ready, speak } from '../lib/announce';
import { fmtClock } from '../lib/time';
import { IS_WEB } from '../lib/web';
import { useHome } from '../store/useHome';
import { C, themed } from '../theme';

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? 'https://gawain-ccn.pages.dev';

export default function SpeakerScreen() {
  const a = useHome((s) => s.settings.announce);
  const notifications = useHome((s) => s.settings.notifications);
  const { dayStart, dayEnd } = useHome((s) => s.settings.schedule);
  const setSettings = useHome((s) => s.setSettings);
  const set = (p: Partial<Announce>) => setSettings({ announce: { ...useHome.getState().settings.announce, ...p } });

  const [found, setFound] = useState<{ speakers: HaEntity[]; voices: HaEntity[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const insecure = IS_WEB && /^http:\/\//i.test(a.url.trim()) && !/^http:\/\/(localhost|127\.)/i.test(a.url.trim());
  const canLook = !!haBase(a.url) && a.token.trim().length > 20;

  const look = async () => {
    setBusy(true);
    setMsg(null);
    const r = await findEntities(a, IS_WEB);
    setBusy(false);
    if ('error' in r) return setMsg(r.error);
    setFound(r);
    if (!r.speakers.length) setMsg('No speakers found. Add your Sonos, Google Cast or other speaker to Home Assistant first.');
    else if (!r.voices.length) setMsg('No voices found. Add a text-to-speech service in Home Assistant, like Google Translate text-to-speech (free) or Home Assistant Cloud.');
    // Pick the only choice, or keep what was picked before.
    const patch: Partial<Announce> = {};
    if (r.speakers.length === 1 && !a.speaker) patch.speaker = r.speakers[0].id;
    if (r.voices.length && !a.tts) patch.tts = r.voices[0].id;
    if (Object.keys(patch).length) set(patch);
  };

  const test = async () => {
    setBusy(true);
    setMsg(null);
    const r = await speak(a, "Hi, it's Gawain. Reminders will sound like this.", IS_WEB);
    setBusy(false);
    setMsg(r.ok ? 'Sent. You should hear it on the speaker in a moment.' : r.error);
  };

  return (
    <Screen stack title="Say reminders out loud" subtitle="On a Sonos, Google Nest or any speaker in Home Assistant.">
      <Section>
        <Card>
          <ToggleRow
            label="Say reminders on a speaker"
            hint={ready(a) ? undefined : 'Connect Home Assistant and pick a speaker below first.'}
            value={a.on}
            disabled={!ready(a) && !a.on}
            onChange={(on) => set({ on })}
          />
          <ToggleRow label="Appliance timers" hint='"Washer is done", after your meeting if you were in one' value={a.timers} onChange={(timers) => set({ timers })} />
          <ToggleRow label="Free-time suggestions" hint="When a gap fits a chore" value={a.nudges} onChange={(nudges) => set({ nudges })} />
          <ToggleRow label="Morning summary" value={a.digest} onChange={(digest) => set({ digest })} />
          <Text style={styles.hint}>
            {`Never during a meeting, and only between ${fmtClock(dayStart)} and ${fmtClock(dayEnd)} (your day in Work schedule).`}
            {!notifications ? ' Reminders are off in Settings, so nothing will be said until you turn them on.' : ''}
          </Text>
        </Card>
      </Section>

      <Section title="Home Assistant">
        <Field
          label="Address"
          value={a.url}
          onChangeText={(url) => set({ url })}
          placeholder="https://abc123.ui.nabu.casa"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        {insecure && (
          <Text style={[styles.hint, { color: C.dangerText }]}>
            Browsers block http:// addresses from an https page. Use your Home Assistant Cloud (Nabu Casa) or Cloudflare Tunnel address.
          </Text>
        )}
        <Field
          label="Long-lived access token"
          value={a.token}
          onChangeText={(token) => set({ token })}
          placeholder="From your Home Assistant profile → Security"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
        <Text style={styles.hint}>Kept only on this device and sent only to your Home Assistant. Backups leave it out.</Text>
        <View style={styles.buttons}>
          <Button small kind="soft" icon="search" label="Find speakers" onPress={look} disabled={!canLook || busy} />
        </View>
      </Section>

      {(found || a.speaker) && (
        <Section title="Speaker and voice">
          {found?.speakers.length ? (
            <>
              <Label>Speaker</Label>
              <Chips>
                {found.speakers.map((e) => (
                  <Chip key={e.id} icon="volume-high-outline" label={e.name} active={a.speaker === e.id} onPress={() => set({ speaker: e.id })} />
                ))}
              </Chips>
            </>
          ) : (
            <Field label="Speaker" value={a.speaker} onChangeText={(speaker) => set({ speaker: speaker.trim() })} placeholder="media_player.kitchen" autoCapitalize="none" />
          )}
          {found?.voices.length ? (
            <View style={{ marginTop: 14 }}>
              <Label>Voice</Label>
              <Chips>
                {found.voices.map((e) => (
                  <Chip key={e.id} icon="chatbubble-ellipses-outline" label={e.name} active={a.tts === e.id} onPress={() => set({ tts: e.id })} />
                ))}
              </Chips>
            </View>
          ) : (
            <Field label="Voice" value={a.tts} onChangeText={(tts) => set({ tts: tts.trim() })} placeholder="tts.google_en_com" autoCapitalize="none" />
          )}
          <View style={styles.buttons}>
            <Button small icon="volume-high-outline" label="Say a test" onPress={test} disabled={!ready(a) || busy} />
          </View>
        </Section>
      )}

      {msg && (
        <Section>
          <Note>{msg}</Note>
        </Section>
      )}

      <Section title="Good to know">
        <Card>
          {[
            IS_WEB
              ? `In the browser, allow this site in Home Assistant: Settings → System → Network → HTTP server → CORS allowed origins → add ${SITE}.`
              : 'On a phone, reminders are said while Gawain is open. A laptop with Gawain open all day is the most reliable place for this.',
            "Turn this on in one place only. Every device with it on speaks, so you'd hear reminders twice.",
            'Free voices: add "Google Translate text-to-speech" in Home Assistant (Settings → Devices & services). Home Assistant Cloud has more natural ones.',
          ].map((t) => (
            <Text key={t} style={[styles.body, { marginBottom: 8 }]}>
              {`• ${t}`}
            </Text>
          ))}
        </Card>
      </Section>
    </Screen>
  );
}

const styles = themed(() => ({
  body: { color: C.text, fontSize: 14, lineHeight: 20 },
  hint: { color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 8 },
  buttons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
}));
