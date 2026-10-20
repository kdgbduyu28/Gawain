import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Chip, Chips, Empty, Icon, Screen, Section } from '../../components/bits';
import { peso } from '../../lib/meals/labels';
import { GroceryLine } from '../../lib/meals/planner';
import { SECTION_LABEL, byRoute, cashFor } from '../../lib/meals/trip';
import { addToGroceries } from '../../lib/meals/toGroceries';
import { useMeals } from '../../store/useMeals';
import { t } from '../../i18n';
import { C, themed } from '../../theme';

export default function MealList() {
  const plan = useMeals((s) => s.plan);
  const shop = useMeals((s) => s.profile?.shop);
  const [done, setDone] = useState<number | null>(null);
  const [route, setRoute] = useState(shop !== 'supermarket');
  if (!plan)
    return (
      <Screen stack title={t('Grocery list')}>
        <Empty icon="list-outline" title={t('No plan yet')} />
      </Screen>
    );

  const buy = plan.grocery.filter((g) => !g.have && !g.staple);
  const staples = plan.grocery.filter((g) => !g.have && g.staple);
  const have = plan.grocery.filter((g) => g.have);
  const aisles = [...new Set(buy.map((g) => g.aisle))];
  const buyTotal = buy.reduce((n, g) => n + g.cost, 0);
  const stapleTotal = staples.reduce((n, g) => n + g.cost, 0);

  return (
    <Screen stack title={t('Grocery list')} subtitle={t('{n} things to buy · about {amount}', { n: buy.length, amount: peso(buyTotal) })}>
      <Card style={{ marginTop: 8 }}>
        <Row label={t('To buy')} value={peso(buyTotal)} />
        <Row label={t('Staples used (oil, soy sauce…)')} value={peso(stapleTotal)} />
        <Row label={t('Expected total')} value={peso(plan.total)} bold />
        <Row label={t('Your budget')} value={peso(plan.budget)} />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <Button small icon="basket-outline" label={t('Add to my shopping list')} onPress={() => setDone(addToGroceries(buy))} />
          {done !== null && <Button small kind="ghost" label={t('Open Groceries')} onPress={() => router.navigate('/groceries')} />}
        </View>
        {done !== null && <Text style={styles.meta}>{t('Added {n} items to Groceries, grouped by aisle.', { n: done })}</Text>}
      </Card>

      <View style={{ marginTop: 12 }}>
        <Chips>
          <Chip icon="walk-outline" label={t('Palengke route')} active={route} onPress={() => setRoute(true)} />
          <Chip icon="grid-outline" label={t('By aisle')} active={!route} onPress={() => setRoute(false)} />
        </Chips>
      </View>

      {route && <TripTips total={buyTotal} />}

      {route
        ? byRoute(buy).map(({ section, lines }) => (
            <Section key={section} title={t(SECTION_LABEL[section])}>
              <Card>
                {lines.map((g) => (
                  <Line key={g.id} g={g} />
                ))}
              </Card>
            </Section>
          ))
        : aisles.map((a) => (
            <Section key={a} title={t(a)}>
              <Card>
                {buy
                  .filter((g) => g.aisle === a)
                  .map((g) => (
                    <Line key={g.id} g={g} />
                  ))}
              </Card>
            </Section>
          ))}

      {staples.length > 0 && (
        <Section title={t("Staples: buy only if you're out")}>
          <Card>
            {staples.map((g) => (
              <Line key={g.id} g={g} />
            ))}
          </Card>
        </Section>
      )}

      {have.length > 0 && (
        <Section title={t('You already have')}>
          <Text style={styles.meta}>{have.map((g) => g.name).join(', ')}</Text>
        </Section>
      )}
    </Screen>
  );
}

/** When to go and what cash to bring. */
function TripTips({ total }: { total: number }) {
  const { bring, cash } = cashFor(total);
  return (
    <Card style={{ marginTop: 12 }}>
      <View style={styles.tip}>
        <Icon name="time-outline" size={18} color={C.primaryText} />
        <Text style={styles.tipText}>{t('Go early, 5 to 8 AM: the fish is freshest and the meat is just cut. Dry goods first, fish last so it stays cold.')}</Text>
      </View>
      <View style={styles.tip}>
        <Icon name="cash-outline" size={18} color={C.primaryText} />
        <View style={{ flex: 1 }}>
          <Text style={styles.tipText}>{t('Bring about {amount} in cash, in small bills:', { amount: peso(bring) })}</Text>
          <Text style={styles.cash}>{cash.map((c) => `₱${c.value.toLocaleString('en-PH')} × ${c.count}`).join('   ')}</Text>
        </View>
      </View>
      <View style={styles.tip}>
        <Icon name="bag-handle-outline" size={18} color={C.primaryText} />
        <Text style={styles.tipText}>{t('Bring eco bags and a container for the fish. Ask your suki for a little discount.')}</Text>
      </View>
    </Card>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, bold && { fontWeight: '800', color: C.text }]}>{label}</Text>
      <Text style={[styles.rowValue, bold && { fontWeight: '800' }]}>{value}</Text>
    </View>
  );
}

function Line({ g }: { g: GroceryLine }) {
  return (
    <View style={styles.line}>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{g.name}</Text>
        <Text style={styles.meta} numberOfLines={1}>
          {t('For {dishes}', { dishes: g.for.join(', ') })}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={styles.qty}>{g.buy}</Text>
        <Text style={styles.meta}>{peso(g.cost)}</Text>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 14, color: C.muted },
  rowValue: { fontSize: 15, color: C.text, fontWeight: '600' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  name: { fontSize: 15, fontWeight: '600', color: C.text },
  qty: { fontSize: 14, fontWeight: '700', color: C.text },
  meta: { fontSize: 12, color: C.muted, marginTop: 2, lineHeight: 17 },
  tip: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 5 },
  tipText: { flex: 1, fontSize: 14, color: C.text, lineHeight: 20 },
  cash: { fontSize: 14, fontWeight: '700', color: C.text, marginTop: 4, lineHeight: 22 },
}));
