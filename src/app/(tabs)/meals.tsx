import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Empty, Icon, Note, Screen, Section } from '../../components/bits';
import { EnergyCard, PayNote, WeatherCard } from '../../components/MealExtras';
import { MarketCompare, PriceWatch, UseSoon } from '../../components/MealInsights';
import { holidayOn } from '../../lib/meals/phcalendar';
import { startBy } from '../../lib/meals/timing';
import { NutritionCard } from '../../components/NutritionCard';
import { dailyAverage } from '../../lib/meals/nutrition';
import { meetingLoad } from '../../lib/meals/context';
import { cookChore, prepChore } from '../../lib/meals/cooking';
import { MEAL_LABEL, peso } from '../../lib/meals/labels';
import { HEAVY_DAY, fromWhatYouHave, planLevel, portions, slotCost } from '../../lib/meals/planner';
import { REGIONS } from '../../lib/meals/prices';
import { RECIPE } from '../../lib/meals/recipes';
import { fmtDay, fmtMinutes } from '../../lib/time';
import { useNow } from '../../lib/hooks';
import { allBusy, useHome } from '../../store/useHome';
import { slotDate, useMeals } from '../../store/useMeals';
import { locale, t, tDay } from '../../i18n';
import { C, R, themed } from '../../theme';

export default function Meals() {
  const now = useNow();
  const profile = useMeals((s) => s.profile);
  const plan = useMeals((s) => s.plan);
  const book = useMeals((s) => s.book);
  const meta = useMeals((s) => s.meta);
  const loading = useMeals((s) => s.loading);
  const priceError = useMeals((s) => s.priceError);
  const linked = useMeals((s) => s.chores);
  const chores = useHome((s) => s.chores);
  const markets = useMeals((s) => s.markets);
  const cooked = useMeals((s) => s.cooked);
  const calendarBusy = useHome((s) => s.calendarBusy);
  const blocks = useHome((s) => s.blocks);
  const schedule = useHome((s) => s.settings.schedule);
  const { generate, loadPrices, linkChore } = useMeals.getState();

  // Refresh prices in the background when they're older than 12 hours.
  useEffect(() => {
    if (profile) loadPrices(profile.area, profile.shop).catch(() => {});
  }, [profile, loadPrices]);

  if (!profile) {
    return (
      <Screen title={t('Meals')} subtitle={t('A week of meals that fits your budget')}>
        <Card style={styles.hero}>
          <Icon name="restaurant" size={32} color={C.primaryText} />
          <Text style={styles.heroTitle}>{t('Plan a week of cooking in two minutes')}</Text>
          {[
            'Tell Gawain who you cook for, your kitchen, how you eat and your budget',
            "Get dishes for every meal, priced with this week's palengke and supermarket prices from Presyo",
            'One shopping list for the week, minus what you already have',
            'Add cooking to your chores so it fits around your meetings',
          ].map((b) => (
            <View key={b} style={styles.bullet}>
              <Icon name="checkmark-circle" size={18} color={C.primaryText} />
              <Text style={styles.bulletText}>{t(b)}</Text>
            </View>
          ))}
          <View style={{ marginTop: 14 }}>
            <Button icon="sparkles-outline" label={t('Start')} onPress={() => router.push('/meals/setup')} />
          </View>
        </Card>
      </Screen>
    );
  }

  if (!plan) {
    return (
      <Screen title={t('Meals')}>
        <Empty icon="restaurant-outline" title={t('No plan this week')} body={t('Make one from your saved answers, or change them first.')}>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
            <Button icon="sparkles-outline" label={t(loading ? 'Reading prices…' : 'Make my plan')} disabled={loading} onPress={() => generate()} />
            <Button kind="soft" label={t('Edit answers')} onPress={() => router.push('/meals/setup')} />
          </View>
        </Empty>
      </Screen>
    );
  }

  const level = planLevel(plan.total, plan.budget);
  const diff = plan.budget - plan.total;
  const levelText =
    level === 'over'
      ? t('{amount} over budget', { amount: peso(-diff) })
      : level === 'close'
        ? t('Just under budget ({amount} to spare)', { amount: peso(diff) })
        : t('{amount} under budget', { amount: peso(diff) });
  const levelColor = level === 'over' ? C.dangerText : level === 'close' ? C.warnText : C.primaryText;
  const pct = Math.min(100, (plan.total / Math.max(1, plan.budget)) * 100);

  // Group slots by date.
  const byDate = new Map<number, typeof plan.slots>();
  for (const s of plan.slots) {
    const d = slotDate(plan, s.day);
    byDate.set(d, [...(byDate.get(d) ?? []), s]);
  }
  const dates = [...byDate.keys()].sort((a, b) => a - b);
  // Meeting time each day, so busy days are visible next to their quick dishes.
  const busy = allBusy({ calendarBusy, blocks }, now, 8);
  const load = meetingLoad(busy, schedule, now);
  const busyNote = (d: number) => {
    const mins = load[new Date(d).getDay()] ?? 0;
    const h = holidayOn(d);
    return `${h ? ` · ${t(h.name)}` : ''}${mins >= HEAVY_DAY ? ` · ${t('{hours} h of meetings, quick dishes', { hours: Math.round(mins / 60) })}` : ''}`;
  };
  const fmtAt = (x: number) => new Date(x).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
  const n = portions(profile);
  const region = REGIONS.find((r) => r.code === profile.area)?.name ?? '';
  const pending = plan.slots.filter((s) => s.cook && !(linked[s.key] && chores.some((c) => c.id === linked[s.key])));

  const addAllChores = () => {
    const { saveChore } = useHome.getState();
    for (const s of pending) {
      const r = RECIPE[s.recipeId];
      const date = slotDate(plan, s.day);
      linkChore(s.key, saveChore(cookChore(r, date, s.by)));
      const prep = prepChore(r, date);
      if (prep) saveChore(prep);
    }
  };

  return (
    <Screen
      title={t('Meals')}
      subtitle={`${t(profile.adults + profile.kids === 1 ? '{meals} meals for 1 person' : '{meals} meals for {people} people', { meals: plan.slots.length, people: profile.adults + profile.kids })} · ${region}`}
      right={
        <Pressable onPress={() => router.push('/meals/setup')} hitSlop={10} accessibilityLabel={t('Edit answers')}>
          <Icon name="options-outline" size={24} color={C.primaryText} />
        </Pressable>
      }
    >
      <Card style={{ marginTop: 8 }}>
        <View style={styles.budgetTop}>
          <View>
            <Text style={styles.kicker}>{t('EXPECTED GROCERIES')}</Text>
            <Text style={styles.total}>{peso(plan.total)}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.kicker}>{t('YOUR BUDGET')}</Text>
            <Text style={styles.budget}>{peso(plan.budget)}</Text>
          </View>
        </View>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${pct}%`, backgroundColor: level === 'over' ? C.danger : level === 'close' ? C.accent : C.primary }]} />
        </View>
        <Text style={[styles.levelText, { color: levelColor }]}>{levelText}</Text>
        <PayNote plan={plan} profile={profile} />
        <Text style={styles.meta}>
          {t('{amount} a plate', { amount: peso(plan.total / Math.max(1, plan.slots.length * (profile.adults + profile.kids))) })} ·{' '}
          {meta ? t('{pct}% priced from government data', { pct: Math.round(meta.coverage * 100) }) : t('estimated prices')}
        </Text>
        <View style={styles.actions}>
          <Button small icon="list-outline" label={t('Grocery list')} onPress={() => router.push('/meals/list')} />
          <Button small kind="soft" icon="shuffle-outline" label={t('Shuffle')} disabled={loading} onPress={() => generate()} />
          <Button small kind="soft" icon="checkbox-outline" label={pending.length ? t('Add {n} to chores', { n: pending.length }) : t('In chores')} disabled={!pending.length} onPress={addAllChores} />
          <Button small kind="soft" icon="people-outline" label={t('Who paid')} onPress={() => router.push('/meals/split')} />
          <Button small kind="soft" icon="sparkles-outline" label={t('Handaan')} onPress={() => router.push('/meals/party')} />
        </View>
      </Card>
      {priceError && <Note icon="cloud-offline-outline">{priceError}</Note>}
      <WeatherCard />
      <UseSoon plan={plan} />
      {book && <PriceWatch plan={plan} book={book} />}
      {profile.area === '130000000' && <MarketCompare plan={plan} markets={markets} date={meta?.marketDate ?? null} />}

      <EnergyCard plan={plan} profile={profile} />

      <Section title={t('Per person, per day')}>
        <NutritionCard
          n={dailyAverage(plan)}
          salty={2000}
          note={`${t(profile.meals.length === 1 ? "An adult's average day from this plan's 1 meal, rice included" : "An adult's average day from this plan's {n} meals, rice included", { n: profile.meals.length })}${profile.meals.length < 3 ? t("; meals you don't plan come on top") : ''}. ${t('Approximate, from standard food composition values.')}`}
        />
      </Section>

      {dates.map((d) => (
        <Section key={d} title={`${new Date(d).toLocaleDateString(locale(), { weekday: 'long', month: 'short', day: 'numeric' })} · ${tDay(fmtDay(d, now))}${busyNote(d)}`}>
          {byDate.get(d)!.map((s) => {
            const r = RECIPE[s.recipeId];
            const cook = !s.cook ? plan.slots.find((x) => x.key === s.linked[0]) : null;
            const cost = s.cook && book ? slotCost(s, book) : 0;
            const when = s.cook ? startBy(r.minutes, slotDate(plan, s.day), s.meal, profile.mealTimes, busy, !!r.rice) : null;
            const src = s.uses ? plan.slots.find((x) => x.key === s.uses) : null;
            const chain = src
              ? t("from {day}'s {dish}", { day: new Date(slotDate(plan, src.day)).toLocaleDateString(locale(), { weekday: 'short' }), dish: RECIPE[src.recipeId].name })
              : s.feeds
                ? t("cooks extra for tomorrow's {dish}", { dish: RECIPE[plan.slots.find((x) => x.key === s.feeds)?.recipeId ?? '']?.name ?? '' })
                : '';
            const inChores = !!linked[s.key] && chores.some((c) => c.id === linked[s.key]);
            const done = cooked.includes(s.key);
            const extras = [
              when && when.start > now ? t('start {time}', { time: fmtAt(when.start) }) : '',
              s.by ? t('{name} cooks', { name: s.by }) : '',
              s.baon ? `+${s.baon} baon` : '',
              chain,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <Pressable key={s.key} onPress={() => router.push({ pathname: '/meals/dish', params: { key: s.key } })} style={({ pressed }) => [styles.slot, pressed && { opacity: 0.8 }]}>
                <Text style={styles.mealLabel}>{t(MEAL_LABEL[s.meal])}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dish} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {cook
                      ? t('Leftovers from {day} {meal}', {
                          day: new Date(slotDate(plan, cook.day)).toLocaleDateString(locale(), { weekday: 'short' }),
                          meal: t(MEAL_LABEL[cook.meal]).toLowerCase(),
                        })
                      : `${fmtMinutes(r.minutes)} · ${peso(cost)}${extras ? ` · ${extras}` : ''}${s.cook && s.linked.length ? ` · ${t('cooks extra for tomorrow')}` : ''}${s.sides.length ? ` · + ${s.sides.map((x) => RECIPE[x]?.name).join(', ')}` : ''}`}
                  </Text>
                </View>
                {done ? <Icon name="checkmark-done" size={18} color={C.primaryText} /> : inChores && <Icon name="checkbox" size={18} color={C.primaryText} />}
                <Icon name="chevron-forward" size={18} color={C.muted} />
              </Pressable>
            );
          })}
        </Section>
      ))}

      <HaveSection />
      <Text style={[styles.meta, { marginTop: 18 }]}>
        {t('Prices:')} {meta?.daDate ? `${t('DA Metro Manila markets {date}', { date: meta.daDate })}, ` : ''}
        {meta?.psaPeriod ? `${t('PSA {region} retail {period}', { region, period: meta.psaPeriod })}, ` : ''}
        {meta?.srpDate ? `DTI SRP ${meta.srpDate}. ` : ''}
        {t('{pct}% of ingredients use estimates. {n} portions per meal.', { pct: Math.round((1 - (meta?.coverage ?? 0)) * 100), n })}
      </Text>
    </Screen>
  );
}

function HaveSection() {
  const profile = useMeals((s) => s.profile)!;
  const top = fromWhatYouHave(profile, 4).filter((x) => x.share >= 0.4);
  if (!top.length) return null;
  return (
    <Section title={t('Make it with what you have')}>
      {top.map(({ recipe, share, missing }) => (
        <Pressable key={recipe.id} onPress={() => router.push({ pathname: '/meals/dish', params: { id: recipe.id } })} style={styles.slot}>
          <View style={{ flex: 1 }}>
            <Text style={styles.dish}>{recipe.name}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {t('You have {pct}%', { pct: Math.round(share * 100) })}
              {missing.length ? `. ${t('Missing {n}', { n: missing.length })}` : ''}
            </Text>
          </View>
          <Icon name="chevron-forward" size={18} color={C.muted} />
        </Pressable>
      ))}
    </Section>
  );
}

const styles = themed(() => ({
  hero: { marginTop: 12, backgroundColor: C.primarySoft, borderColor: 'transparent', padding: 18, gap: 10 },
  heroTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  bullet: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  bulletText: { flex: 1, fontSize: 15, color: C.text, lineHeight: 21 },
  budgetTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  kicker: { fontSize: 11, fontWeight: '800', color: C.muted, letterSpacing: 0.8 },
  total: { fontSize: 30, fontWeight: '800', color: C.text },
  budget: { fontSize: 20, fontWeight: '700', color: C.muted },
  bar: { height: 10, backgroundColor: C.surface, borderRadius: R.pill, marginTop: 10, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: R.pill },
  levelText: { fontSize: 15, fontWeight: '700', marginTop: 8 },
  meta: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  slot: {
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
  mealLabel: { width: 84, fontSize: 11, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  dish: { fontSize: 16, fontWeight: '600', color: C.text },
}));
