import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Chip, Chips, Field, Screen, Section, back } from '../components/bits';
import { dueLabel } from '../components/ChoreRow';
import { ROOMS } from '../data/starters';
import { onTimeRate, streak } from '../lib/chores';
import { useNow } from '../lib/hooks';
import { DAY, addDays, fmtDay, fmtEvery } from '../lib/time';
import { useHome } from '../store/useHome';
import { C, themed } from '../theme';

const REPEATS: { days: number | null; label: string }[] = [
  { days: null, label: 'Just once' },
  { days: 1, label: 'Daily' },
  { days: 2, label: 'Every 2 days' },
  { days: 3, label: 'Every 3 days' },
  { days: 7, label: 'Weekly' },
  { days: 14, label: 'Every 2 weeks' },
  { days: 30, label: 'Monthly' },
];
const MINUTES = [5, 10, 15, 20, 30, 45, 60];
const LAST_DONE: { label: string; daysAgo: number | null }[] = [
  { label: 'Not sure', daysAgo: null },
  { label: 'Today', daysAgo: 0 },
  { label: 'Yesterday', daysAgo: 1 },
  { label: 'A few days ago', daysAgo: 3 },
  { label: 'A week ago', daysAgo: 7 },
];

export default function ChoreScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const now = useNow();
  const chore = useHome((s) => s.chores.find((c) => c.id === id));
  const history = useHome((s) => s.history);
  const { saveChore, removeChore, markDone, snooze } = useHome.getState();

  const [name, setName] = useState(chore?.name ?? '');
  const [room, setRoom] = useState(chore?.room ?? 'Kitchen');
  const [everyDays, setEveryDays] = useState<number | null>(chore ? chore.everyDays : 7);
  const [minutes, setMinutes] = useState(chore?.minutes ?? 15);
  const [where, setWhere] = useState<'home' | 'out'>(chore?.where ?? 'home');
  const [lastDoneAgo, setLastDoneAgo] = useState<number | null>(null);

  const valid = name.trim().length > 0 && minutes > 0 && (everyDays === null || everyDays > 0);
  const save = () => {
    if (!valid) return;
    saveChore({
      ...(chore ? { id: chore.id } : {}),
      name: name.trim(),
      room,
      everyDays,
      minutes,
      where,
      ...(!chore && lastDoneAgo !== null && everyDays !== null ? { lastDone: addDays(now, -lastDoneAgo) } : {}),
    });
    back();
  };

  const mine = chore ? history.filter((h) => h.choreId === chore.id) : [];
  const rate = chore ? onTimeRate(history, chore.id) : null;

  return (
    <Screen stack title={chore ? 'Edit chore' : 'New chore'} right={<Button small label="Save" onPress={save} disabled={!valid} />}>
      <Field label="What" value={name} onChangeText={setName} placeholder="e.g. Clean the fridge" autoFocus={!chore} onSubmitEditing={save} />

      <Section title="Room">
        <Chips>
          {ROOMS.map((r) => (
            <Chip
              key={r}
              label={r}
              active={room === r}
              onPress={() => {
                setRoom(r);
                if (r === 'Errands') setWhere('out');
                else if (room === 'Errands') setWhere('home');
              }}
            />
          ))}
        </Chips>
      </Section>

      <Section title="Repeats">
        <Chips>
          {REPEATS.map((r) => (
            <Chip key={r.label} label={r.label} active={everyDays === r.days} onPress={() => setEveryDays(r.days)} />
          ))}
        </Chips>
        {everyDays !== null && (
          <Field
            label="Or every … days"
            value={String(everyDays)}
            keyboardType="number-pad"
            onChangeText={(t) => setEveryDays(Math.max(0, parseInt(t.replace(/\D/g, ''), 10) || 0))}
          />
        )}
        <Text style={styles.help}>
          {everyDays === null
            ? 'Gone from the list once you mark it done.'
            : `Due ${fmtEvery(everyDays)} after the last time you did it. Doing it late moves the next one too.`}
        </Text>
      </Section>

      <Section title="Takes about">
        <Chips>
          {MINUTES.map((m) => (
            <Chip key={m} label={`${m} min`} active={minutes === m} onPress={() => setMinutes(m)} />
          ))}
        </Chips>
        <Text style={styles.help}>Used to fit chores into the gaps between your meetings.</Text>
      </Section>

      <Section title="Where">
        <Chips>
          <Chip label="At home" icon="home-outline" active={where === 'home'} onPress={() => setWhere('home')} />
          <Chip label="Errand (outside)" icon="car-outline" active={where === 'out'} onPress={() => setWhere('out')} />
        </Chips>
        <Text style={styles.help}>{where === 'out' ? 'Errands come up when you leave home, never in work breaks.' : 'Suggested in your free time at home.'}</Text>
      </Section>

      {!chore && everyDays !== null && (
        <Section title="Last done">
          <Chips>
            {LAST_DONE.map((o) => (
              <Chip key={o.label} label={o.label} active={lastDoneAgo === o.daysAgo} onPress={() => setLastDoneAgo(o.daysAgo)} />
            ))}
          </Chips>
        </Section>
      )}

      {chore && (
        <Section title="History">
          <Card>
            <Text style={styles.stat}>
              {chore.lastDone ? `Last done ${fmtDay(chore.lastDone, now)}` : 'Never marked done'} · {dueLabel(chore, now).text}
            </Text>
            {mine.length > 0 && (
              <Text style={styles.help}>
                {streak(history, chore.id)} on time in a row
                {rate !== null ? ` · ${Math.round(rate * 100)}% on time lately` : ''} · done {mine.length} time{mine.length === 1 ? '' : 's'}
              </Text>
            )}
            {mine
              .slice(-6)
              .reverse()
              .map((h) => (
                <View key={h.at} style={styles.histRow}>
                  <Text style={styles.histDate}>{new Date(h.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
                  <Text style={[styles.histTag, { color: h.late ? C.warnText : C.primaryText }]}>{h.late ? `${h.late} day${h.late > 1 ? 's' : ''} late` : 'On time'}</Text>
                </View>
              ))}
          </Card>
          <View style={styles.actions}>
            {chore.everyDays !== null && (
              <Button
                small
                kind="soft"
                icon="checkmark"
                label="Done yesterday"
                onPress={() => {
                  markDone(chore.id, now - DAY);
                  back();
                }}
              />
            )}
            <Button
              small
              kind="soft"
              icon="moon-outline"
              label="Not today"
              onPress={() => {
                snooze(chore.id, 1);
                back();
              }}
            />
            <Button
              small
              kind="danger"
              icon="trash-outline"
              label="Delete"
              onPress={() => {
                removeChore(chore.id);
                back();
              }}
            />
          </View>
        </Section>
      )}
    </Screen>
  );
}

const styles = themed(() => ({
  help: { fontSize: 13, color: C.muted, marginTop: 8, lineHeight: 18 },
  stat: { fontSize: 15, fontWeight: '600', color: C.text },
  histRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.line, marginTop: 6 },
  histDate: { fontSize: 14, color: C.text },
  histTag: { fontSize: 13, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
}));
