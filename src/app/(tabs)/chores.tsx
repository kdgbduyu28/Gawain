import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Chip, Chips, Empty, Fab, Screen, Section } from '../../components/bits';
import { ChoreRow } from '../../components/ChoreRow';
import { ROOMS } from '../../data/starters';
import { Chore, Status, byUrgency, status } from '../../lib/chores';
import { useNow } from '../../lib/hooks';
import { useHome } from '../../store/useHome';
import { C, themed } from '../../theme';

const GROUPS: { key: Status; title: string }[] = [
  { key: 'overdue', title: 'Late' },
  { key: 'today', title: 'Today' },
  { key: 'soon', title: 'Next few days' },
  { key: 'later', title: 'Later' },
  { key: 'new', title: 'Not tracked yet' },
];

export default function Chores() {
  const now = useNow();
  const chores = useHome((s) => s.chores);
  const [by, setBy] = useState<'due' | 'room'>('due');

  const sorted = byUrgency(chores, now);
  const groups: { title: string; chores: Chore[] }[] =
    by === 'due'
      ? GROUPS.map((g) => ({ title: g.title, chores: sorted.filter((c) => status(c, now) === g.key) }))
      : [...ROOMS, ...new Set(chores.map((c) => c.room).filter((r) => !(ROOMS as readonly string[]).includes(r)))].map((room) => ({
          title: room,
          chores: sorted.filter((c) => c.room === room),
        }));

  return (
    <View style={{ flex: 1 }}>
      <Screen title="Chores" subtitle="Each one repeats from the last time you did it">
        <View style={{ marginTop: 8 }}>
          <Chips>
            <Chip label="By due date" active={by === 'due'} onPress={() => setBy('due')} />
            <Chip label="By room" active={by === 'room'} onPress={() => setBy('room')} />
          </Chips>
        </View>
        {chores.length === 0 && <Empty icon="checkmark-done-outline" title="No chores yet" body="Add the things you do around the house and how often." />}
        {groups
          .filter((g) => g.chores.length)
          .map((g) => (
            <Section key={g.title} title={g.title}>
              {g.title === 'Not tracked yet' && <Text style={styles.help}>Tap ✓ the next time you do one and it starts counting from then.</Text>}
              {g.chores.map((c) => (
                <ChoreRow key={c.id} chore={c} now={now} hideRoom={by === 'room'} />
              ))}
            </Section>
          ))}
      </Screen>
      <Fab label="Add chore" onPress={() => router.push('/chore')} />
    </View>
  );
}

const styles = themed(() => ({
  help: { fontSize: 13, color: C.muted, marginBottom: 8, marginTop: -2 },
}));
