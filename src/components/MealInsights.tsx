import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { INGREDIENT } from '../lib/meals/ingredients';
import { goingOff } from '../lib/meals/kitchen';
import { peso } from '../lib/meals/labels';
import { Plan } from '../lib/meals/planner';
import { Market, PriceBook, compareMarkets } from '../lib/meals/prices';
import { RECIPE } from '../lib/meals/recipes';
import { useNow } from '../lib/hooks';
import { useMeals } from '../store/useMeals';
import { t, tDay } from '../i18n';
import { C, R, themed } from '../theme';
import { Card, Icon, Section } from './bits';

const MOVE = 0.05;

/** Ingredients in this week's shopping whose price moved more than 5% in the last month. */
export function PriceWatch({ plan, book }: { plan: Plan; book: PriceBook }) {
  const moves = plan.grocery
    // Only things that matter to the bill: a 70% jump on 10 g of chili isn't worth a swap.
    .filter((g) => !g.have && !g.staple && g.cost >= 20 && Math.abs(book[g.id]?.change ?? 0) >= MOVE)
    .map((g) => ({ g, ch: book[g.id].change! }))
    .sort((a, b) => Math.abs(b.ch) - Math.abs(a.ch))
    .slice(0, 5);
  if (!moves.length) return null;
  return (
    <Section title={t('Price watch')}>
      <Card>
        {moves.map(({ g, ch }) => {
          const up = ch > 0;
          // The dish that leans on it most is the one worth swapping.
          const slot = up ? plan.slots.find((s) => s.cook && RECIPE[s.recipeId].ingredients.some((l) => l.id === g.id)) : undefined;
          return (
            <View key={g.id} style={styles.row}>
              <Icon name={up ? 'trending-up' : 'trending-down'} size={18} color={up ? C.dangerText : C.primaryText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {g.name}{' '}
                  <Text style={{ color: up ? C.dangerText : C.primaryText }}>
                    {t('{sign}{pct}% this month', { sign: up ? '+' : '−', pct: Math.round(Math.abs(ch) * 100) })}
                  </Text>
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {up ? t('In {dishes}', { dishes: g.for.join(', ') }) : `${t('Good week for it')} · ${g.for.join(', ')}`}
                </Text>
              </View>
              {slot && (
                <Pressable onPress={() => router.push({ pathname: '/meals/dish', params: { key: slot.key } })} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.link}>{t('Swap')}</Text>
                </Pressable>
              )}
            </View>
          );
        })}
        <Text style={styles.foot}>{t('Compared with about a month ago, from DA and PSA prices.')}</Text>
      </Card>
    </Section>
  );
}

/** Which Metro Manila markets would sell this week's market-priced shopping cheapest. */
export function MarketCompare({ plan, markets, date }: { plan: Plan; markets: Market[]; date: string | null }) {
  if (markets.length < 2) return null;
  const r = compareMarkets(
    plan.grocery.filter((g) => !g.have && !g.staple).map((g) => ({ id: g.id, need: g.need })),
    markets,
  );
  if (r.markets.length < 2 || r.covered.length < 3) return null;
  const costs = r.markets.map((m) => m.cost).sort((a, b) => a - b);
  const mid = costs[costs.length >> 1];
  const top = r.markets.slice(0, 3);
  const dear = r.markets[r.markets.length - 1];
  return (
    <Section title={t('Cheapest markets for your list')}>
      <Card>
        {top.map((m, i) => (
          <View key={m.id} style={styles.row}>
            <Text style={styles.rank}>{i + 1}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {m.name}
              </Text>
              <Text style={styles.meta}>{t('{amount} less than a typical market', { amount: peso(mid - m.cost) })}</Text>
            </View>
            <Text style={styles.cost}>{peso(m.cost)}</Text>
          </View>
        ))}
        <Text style={styles.foot}>
          {t('For the {n} items DA prices at each market ({items}). Dearest: {market}, {amount}.', {
            n: r.covered.length,
            items: r.covered.map((id) => INGREDIENT[id]?.name.toLowerCase()).join(', '),
            market: dear.name,
            amount: peso(dear.cost),
          })}
          {date ? ` ${t('Prices from {date}.', { date })}` : ''}
        </Text>
      </Card>
    </Section>
  );
}

/** Plan shopping that will go off soon, and whether this week's plan uses it. */
export function UseSoon({ plan }: { plan: Plan }) {
  const stock = useMeals((s) => s.stock);
  const now = useNow();
  const soon = goingOff(stock, now, 2);
  const ids = Object.keys(soon);
  if (!ids.length) return null;
  const when = (d: number) => tDay(d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
  return (
    <Section title={t('Use soon')}>
      <Card>
        {ids.map((id) => {
          const slot = plan.slots.find((s) => s.cook && RECIPE[s.recipeId].ingredients.some((l) => l.id === id));
          return (
            <View key={id} style={styles.row}>
              <Icon name="time-outline" size={18} color={C.warnText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>
                  {INGREDIENT[id]?.name} <Text style={{ color: C.warnText }}>· {t('use {when}', { when: when(soon[id]) })}</Text>
                </Text>
                <Text style={styles.meta}>{slot ? t('Planned in {dish}', { dish: RECIPE[slot.recipeId].name }) : t('Not in this plan. Shuffle to fit it in.')}</Text>
              </View>
            </View>
          );
        })}
      </Card>
    </Section>
  );
}

const styles = themed(() => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  name: { fontSize: 15, fontWeight: '600', color: C.text },
  meta: { fontSize: 12, color: C.muted, marginTop: 1 },
  link: { color: C.primaryText, fontWeight: '700', fontSize: 14 },
  rank: { width: 24, height: 24, borderRadius: R.pill, backgroundColor: C.primarySoft, color: C.primaryText, textAlign: 'center', lineHeight: 24, fontWeight: '800', overflow: 'hidden' },
  cost: { fontSize: 15, fontWeight: '800', color: C.text },
  foot: { fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 17 },
}));
