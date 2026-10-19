import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Chips, Icon, Screen, Section } from '../components/bits';
import { STARTER_CHORES, STARTER_ITEMS } from '../data/starters';
import { useSync } from '../lib/sync/engine';
import { fmtEvery } from '../lib/time';
import { useHome } from '../store/useHome';
import { C, MAX_WIDTH, themed } from '../theme';

const DEFAULT_CHORES = ['Wash the dishes', 'Take out the trash', 'Do the laundry', 'Sweep and mop', 'Clean the bathroom', 'Change bedsheets', 'Clean the fridge'];
const DEFAULT_ITEMS = ['Rice', 'Eggs', 'Cooking oil', 'Coffee', 'Drinking water', 'Dish soap', 'Laundry detergent', 'Toilet paper'];

function toggle(list: string[], x: string) {
  return list.includes(x) ? list.filter((y) => y !== x) : [...list, x];
}

export default function Welcome() {
  const welcome = useHome((s) => s.welcome);
  const insets = useSafeAreaInsets();
  const [chores, setChores] = useState(DEFAULT_CHORES);
  const [items, setItems] = useState(DEFAULT_ITEMS);
  // Signing in from here can bring chores from another device; then there's nothing to set up.
  const welcomed = useHome((s) => s.settings.welcomed);
  if (welcomed) return <Redirect href="/" />;

  const start = () => {
    welcome(chores, items);
    router.replace('/');
  };

  return (
    <Screen
      title="Gawain"
      subtitle="Chores that fit around your work day"
      footer={
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <View style={{ width: '100%', maxWidth: MAX_WIDTH }}>
            <Button label={`Start with ${chores.length} chores and ${items.length} pantry items`} onPress={start} />
          </View>
        </View>
      }
    >
      {useSync.getState().configured && (
        <Pressable onPress={() => router.push('/account')} style={styles.signIn} accessibilityRole="link">
          <Icon name="cloud-download-outline" size={18} color={C.primaryText} />
          <Text style={styles.signInText}>Already use Gawain? Sign in to bring your chores and groceries</Text>
        </Pressable>
      )}

      <Text style={styles.intro}>
        Each chore repeats from the last time you actually did it, not on a fixed date. Gawain finds the gaps between your meetings and
        suggests what fits. Pick a few to start; you can change everything later.
      </Text>

      <Section title="Chores you do">
        <Chips>
          {STARTER_CHORES.map((c) => (
            <Chip key={c.name} label={`${c.name} · ${fmtEvery(c.everyDays)}`} active={chores.includes(c.name)} onPress={() => setChores((l) => toggle(l, c.name))} />
          ))}
        </Chips>
      </Section>

      <Section title="Things you keep at home">
        <Chips>
          {STARTER_ITEMS.map((i) => (
            <Chip key={i.name} label={i.name} active={items.includes(i.name)} onPress={() => setItems((l) => toggle(l, i.name))} />
          ))}
        </Chips>
      </Section>
      <View style={{ height: 80 }} />
    </Screen>
  );
}

const styles = themed(() => ({
  intro: { fontSize: 15, color: C.muted, lineHeight: 22, marginTop: 8 },
  signIn: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: C.primarySoft },
  signInText: { flex: 1, color: C.primaryText, fontSize: 14, fontWeight: '600' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line },
}));
