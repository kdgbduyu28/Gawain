import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Card, Check, Chip, Chips, Empty, Fab, Icon, Screen, Section } from '../../components/bits';
import { AISLES } from '../../data/starters';
import { haptic } from '../../lib/haptics';
import { useNow } from '../../lib/hooks';
import { Item, Level, lastsDays, listFor, runOutAt, runningOutSoon, stock } from '../../lib/pantry';
import { fmtDay } from '../../lib/time';
import { useHome } from '../../store/useHome';
import { C, R, themed } from '../../theme';

function byAisle(items: Item[]): { aisle: string; items: Item[] }[] {
  const known = AISLES as readonly string[];
  const order = [...known, ...new Set(items.map((i) => i.aisle).filter((a) => !known.includes(a)))];
  return order
    .map((aisle) => ({ aisle, items: items.filter((i) => i.aisle === aisle).sort((a, b) => a.name.localeCompare(b.name)) }))
    .filter((g) => g.items.length);
}

export default function Groceries() {
  const [tab, setTab] = useState<'list' | 'pantry'>('list');
  return (
    <View style={{ flex: 1 }}>
      <Screen title="Groceries" subtitle={tab === 'list' ? 'Tick items off as you buy them' : 'What you keep at home, and how much is left'}>
        <View style={{ marginTop: 8 }}>
          <Chips>
            <Chip label="Shopping list" icon="list-outline" active={tab === 'list'} onPress={() => setTab('list')} />
            <Chip label="Pantry" icon="file-tray-stacked-outline" active={tab === 'pantry'} onPress={() => setTab('pantry')} />
          </Chips>
        </View>
        {tab === 'list' ? <ShoppingList /> : <Pantry />}
      </Screen>
      {tab === 'pantry' && <Fab label="Add item" onPress={() => router.push('/item')} />}
    </View>
  );
}

function ShoppingList() {
  const now = useNow();
  const items = useHome((s) => s.items);
  const places = useHome((s) => s.places);
  const { addToList, buy, toggleList } = useHome.getState();
  const [text, setText] = useState('');
  const [store, setStore] = useState<string | null>(null);
  const stores = places.filter((p) => p.kind === 'store');

  const onList = listFor(items, store);
  const soon = runningOutSoon(items, now);
  const add = () => {
    addToList(text);
    setText('');
  };

  return (
    <>
      <View style={styles.addRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={add}
          placeholder="Add an item (e.g. eggs)"
          placeholderTextColor={C.muted}
          returnKeyType="done"
          submitBehavior="submit"
          style={styles.addInput}
        />
        <Pressable onPress={add} style={styles.addBtn} accessibilityLabel="Add to list">
          <Icon name="add" size={22} color={C.onColor} />
        </Pressable>
      </View>

      {stores.length > 0 && (
        <View style={{ marginTop: 12 }}>
          <Chips>
            <Chip label="Any store" active={store === null} onPress={() => setStore(null)} />
            {stores.map((s) => (
              <Chip key={s.id} label={s.name} icon="storefront-outline" active={store === s.id} onPress={() => setStore(s.id)} />
            ))}
          </Chips>
        </View>
      )}

      {soon.length > 0 && (
        <Section title="Probably running low">
          <Card>
            {soon.map((i) => (
              <View key={i.id} style={styles.soonRow}>
                <Text style={styles.name}>{i.name}</Text>
                <Text style={[styles.meta, { flex: 1 }]}>usually lasts {lastsDays(i)} days</Text>
                <Pressable onPress={() => toggleList(i.id)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Add ${i.name} to list`}>
                  <Text style={styles.link}>+ Add</Text>
                </Pressable>
              </View>
            ))}
          </Card>
        </Section>
      )}

      {onList.length === 0 ? (
        <Empty icon="basket-outline" title="The list is empty" body="Mark pantry items low or out and they show up here. Or type one in above." />
      ) : (
        byAisle(onList).map((g) => (
          <Section key={g.aisle} title={g.aisle}>
            {g.items.map((i) => (
              <View key={i.id} style={styles.listRow}>
                <Check
                  label={`Bought ${i.name}`}
                  onPress={() => {
                    haptic();
                    buy(i.id);
                  }}
                />
                <Pressable style={{ flex: 1 }} onPress={() => router.push({ pathname: '/item', params: { id: i.id } })}>
                  <Text style={styles.name}>{i.name}</Text>
                  <Text style={styles.meta}>
                    {[i.level === 'out' ? 'Out' : i.level === 'low' ? 'Running low' : null, i.note, places.find((p) => p.id === i.store)?.name]
                      .filter(Boolean)
                      .join(' · ') || (i.tracked ? 'Pantry item' : 'One-off')}
                  </Text>
                </Pressable>
                <Pressable onPress={() => toggleList(i.id)} hitSlop={8} accessibilityLabel={`Remove ${i.name} from list`}>
                  <Icon name="close" size={20} color={C.muted} />
                </Pressable>
              </View>
            ))}
          </Section>
        ))
      )}
    </>
  );
}

const LEVELS: { key: Level; label: string }[] = [
  { key: 'full', label: 'Plenty' },
  { key: 'low', label: 'Low' },
  { key: 'out', label: 'Out' },
];

function Pantry() {
  const now = useNow();
  const items = useHome((s) => s.items).filter((i) => i.tracked);
  const setLevel = useHome((s) => s.setLevel);

  if (!items.length) return <Empty icon="file-tray-stacked-outline" title="Nothing in the pantry yet" body="Add the things you always keep at home." />;

  return (
    <>
      <Text style={[styles.meta, { marginTop: 12, lineHeight: 18 }]}>
        Low or Out puts an item on the list. Tick it off when you buy it, and after a couple of purchases Gawain learns how long it lasts and
        reminds you before it runs out.
      </Text>
      {byAisle(items).map((g) => (
    <Section key={g.aisle} title={g.aisle}>
      {g.items.map((i) => {
        const st = stock(i, now);
        const out = runOutAt(i);
        const lasts = lastsDays(i);
        const hint =
          st === 'soon' && out
            ? `Probably runs out ${fmtDay(out, now)}`
            : lasts
              ? `Lasts about ${lasts} days${i.lastsDays ? '' : ' (learned)'}`
              : i.bought.length
                ? `Bought ${fmtDay(i.bought[i.bought.length - 1], now)}`
                : 'Not bought yet';
        return (
          <Pressable key={i.id} onPress={() => router.push({ pathname: '/item', params: { id: i.id } })} style={styles.pantryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {i.name}
                {i.onList ? <Text style={styles.onList}>  on list</Text> : null}
              </Text>
              <Text style={[styles.meta, st === 'soon' && { color: C.warnText }]}>{hint}</Text>
            </View>
            <View style={styles.levels}>
              {LEVELS.map((l) => (
                <Pressable
                  key={l.key}
                  onPress={() => setLevel(i.id, l.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: i.level === l.key }}
                  accessibilityLabel={`${i.name}: ${l.label}`}
                  style={[
                    styles.level,
                    i.level === l.key && { backgroundColor: l.key === 'full' ? C.primary : l.key === 'low' ? C.accent : C.danger },
                  ]}
                >
                  <Text style={[styles.levelText, i.level === l.key && { color: C.onColor }]}>{l.label}</Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        );
      })}
    </Section>
      ))}
    </>
  );
}

const styles = themed(() => ({
  addRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  addInput: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: C.text },
  addBtn: { width: 46, borderRadius: R.md, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  soonRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.lg,
    padding: 12,
    marginBottom: 8,
  },
  pantryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.lg,
    padding: 12,
    marginBottom: 8,
  },
  name: { fontSize: 16, fontWeight: '600', color: C.text },
  meta: { fontSize: 13, color: C.muted, marginTop: 2 },
  link: { color: C.primaryText, fontWeight: '700', fontSize: 14 },
  onList: { fontSize: 12, color: C.primaryText, fontWeight: '700' },
  levels: { flexDirection: 'row', backgroundColor: C.surface, borderRadius: R.pill, padding: 3 },
  level: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: R.pill },
  levelText: { fontSize: 12, fontWeight: '700', color: C.muted },
}));
