import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Icon, Screen, Section } from '../../components/bits';
import { NutritionCard } from '../../components/NutritionCard';
import { slotPortion } from '../../lib/meals/nutrition';
import { cookChore, prepChore, stepMinutes } from '../../lib/meals/cooking';
import { INGREDIENT } from '../../lib/meals/ingredients';
import { MEAL_LABEL, peso } from '../../lib/meals/labels';
import { ratesOf } from '../../components/MealExtras';
import { energyOf, pesos } from '../../lib/meals/energy';
import { alternatives, costOf, linesFor, portions, sidesFor, slotCost } from '../../lib/meals/planner';
import { startBy } from '../../lib/meals/timing';
import { priceBook } from '../../lib/meals/prices';
import { RECIPE } from '../../lib/meals/recipes';
import { useNow } from '../../lib/hooks';
import { fmtMinutes } from '../../lib/time';
import { allBusy, useHome } from '../../store/useHome';
import { slotDate, useMeals } from '../../store/useMeals';
import { locale, t } from '../../i18n';
import { C, R, themed } from '../../theme';

function amount(qty: number, unit: string): string {
  if (unit === 'pc') return qty < 1 ? '½' : `${Math.round(qty * 2) / 2}`;
  if (qty >= 1000) return `${Math.round(qty / 100) / 10} ${unit === 'g' ? 'kg' : 'L'}`;
  if (qty < 10) return `${Math.round(qty * 2) / 2} ${unit}`;
  return `${Math.round(qty / 5) * 5} ${unit}`;
}

/** A dish: by plan slot (`key`), or on its own (`id`) from "Make it with what you have". */
export default function Dish() {
  const { key, id } = useLocalSearchParams<{ key?: string; id?: string }>();
  const profile = useMeals((s) => s.profile);
  const plan = useMeals((s) => s.plan);
  const stored = useMeals((s) => s.book);
  const linked = useMeals((s) => s.chores);
  const cookedKeys = useMeals((s) => s.cooked);
  const chores = useHome((s) => s.chores);
  const { swap, toggleSide, linkChore, markCooked } = useMeals.getState();
  const startTimer = useHome((s) => s.startTimer);
  const schedulePlug = useHome((s) => s.schedulePlug);
  const ricePlug = useHome((s) => s.settings.announce.ricePlug);
  const timers = useHome((s) => s.timers);
  const calendarBusy = useHome((s) => s.calendarBusy);
  const blocks = useHome((s) => s.blocks);
  const meta = useMeals((s) => s.meta);
  const now = useNow();

  const slot = plan?.slots.find((s) => s.key === key) ?? null;
  const cookSlot = slot && !slot.cook ? (plan!.slots.find((s) => s.key === slot.linked[0]) ?? null) : slot;
  const recipe = RECIPE[slot?.recipeId ?? id ?? ''];
  if (!recipe || !profile) return <Screen stack title={t('Dish')}>{null}</Screen>;

  const book = stored ?? priceBook(null, profile.shop);
  const have = new Set(profile.have);
  const n = cookSlot?.portions ?? portions(profile);
  const lines = linesFor(recipe, n);
  const cost = cookSlot ? slotCost({ ...cookSlot, sides: [] }, book, have) : costOf(recipe, n, book, have);
  const leftIds = new Set(cookSlot?.uses ? recipe.ingredients.filter((l) => l.left).map((l) => l.id) : []);
  const from = cookSlot?.uses ? plan?.slots.find((s) => s.key === cookSlot.uses) : null;
  const energy = pesos(energyOf(recipe, profile.equipment), ratesOf(meta));
  const when = slot?.cook && plan ? startBy(recipe.minutes, slotDate(plan, slot.day), slot.meal, profile.mealTimes, allBusy({ calendarBusy, blocks }, now, 8), !!recipe.rice) : null;
  const fmtAt = (x: number) => new Date(x).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' });
  const riceLabel = t('Rice cooker on: {dish}', { dish: recipe.name });
  const riceSet = !!ricePlug && timers.some((x) => x.plug === ricePlug && x.label === riceLabel);
  const date = cookSlot && plan ? slotDate(plan, cookSlot.day) : now;
  const sides = sidesFor(profile, recipe);
  const alts = cookSlot ? alternatives(profile, book, cookSlot.meal, recipe.id, 5, { portions: n, keeps: cookSlot.linked.length > 0 || !!cookSlot.baon }) : [];
  const isCooked = !!cookSlot && cookedKeys.includes(cookSlot.key);
  const choreId = cookSlot ? linked[cookSlot.key] : undefined;
  const inChores = !!choreId && chores.some((c) => c.id === choreId);
  const people = profile.adults + profile.kids;

  const addChore = () => {
    const { saveChore } = useHome.getState();
    const cid = saveChore(cookChore(recipe, date, cookSlot?.by));
    if (cookSlot) linkChore(cookSlot.key, cid);
    const prep = prepChore(recipe, date);
    if (prep) saveChore(prep);
  };

  return (
    <Screen stack title={recipe.name} subtitle={recipe.blurb}>
      <View style={styles.chips}>
        <Fact icon="time-outline" text={fmtMinutes(recipe.minutes)} />
        <Fact icon="people-outline" text={t('{n} portions', { n: Math.round(n * 10) / 10 })} />
        <Fact icon="cash-outline" text={`${peso(cost)} · ${t('{amount} a plate', { amount: peso(cost / Math.max(1, n)) })}`} />
        {recipe.keeps >= 2 && <Fact icon="snow-outline" text={t('Keeps {n} days', { n: recipe.keeps })} />}
        {energy >= 1 && <Fact icon="flame-outline" text={t('{amount} gas and power', { amount: peso(energy) })} />}
      </View>

      {slot && (
        <Card style={{ marginTop: 12 }}>
          <Text style={styles.cardTitle}>
            {t(MEAL_LABEL[slot.meal])}, {new Date(slotDate(plan!, slot.day)).toLocaleDateString(locale(), { weekday: 'long' })}
          </Text>
          <Text style={styles.meta}>
            {!slot.cook
              ? t('Leftovers: cooked on {day}, nothing to cook today.', { day: new Date(date).toLocaleDateString(locale(), { weekday: 'long' }) })
              : slot.linked.length
                ? t("Makes {people} people's {meal} plus tomorrow's lunch.", { people, meal: t(MEAL_LABEL[slot.meal]).toLowerCase() })
                : t('Serves {who}.', { who: whoEats(profile.adults, profile.kids) })}
            {slot.cook && slot.baon ? ` ${t('Pack {n} baon from it for tomorrow.', { n: slot.baon })}` : ''}
            {slot.cook && slot.by ? ` ${t("{name}'s turn to cook.", { name: slot.by })}` : ''}
            {from ? ` ${t("Uses the leftovers of {dish}, cooked bigger the day before.", { dish: RECIPE[from.recipeId].name })}` : ''}
            {slot.cook && slot.feeds ? ` ${t("Cook extra: tomorrow's {dish} uses it.", { dish: RECIPE[plan!.slots.find((x) => x.key === slot.feeds)?.recipeId ?? '']?.name ?? '' })}` : ''}
          </Text>
          {when && (
            <Text style={styles.when}>
              {t('Start by {start} to eat at {eat}.', { start: fmtAt(when.start), eat: fmtAt(when.eat) })}
              {when.around?.how === 'after' ? ` ${t('After {meeting}; ready about {ready}.', { meeting: when.around.title || t('your meeting'), ready: fmtAt(when.ready) })}` : ''}
              {when.around?.how === 'before' ? ` ${t('Done before {meeting}; reheat to serve.', { meeting: when.around.title || t('your meeting') })}` : ''}
              {when.riceAt ? ` ${t('Rice on at {time}.', { time: fmtAt(when.riceAt) })}` : ''}
            </Text>
          )}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {slot.cook && (
              <Button small icon="play-outline" label={t('Cook mode')} onPress={() => router.push({ pathname: '/meals/cook', params: { id: recipe.id, key: slot.key } })} />
            )}
            {slot.cook && ricePlug && when?.riceAt && when.riceAt > now && (
              <Button
                small
                kind={riceSet ? 'ghost' : 'soft'}
                icon="power-outline"
                label={riceSet ? t('Rice cooker set for {time}', { time: fmtAt(when.riceAt) }) : t('Rice cooker on at {time}', { time: fmtAt(when.riceAt) })}
                disabled={riceSet}
                onPress={() => schedulePlug(riceLabel, when.riceAt!, ricePlug)}
              />
            )}
            {slot.cook && (
              <Button
                small
                kind={isCooked ? 'ghost' : 'soft'}
                icon={isCooked ? 'checkmark-done' : 'restaurant-outline'}
                label={t(isCooked ? 'Cooked' : 'Mark cooked')}
                disabled={isCooked}
                onPress={() => markCooked(slot.key)}
              />
            )}
            {inChores ? (
              <View style={styles.done}>
                <Icon name="checkbox" size={18} color={C.primaryText} />
                <Text style={styles.doneText}>{t('In your chores for {day}', { day: new Date(date).toLocaleDateString(locale(), { weekday: 'long' }) })}</Text>
              </View>
            ) : (
              <Button small icon="checkbox-outline" label={t('Add "Cook" to chores ({time})', { time: fmtMinutes(recipe.minutes) })} onPress={addChore} />
            )}
          </View>
        </Card>
      )}
      {!slot && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          <Button small icon="checkbox-outline" label={t('Cook today: add to chores ({time})', { time: fmtMinutes(recipe.minutes) })} onPress={addChore} />
          <Button small kind="soft" icon="play-outline" label={t('Cook mode')} onPress={() => router.push({ pathname: '/meals/cook', params: { id: recipe.id } })} />
        </View>
      )}

      <Section title={t('Ingredients')}>
        <Card>
          {lines.map((l) => {
            const ing = INGREDIENT[l.id];
            const owned = have.has(l.id);
            return (
              <View key={l.id} style={styles.ingRow}>
                <Icon name={owned ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={owned ? C.primaryText : C.line} />
                <Text style={[styles.ingName, ing?.staple && { color: C.muted }]}>{ing?.name ?? l.id}</Text>
                <Text style={styles.ingQty}>{amount(l.qty, ing?.unit ?? 'g')}</Text>
                <Text style={styles.ingCost}>{leftIds.has(l.id) ? t('leftover') : owned ? t('have') : peso(l.qty * (book[l.id]?.perUnit ?? 0))}</Text>
              </View>
            );
          })}
        </Card>
      </Section>

      <Section title={t('Nutrition per adult portion')}>
        <NutritionCard
          n={slotPortion(recipe.id, cookSlot?.sides ?? [])}
          note={`${t(recipe.rice ? 'With its cup of rice' : 'As served')}${cookSlot?.sides.length ? t(' and sides') : ''}. ${t('Approximate, from standard food composition values.')} ${t("Kids' portions are about ⅗ of this.")}`}
        />
      </Section>

      <Section title={t('Steps')}>
        {recipe.steps.map((s, i) => {
          const mins = stepMinutes(s);
          return (
            <View key={i} style={styles.stepRow}>
              <Text style={styles.stepNum}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepText}>{s}</Text>
                {mins && (
                  <Pressable
                    onPress={() => startTimer(`${recipe.name} (${t('step {n}', { n: i + 1 })})`, 'flame-outline', mins)}
                    style={styles.timerBtn}
                    accessibilityRole="button"
                    accessibilityLabel={t('Start a {n}-minute timer', { n: mins })}
                  >
                    <Icon name="timer-outline" size={15} color={C.primaryText} />
                    <Text style={styles.timerText}>{t('Start {time} timer', { time: fmtMinutes(mins) })}</Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        })}
        <Text style={styles.meta}>{t('Timers show on Today and remind you after a meeting if they finish during one.')}</Text>
      </Section>

      {sides.length > 0 && (
        <Section title={t('Goes well with')}>
          {sides.map((side) => {
            const on = !!slot?.sides.includes(side.id);
            return (
              <Pressable key={side.id} onPress={() => cookSlot && toggleSide(cookSlot.key, side.id)} disabled={!cookSlot} style={[styles.alt, on && styles.altOn]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.altName}>{side.name}</Text>
                  <Text style={styles.meta}>
                    {side.blurb} {fmtMinutes(side.minutes)} · {peso(costOf(side, n, book, have))}
                  </Text>
                </View>
                {cookSlot && <Icon name={on ? 'checkmark-circle' : 'add-circle-outline'} size={22} color={C.primaryText} />}
              </Pressable>
            );
          })}
        </Section>
      )}

      {alts.length > 0 && (
        <Section title={t('Swap for something else')}>
          {alts.map(({ recipe: r, cost: c }) => {
            const delta = c - cost;
            return (
              <Pressable key={r.id} onPress={() => slot && swap(slot.key, r.id)} style={styles.alt}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.altName}>{r.name}</Text>
                  <Text style={styles.meta}>
                    {fmtMinutes(r.minutes)} · {peso(c)} ({delta <= 0 ? t('{amount} less', { amount: peso(-delta) }) : t('{amount} more', { amount: peso(delta) })})
                  </Text>
                </View>
                <Icon name="swap-horizontal" size={20} color={C.primaryText} />
              </Pressable>
            );
          })}
        </Section>
      )}
    </Screen>
  );
}

/** "2 adults and 1 kid". */
function whoEats(adults: number, kids: number): string {
  const a = t(adults === 1 ? '1 adult' : '{n} adults', { n: adults });
  if (!kids) return a;
  return t('{a} and {b}', { a, b: t(kids === 1 ? '1 kid' : '{n} kids', { n: kids }) });
}

function Fact({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.fact}>
      <Icon name={icon} size={15} color={C.primaryText} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

const styles = themed(() => ({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.primarySoft, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 6 },
  factText: { fontSize: 13, color: C.primaryText, fontWeight: '600' },
  cardTitle: { fontSize: 16, fontWeight: '700', color: C.text },
  when: { fontSize: 13, color: C.primaryText, fontWeight: '600', marginTop: 6, lineHeight: 18 },
  meta: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  done: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  doneText: { color: C.primaryText, fontWeight: '600', fontSize: 14 },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.line },
  ingName: { flex: 1, fontSize: 15, color: C.text },
  ingQty: { fontSize: 14, color: C.text, fontWeight: '600' },
  ingCost: { width: 56, textAlign: 'right', fontSize: 13, color: C.muted },
  stepRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  stepNum: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.primary, color: C.onColor, textAlign: 'center', lineHeight: 26, fontWeight: '700', overflow: 'hidden' },
  stepText: { fontSize: 15, color: C.text, lineHeight: 22 },
  timerBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: R.pill, backgroundColor: C.primarySoft },
  timerText: { fontSize: 13, color: C.primaryText, fontWeight: '700' },
  alt: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 12, marginBottom: 8 },
  altOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  altName: { fontSize: 16, fontWeight: '600', color: C.text },
}));
