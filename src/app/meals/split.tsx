import { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Button, Card, Chip, Chips, Icon, Screen, Section, confirm } from '../../components/bits';
import { locale, t } from '../../i18n';
import { peso } from '../../lib/meals/labels';
import { settle } from '../../lib/meals/trip';
import { useMeals } from '../../store/useMeals';
import { C, R, themed } from '../../theme';

/** Who paid for groceries, split evenly, and who should hand whom what. Synced with the household. */
export default function Split() {
  const trips = useMeals((s) => s.trips);
  const profile = useMeals((s) => s.profile);
  const cooks = profile?.cooks ?? [];
  const { logTrip, removeTrip } = useMeals.getState();
  const [extra, setExtra] = useState<string[]>([]);
  const people = [...new Set([...cooks, ...trips.map((x) => x.by), ...extra])];
  const [by, setBy] = useState<string>(people[0] ?? '');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [name, setName] = useState('');
  const sum = settle(trips, people);
  const value = Number(amount.replace(/[^\d.]/g, '')) || 0;

  const add = () => {
    if (!by || !value) return;
    logTrip({ at: Date.now(), by, amount: Math.round(value * 100) / 100, note: note.trim() });
    setAmount('');
    setNote('');
  };
  const addPerson = () => {
    const n = name.trim();
    if (n && !people.includes(n)) setExtra([...extra, n]);
    if (n) setBy(n);
    setName('');
  };

  return (
    <Screen stack title={t('Who paid')} subtitle={t('Grocery costs, split evenly')}>
      <Card style={{ marginTop: 8 }}>
        <Text style={styles.kicker}>{t('SPENT SO FAR')}</Text>
        <Text style={styles.total}>{peso(sum.total)}</Text>
        {people.length > 1 && <Text style={styles.meta}>{t('{amount} each for {n} people', { amount: peso(sum.share), n: people.length })}</Text>}
        {sum.transfers.length > 0 ? (
          sum.transfers.map((x) => (
            <View key={`${x.from}-${x.to}`} style={styles.transfer}>
              <Icon name="arrow-forward-circle-outline" size={18} color={C.primaryText} />
              <Text style={styles.transferText}>{t('{from} gives {to} {amount}', { from: x.from, to: x.to, amount: peso(x.amount) })}</Text>
            </View>
          ))
        ) : (
          <Text style={[styles.meta, { marginTop: 8 }]}>{trips.length ? t('All even.') : t('Log a trip after each palengke or grocery run.')}</Text>
        )}
        {trips.length > 0 && (
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <Button
              small
              kind="ghost"
              icon="refresh-outline"
              label={t('Settled up: start fresh')}
              onPress={async () => {
                if (await confirm(t('Start fresh?'), t('This clears every trip for the whole household.'), t('Clear'))) for (const x of trips) removeTrip(x.id);
              }}
            />
          </View>
        )}
      </Card>

      <Section title={t('Log a trip')}>
        <Card>
          <Text style={styles.label}>{t('Who paid?')}</Text>
          <Chips>
            {people.map((p) => (
              <Chip key={p} label={p} active={by === p} onPress={() => setBy(p)} />
            ))}
          </Chips>
          <View style={styles.inputRow}>
            <TextInput value={name} onChangeText={setName} onSubmitEditing={addPerson} placeholder={t('Add someone')} placeholderTextColor={C.muted} style={styles.input} />
            <Button small kind="soft" icon="person-add-outline" label={t('Add')} onPress={addPerson} disabled={!name.trim()} />
          </View>
          <View style={styles.inputRow}>
            <Text style={styles.peso}>₱</Text>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.muted} style={[styles.input, styles.amount]} accessibilityLabel={t('Amount')} />
          </View>
          <TextInput value={note} onChangeText={setNote} placeholder={t('Note (e.g. palengke, Puregold)')} placeholderTextColor={C.muted} style={[styles.input, { marginTop: 8 }]} />
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <Button icon="add" label={t('Log it')} onPress={add} disabled={!by || !value} />
          </View>
        </Card>
      </Section>

      {trips.length > 0 && (
        <Section title={t('Trips')}>
          <Card>
            {[...trips].reverse().map((x) => (
              <View key={x.id} style={styles.trip}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tripTitle}>
                    {x.by} · {peso(x.amount)}
                  </Text>
                  <Text style={styles.meta}>
                    {new Date(x.at).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' })}
                    {x.note ? ` · ${x.note}` : ''}
                  </Text>
                </View>
                <Pressable onPress={() => removeTrip(x.id)} hitSlop={10} accessibilityLabel={t('Remove')}>
                  <Icon name="trash-outline" size={18} color={C.muted} />
                </Pressable>
              </View>
            ))}
          </Card>
        </Section>
      )}
    </Screen>
  );
}

const styles = themed(() => ({
  kicker: { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 0.8 },
  total: { fontSize: 28, fontWeight: '800', color: C.text },
  meta: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  transfer: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  transferText: { fontSize: 15, fontWeight: '700', color: C.text },
  label: { fontSize: 14, fontWeight: '700', color: C.text, marginBottom: 8 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  input: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.text },
  peso: { fontSize: 24, fontWeight: '800', color: C.text },
  amount: { fontSize: 22, fontWeight: '700' },
  trip: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  tripTitle: { fontSize: 15, fontWeight: '700', color: C.text },
}));
