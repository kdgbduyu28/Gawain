import { useMemo, useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Chip, Chips, Field, Screen, Section, back } from '../components/bits';
import { TIMER_PRESETS } from '../data/starters';
import { remindAt } from '../lib/gaps';
import { useNow } from '../lib/hooks';
import { MIN, fmtTime } from '../lib/time';
import { allBusy, useHome } from '../store/useHome';
import { C } from '../theme';

export default function TimerScreen() {
  const now = useNow(15_000);
  const startTimer = useHome((s) => s.startTimer);
  const calendarBusy = useHome((s) => s.calendarBusy);
  const blocks = useHome((s) => s.blocks);
  const [preset, setPreset] = useState(TIMER_PRESETS[0]);
  const [label, setLabel] = useState(preset.label);
  const [minutes, setMinutes] = useState(String(preset.minutes));

  const mins = parseInt(minutes, 10) || 0;
  const busy = useMemo(() => allBusy({ calendarBusy, blocks }, now, 2), [calendarBusy, blocks, now]);
  const r = remindAt(now + mins * MIN, busy);

  return (
    <Screen stack title="Start a timer">
      <Section title="What's running">
        <Chips>
          {TIMER_PRESETS.map((p) => (
            <Chip
              key={p.label}
              icon={p.icon}
              label={p.label}
              active={preset.label === p.label}
              onPress={() => {
                setPreset(p);
                setLabel(p.label);
                setMinutes(String(p.minutes));
              }}
            />
          ))}
        </Chips>
      </Section>
      <Field label="Name" value={label} onChangeText={setLabel} />
      <Field label="Minutes" value={minutes} onChangeText={(t) => setMinutes(t.replace(/\D/g, ''))} keyboardType="number-pad" />

      {mins > 0 && (
        <Card style={{ marginTop: 16 }}>
          <Text style={{ color: C.text, fontSize: 15, lineHeight: 21 }}>
            Ends at {fmtTime(now + mins * MIN, true)}.{' '}
            {r.during
              ? `That's during ${r.during.title || 'a meeting'}, so Gawain will remind you at ${fmtTime(r.at, true)} when you're free.`
              : "You're free then, so the reminder comes right on time."}
          </Text>
        </Card>
      )}

      <Section>
        <Button
          icon="play"
          label="Start"
          disabled={!mins || !label.trim()}
          onPress={() => {
            startTimer(label.trim(), preset.icon, mins);
            back();
          }}
        />
      </Section>
    </Screen>
  );
}
