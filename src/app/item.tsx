import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Chip, Chips, Field, Screen, Section, ToggleRow, back } from '../components/bits';
import { AISLES } from '../data/starters';
import { useNow } from '../lib/hooks';
import { lastsDays } from '../lib/pantry';
import { fmtDay } from '../lib/time';
import { useHome } from '../store/useHome';
import { C, themed } from '../theme';

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const now = useNow();
  const item = useHome((s) => s.items.find((i) => i.id === id));
  const places = useHome((s) => s.places);
  const { saveItem, removeItem } = useHome.getState();
  const stores = places.filter((p) => p.kind === 'store');

  const [name, setName] = useState(item?.name ?? '');
  const [aisle, setAisle] = useState(item?.aisle ?? 'Pantry');
  const [store, setStore] = useState<string | null>(item?.store ?? null);
  const [note, setNote] = useState(item?.note ?? '');
  const [tracked, setTracked] = useState(item?.tracked ?? true);
  const [lasts, setLasts] = useState(item?.lastsDays ? String(item.lastsDays) : '');

  const valid = name.trim().length > 0;
  const save = () => {
    if (!valid) return;
    saveItem({
      ...(item ? { id: item.id } : {}),
      name: name.trim(),
      aisle,
      store,
      note: note.trim(),
      tracked,
      lastsDays: parseInt(lasts, 10) || null,
    });
    back();
  };
  const learned = item && !item.lastsDays ? lastsDays(item) : null;

  return (
    <Screen stack title={item ? item.name : 'New pantry item'} right={<Button small label="Save" onPress={save} disabled={!valid} />}>
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Dish soap" autoFocus={!item} />
      <Field label="Note (optional)" value={note} onChangeText={setNote} placeholder="e.g. 2 packs, the big bottle" />

      <Section title="Aisle">
        <Chips>
          {AISLES.map((a) => (
            <Chip key={a} label={a} active={aisle === a} onPress={() => setAisle(a)} />
          ))}
        </Chips>
      </Section>

      {stores.length > 0 && (
        <Section title="Buy it at">
          <Chips>
            <Chip label="Any store" active={store === null} onPress={() => setStore(null)} />
            {stores.map((s) => (
              <Chip key={s.id} label={s.name} icon="storefront-outline" active={store === s.id} onPress={() => setStore(s.id)} />
            ))}
          </Chips>
        </Section>
      )}

      <Section>
        <ToggleRow label="Keep in pantry" hint="Stays after you buy it so Gawain can track how long it lasts. Off for one-off buys." value={tracked} onChange={setTracked} />
        {tracked && (
          <>
            <Field label="One purchase lasts about … days" value={lasts} onChangeText={(t) => setLasts(t.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={learned ? `${learned} (learned from your purchases)` : 'Leave blank to learn it'} />
            {item && item.bought.length > 0 && (
              <Text style={styles.help}>
                Bought {item.bought.length} time{item.bought.length === 1 ? '' : 's'}, last {fmtDay(item.bought[item.bought.length - 1], now)}.
              </Text>
            )}
          </>
        )}
      </Section>

      {item && (
        <View style={{ flexDirection: 'row', marginTop: 20 }}>
          <Button
            small
            kind="danger"
            icon="trash-outline"
            label="Remove"
            onPress={() => {
              removeItem(item.id);
              back();
            }}
          />
        </View>
      )}
    </Screen>
  );
}

const styles = themed(() => ({
  help: { fontSize: 13, color: C.muted, marginTop: 8 },
}));
