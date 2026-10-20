import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Chip, Chips, Icon, Screen, Section } from '../../components/bits';
import { locale, t } from '../../i18n';
import { cookChore, prepChore } from '../../lib/meals/cooking';
import { peso } from '../../lib/meals/labels';
import { feastOn, holidayOn } from '../../lib/meals/phcalendar';
import { eligible, slotCost } from '../../lib/meals/planner';
import { priceBook } from '../../lib/meals/prices';
import { FESTIVE, RECIPE } from '../../lib/meals/recipes';
import { addToGroceries } from '../../lib/meals/toGroceries';
import { SECTION_LABEL, byRoute, partyList, partySlots } from '../../lib/meals/trip';
import { addDays, startOfDay } from '../../lib/time';
import { useHome } from '../../store/useHome';
import { DEFAULT_PROFILE, useMeals } from '../../store/useMeals';
import { C, R, themed } from '../../theme';

const DAYS_AHEAD = 21;

/** The next holiday or feast within three weeks, to suggest as the party date. */
function nextOccasion(now: number): { date: number; name: string } | null {
  for (let i = 0; i <= DAYS_AHEAD; i++) {
    const d = addDays(startOfDay(now), i);
    const feast = feastOn(d);
    if (feast) return { date: d, name: feast === 'noche_buena' ? 'Noche Buena' : 'Media Noche' };
    const h = holidayOn(d);
    if (h) return { date: d, name: h.name };
  }
  return null;
}

/** Handaan: pick dishes and a head count, get amounts, a shopping list and cooking chores. */
export default function Party() {
  const profile = useMeals((s) => s.profile) ?? DEFAULT_PROFILE;
  const stored = useMeals((s) => s.book);
  const book = stored ?? priceBook(null, profile.shop);
  const [now] = useState(() => Date.now());
  const occasion = nextOccasion(now);
  const [date, setDate] = useState(occasion?.date ?? addDays(startOfDay(now), 3));
  const [guests, setGuests] = useState(15);
  const [kids, setKids] = useState(5);
  const options = useMemo(() => eligible(profile).filter((r) => !r.side && !r.leftover && (r.meals.includes('dinner') || r.meals.includes('lunch'))), [profile]);
  const festive = options.filter((r) => FESTIVE.has(r.id));
  const [picked, setPicked] = useState<string[]>(() => festive.slice(0, 4).map((r) => r.id));
  const [more, setMore] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const slots = partySlots(picked, guests, kids);
  const list = partyList(picked, guests, kids, profile, book).filter((g) => !g.staple);
  const total = slots.reduce((n, s) => n + slotCost(s, book), 0);
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const dayLabel = (d: number) => new Date(d).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });

  const addChores = () => {
    const { saveChore } = useHome.getState();
    for (const s of slots) {
      const r = RECIPE[s.recipeId];
      saveChore(cookChore(r, date));
      const prep = prepChore(r, date);
      if (prep) saveChore(prep);
    }
    setDone(t('Added {n} cooking chores for {day}.', { n: slots.length, day: dayLabel(date) }));
  };

  return (
    <Screen stack title={t('Handaan')} subtitle={t('Party food for a crowd')}>
      <Section title={t('When')}>
        <Chips>
          {occasion && <Chip icon="sparkles-outline" label={`${t(occasion.name)} · ${dayLabel(occasion.date)}`} active={date === occasion.date} onPress={() => setDate(occasion.date)} />}
          {[1, 2, 3, 6, 7].map((i) => {
            const d = addDays(startOfDay(now), i);
            return <Chip key={i} label={dayLabel(d)} active={date === d} onPress={() => setDate(d)} />;
          })}
        </Chips>
      </Section>

      <Section title={t('Guests')}>
        <Counter label={t('Adults')} value={guests} onChange={setGuests} step={5} />
        <Counter label={t('Kids')} value={kids} onChange={setKids} step={1} />
      </Section>

      <Section title={t('Dishes')}>
        <Chips>
          {(more ? options : festive).map((r) => (
            <Chip key={r.id} label={r.name} active={picked.includes(r.id)} onPress={() => toggle(r.id)} />
          ))}
        </Chips>
        <Pressable onPress={() => setMore(!more)} style={{ marginTop: 8 }}>
          <Text style={styles.link}>{more ? t('Just handaan favourites') : t('Show every dish')}</Text>
        </Pressable>
      </Section>

      {slots.length > 0 && (
        <>
          <Card style={{ marginTop: 16 }}>
            <Text style={styles.kicker}>{t('ABOUT')}</Text>
            <Text style={styles.total}>{peso(total)}</Text>
            <Text style={styles.meta}>
              {t('{amount} a guest · {n} portions of each dish', { amount: peso(total / Math.max(1, guests + kids)), n: slots[0].portions })}
            </Text>
            <View style={styles.row}>
              <Button small icon="basket-outline" label={t('Add to my shopping list')} onPress={() => setDone(t('Added {n} items to Groceries, grouped by aisle.', { n: addToGroceries(list) }))} />
              <Button small kind="soft" icon="checkbox-outline" label={t('Add cooking to chores')} onPress={addChores} />
            </View>
            {done && (
              <View style={styles.done}>
                <Icon name="checkmark-circle" size={16} color={C.primaryText} />
                <Text style={styles.doneText}>{done}</Text>
                <Pressable onPress={() => router.navigate('/groceries')}>
                  <Text style={styles.link}>{t('Open Groceries')}</Text>
                </Pressable>
              </View>
            )}
          </Card>
          {byRoute(list).map(({ section, lines }) => (
            <Section key={section} title={t(SECTION_LABEL[section])}>
              <Card>
                {lines.map((g) => (
                  <View key={g.id} style={styles.line}>
                    <Text style={styles.name}>{g.name}</Text>
                    <Text style={styles.qty}>{g.buy}</Text>
                    <Text style={styles.cost}>{peso(g.cost)}</Text>
                  </View>
                ))}
              </Card>
            </Section>
          ))}
          <Text style={[styles.meta, { marginTop: 12 }]}>{t('Buffet-style: about 1.2 portions of mains a guest across all dishes, plus rice. Staples like oil and soy sauce aren’t listed.')}</Text>
        </>
      )}
    </Screen>
  );
}

function Counter({ label, value, onChange, step }: { label: string; value: number; onChange: (n: number) => void; step: number }) {
  return (
    <View style={styles.counter}>
      <Text style={styles.counterLabel}>{label}</Text>
      <Pressable onPress={() => onChange(Math.max(0, value - step))} style={styles.step} accessibilityLabel={t('Fewer {what}', { what: label.toLowerCase() })}>
        <Icon name="remove" size={20} color={C.primaryText} />
      </Pressable>
      <Text style={styles.count}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(300, value + step))} style={styles.step} accessibilityLabel={t('More {what}', { what: label.toLowerCase() })}>
        <Icon name="add" size={20} color={C.primaryText} />
      </Pressable>
    </View>
  );
}

const styles = themed(() => ({
  link: { color: C.primaryText, fontWeight: '700', fontSize: 14 },
  kicker: { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 0.8 },
  total: { fontSize: 28, fontWeight: '800', color: C.text },
  meta: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  doneText: { color: C.primaryText, fontWeight: '600', fontSize: 13 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line },
  name: { flex: 1, fontSize: 15, color: C.text },
  qty: { fontSize: 14, fontWeight: '700', color: C.text },
  cost: { width: 64, textAlign: 'right', fontSize: 13, color: C.muted },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 12, marginBottom: 8 },
  counterLabel: { flex: 1, fontSize: 16, fontWeight: '600', color: C.text },
  step: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  count: { fontSize: 20, fontWeight: '700', color: C.text, minWidth: 36, textAlign: 'center' },
}));
