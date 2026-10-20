import { router } from 'expo-router';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, Chips, Icon, Note, Screen, Section, TimeField, back } from '../../components/bits';
import { INGREDIENT, matchIngredient } from '../../lib/meals/ingredients';
import {
  ALLERGIES,
  BUDGET_LEVEL,
  COMMON_HAVES,
  CUISINES,
  DISLIKES,
  EQUIPMENT,
  GOALS,
  MEALS,
  RESTRICTIONS,
  SHOPS,
  VIBES,
  peso,
} from '../../lib/meals/labels';
import { Profile, budgetGuide, eligible, portions, servingsPerWeek } from '../../lib/meals/planner';
import { REGIONS, priceBook } from '../../lib/meals/prices';
import { MEAL_TIMES } from '../../lib/meals/timing';
import { Clock, weekdayName } from '../../lib/time';
import { useHome } from '../../store/useHome';
import { DEFAULT_PROFILE, useMeals } from '../../store/useMeals';
import { t } from '../../i18n';
import { C, MAX_WIDTH, R, themed } from '../../theme';

const PAYDAYS: { label: string; days: number[] }[] = [
  { label: '15th and 30th', days: [15, 30] },
  { label: 'Every 30th', days: [30] },
  { label: '10th and 25th', days: [10, 25] },
  { label: "Don't follow paydays", days: [] },
];

const WEEK = [1, 2, 3, 4, 5, 6, 0];
const STEPS = ['Where you shop', 'Household', 'Meals and days', 'Your kitchen', 'How you eat', 'Your vibe', 'Allergies', 'Dislikes', 'Already have', 'Budget'];

function toggle<T>(list: T[], x: T): T[] {
  return list.includes(x) ? list.filter((y) => y !== x) : [...list, x];
}

export default function MealSetup() {
  const insets = useSafeAreaInsets();
  const saved = useMeals((s) => s.profile);
  const book = useMeals((s) => s.book);
  const loading = useMeals((s) => s.loading);
  const { saveProfile, loadPrices, generate } = useMeals.getState();
  const pantry = useHome((s) => s.items);
  const [step, setStep] = useState(0);
  const [p, setP] = useState<Profile>(() => {
    if (saved) return saved;
    // Start "what you have" from pantry items marked Plenty that we recognise.
    const have = pantry.filter((i) => i.tracked && i.level === 'full').map((i) => matchIngredient(i.name)?.id).filter((x): x is string => !!x);
    return { ...DEFAULT_PROFILE, have: [...new Set(have)] };
  });
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));

  // Prices for the budget step: start loading as soon as region and shop are known.
  useEffect(() => {
    loadPrices(p.area, p.shop).catch(() => {});
  }, [p.area, p.shop, loadPrices]);

  const last = step === STEPS.length - 1;
  const canNext = [true, p.adults + p.kids > 0, p.meals.length > 0 && p.days.length > 0, true, true, true, true, true, true, p.budget > 0][step];
  const options = useMemo(() => eligible(p).filter((r) => !r.side).length, [p]);

  const finish = async () => {
    saveProfile(p);
    await generate();
    router.replace('/meals');
  };

  return (
    <Screen
      stack
      title={t(STEPS[step])}
      subtitle={t('Step {n} of {total}', { n: step + 1, total: STEPS.length })}
      footer={
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.footerRow}>
            <Button kind="ghost" label={t(step ? 'Back' : 'Cancel')} onPress={() => (step ? setStep(step - 1) : back())} />
            <View style={{ flex: 1 }} />
            {last ? (
              <Button icon="sparkles-outline" label={t(loading ? 'Reading prices…' : 'Make my plan')} disabled={!canNext || loading} onPress={finish} />
            ) : (
              <Button label={t('Next')} icon="arrow-forward" disabled={!canNext} onPress={() => setStep(step + 1)} />
            )}
          </View>
        </View>
      }
    >
      <View style={styles.progress}>
        <View style={[styles.progressFill, { width: `${((step + 1) / STEPS.length) * 100}%` }]} />
      </View>

      {step === 0 && (
        <>
          <Section title={t('Where do you shop?')}>
            {SHOPS.map((s) => (
              <Option key={s.key} icon={s.icon} label={t(s.label)} hint={t(s.hint)} active={p.shop === s.key} onPress={() => set({ shop: s.key })} />
            ))}
          </Section>
          <Section title={t('Your region (for prices)')}>
            <Chips>
              {REGIONS.map((r) => (
                <Chip key={r.code} label={r.name} active={p.area === r.code} onPress={() => set({ area: r.code })} />
              ))}
            </Chips>
            <Text style={styles.help}>{t("Prices come from Presyo: the PSA's monthly retail prices for your region, the DA's daily Metro Manila market prices, and DTI suggested retail prices.")}</Text>
          </Section>
        </>
      )}

      {step === 1 && (
        <Section title={t('Who are you cooking for?')}>
          <Stepper label={t('Adults')} hint={t('13 and up')} value={p.adults} onChange={(adults) => set({ adults })} />
          <Stepper label={t('Kids')} hint={t('Under 13, about ⅗ of an adult portion')} value={p.kids} onChange={(kids) => set({ kids })} />
          <Stepper label={t('Baon')} hint={t('Packed lunches for school or work, cooked with the night before\'s dinner')} value={p.baon ?? 0} onChange={(baon) => set({ baon })} />
          <Cooks cooks={p.cooks ?? []} onChange={(cooks) => set({ cooks })} />
        </Section>
      )}

      {step === 2 && (
        <>
          <Section title={t('Which meals do you cook?')}>
            <Chips>
              {MEALS.map((m) => (
                <Chip key={m.key} icon={m.icon} label={t(m.label)} active={p.meals.includes(m.key)} onPress={() => set({ meals: toggle(p.meals, m.key) })} />
              ))}
            </Chips>
          </Section>
          <Section title={t('Which days do you cook?')}>
            <Chips>
              {WEEK.map((d) => (
                <Chip key={d} label={t(weekdayName(d))} active={p.days.includes(d)} onPress={() => set({ days: toggle(p.days, d) })} />
              ))}
            </Chips>
            <Text style={styles.help}>{t("Weekday lunches get quick dishes, since you're working.")}</Text>
          </Section>
          <Section title={t('When do you eat?')}>
            {MEALS.filter((m) => p.meals.includes(m.key)).map((m) => (
              <TimeField
                key={m.key}
                label={t(m.label)}
                value={(p.mealTimes?.[m.key] ?? MEAL_TIMES[m.key]) as Clock}
                onChange={(c) => set({ mealTimes: { ...p.mealTimes, [m.key]: c } })}
              />
            ))}
            <Text style={styles.help}>{t('Gawain tells you when to start cooking, working around your meetings.')}</Text>
          </Section>
        </>
      )}

      {step === 3 && (
        <Section title={t('What\'s in your kitchen?')}>
          <Chips>
            {EQUIPMENT.map((e) => (
              <Chip key={e.key} icon={e.icon} label={t(e.label)} active={p.equipment.includes(e.key)} onPress={() => set({ equipment: toggle(p.equipment, e.key) })} />
            ))}
          </Chips>
          <Text style={styles.help}>{t("Dishes that need something you don't have are left out. Air fryer, oven and grill can often stand in for each other.")}</Text>
        </Section>
      )}

      {step === 4 && (
        <>
          <Section title={t('Any restrictions?')}>
            <Chips>
              <Chip label={t('No restrictions')} active={!p.diets.some((d) => RESTRICTIONS.some((r) => r.key === d))} onPress={() => set({ diets: p.diets.filter((d) => !RESTRICTIONS.some((r) => r.key === d)) })} />
              {RESTRICTIONS.map((r) => (
                <Chip key={r.key} label={t(r.label)} active={p.diets.includes(r.key)} onPress={() => set({ diets: toggle(p.diets, r.key) })} />
              ))}
            </Chips>
          </Section>
          <Section title={t('Goals')}>
            {GOALS.map((g) => (
              <Option key={g.key} label={t(g.label)} hint={t(g.hint)} active={p.diets.includes(g.key)} onPress={() => set({ diets: toggle(p.diets, g.key) })} />
            ))}
          </Section>
          <Option
            icon="fish-outline"
            label={t('Meatless Fridays in Lent')}
            hint={t('Fish and vegetables on Ash Wednesday and the Fridays of Lent')}
            active={!!p.lent}
            onPress={() => set({ lent: !p.lent })}
          />
          <Section title={t('Cuisines you like')}>
            <Chips>
              {CUISINES.map((c) => (
                <Chip key={c.key} label={t(c.label)} active={p.cuisines.includes(c.key)} onPress={() => set({ cuisines: toggle(p.cuisines, c.key) })} />
              ))}
            </Chips>
            <Text style={styles.help}>{t('None picked means any. Others still appear now and then for variety.')}</Text>
          </Section>
        </>
      )}

      {step === 5 && (
        <Section title={t('What kind of cooking?')}>
          {VIBES.map((v) => (
            <Option key={v.key} icon={v.icon} label={t(v.label)} hint={t(v.hint)} active={p.vibes.includes(v.key)} onPress={() => set({ vibes: toggle(p.vibes, v.key) })} />
          ))}
          <Option
            icon="repeat-outline"
            label={t('Use up leftovers')}
            hint={t("Tonight's rice becomes tomorrow's sinangag; adobo becomes adobo flakes")}
            active={p.leftovers !== false}
            onPress={() => set({ leftovers: p.leftovers === false })}
          />
        </Section>
      )}

      {step === 6 && (
        <Section title={t('Allergies')}>
          <Chips>
            {ALLERGIES.map((a) => (
              <Chip key={a.key} label={t(a.label)} active={p.allergies.includes(a.key)} onPress={() => set({ allergies: toggle(p.allergies, a.key) })} />
            ))}
          </Chips>
          <Note icon="medkit-outline">{t('Dishes with these are never suggested. Always check labels on packaged food: fish sauce, oyster sauce and bagoong hide in many Filipino dishes.')}</Note>
        </Section>
      )}

      {step === 7 && (
        <Section title={t('Anything you don\'t eat?')}>
          <Chips>
            {DISLIKES.map((d) => (
              <Chip key={d.key} label={t(d.label)} active={p.dislikes.includes(d.key)} onPress={() => set({ dislikes: toggle(p.dislikes, d.key) })} />
            ))}
          </Chips>
        </Section>
      )}

      {step === 8 && <Haves have={p.have} onChange={(have) => set({ have })} />}

      {step === 9 && <BudgetStep p={p} set={set} book={book} loading={loading} options={options} />}
    </Screen>
  );
}

function Option({ label, hint, icon, active, onPress }: { label: string; hint?: string; icon?: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="checkbox" accessibilityState={{ checked: active }} style={[styles.option, active && styles.optionOn]}>
      {icon && <Icon name={icon} size={22} color={active ? C.primaryText : C.muted} />}
      <View style={{ flex: 1 }}>
        <Text style={styles.optionLabel}>{label}</Text>
        {hint ? <Text style={styles.help}>{hint}</Text> : null}
      </View>
      <Icon name={active ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={active ? C.primaryText : C.line} />
    </Pressable>
  );
}

function Stepper({ label, hint, value, onChange }: { label: string; hint: string; value: number; onChange: (n: number) => void }) {
  return (
    <View style={styles.option}>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionLabel}>{label}</Text>
        <Text style={styles.help}>{hint}</Text>
      </View>
      <Pressable onPress={() => onChange(Math.max(0, value - 1))} style={styles.step} accessibilityLabel={t('Fewer {what}', { what: label.toLowerCase() })}>
        <Icon name="remove" size={20} color={C.primaryText} />
      </Pressable>
      <Text style={styles.stepValue}>{value}</Text>
      <Pressable onPress={() => onChange(Math.min(12, value + 1))} style={styles.step} accessibilityLabel={t('More {what}', { what: label.toLowerCase() })}>
        <Icon name="add" size={20} color={C.primaryText} />
      </Pressable>
    </View>
  );
}

/** Names of whoever takes turns cooking; the plan and chores say whose turn it is. */
function Cooks({ cooks, onChange }: { cooks: string[]; onChange: (c: string[]) => void }) {
  const [name, setName] = useState('');
  const add = () => {
    const n = name.trim();
    if (n && !cooks.includes(n)) onChange([...cooks, n]);
    setName('');
  };
  return (
    <View style={[styles.option, { flexDirection: 'column', alignItems: 'stretch' }]}>
      <Text style={styles.optionLabel}>{t('Who takes turns cooking?')}</Text>
      <Text style={styles.help}>{t("Optional. Gawain rotates the cooking and puts each person's name on the chore.")}</Text>
      {cooks.length > 0 && (
        <View style={{ marginTop: 10 }}>
          <Chips>
            {cooks.map((c) => (
              <Chip key={c} icon="close" label={c} active onPress={() => onChange(cooks.filter((x) => x !== c))} />
            ))}
          </Chips>
        </View>
      )}
      <View style={styles.addRow}>
        <TextInput value={name} onChangeText={setName} onSubmitEditing={add} placeholder={t('Name')} placeholderTextColor={C.muted} style={styles.input} />
        <Button small icon="add" label={t('Add')} onPress={add} disabled={!name.trim()} />
      </View>
    </View>
  );
}

function Haves({ have, onChange }: { have: string[]; onChange: (h: string[]) => void }) {
  const [text, setText] = useState('');
  const [miss, setMiss] = useState<string | null>(null);
  const extra = have.filter((h) => !COMMON_HAVES.includes(h));
  const add = () => {
    const m = matchIngredient(text);
    if (!m) {
      setMiss(text.trim());
      return;
    }
    setMiss(null);
    setText('');
    if (!have.includes(m.id)) onChange([...have, m.id]);
  };
  return (
    <Section title={t('What do you already have?')}>
      <Text style={[styles.help, { marginBottom: 10 }]}>{t('Gawain cooks with these first and leaves them off the shopping list. Pantry items you marked Plenty are already ticked.')}</Text>
      <Chips>
        {[...COMMON_HAVES, ...extra].map((id) => (
          <Chip key={id} label={INGREDIENT[id]?.name ?? id} active={have.includes(id)} onPress={() => onChange(toggle(have, id))} />
        ))}
      </Chips>
      <View style={styles.addRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={add}
          placeholder={t('Add something else (e.g. kangkong)')}
          placeholderTextColor={C.muted}
          style={styles.input}
        />
        <Button small icon="add" label={t('Add')} onPress={add} disabled={!text.trim()} />
      </View>
      {miss && <Text style={styles.help}>{t('No recipes use "{what}" yet.', { what: miss })}</Text>}
    </Section>
  );
}

function BudgetStep({ p, set, book, loading, options }: { p: Profile; set: (x: Partial<Profile>) => void; book: ReturnType<typeof priceBook> | null; loading: boolean; options: number }) {
  const [text, setText] = useState(String(p.budget));
  const prices = book ?? priceBook(null, p.shop);
  const g = budgetGuide(p, prices);
  const level = BUDGET_LEVEL[g.level];
  const plates = servingsPerWeek(p);
  const toneBg = { danger: C.dangerSoft, warn: C.warnSoft, ok: C.primarySoft, good: C.primarySoft }[level.tone];
  const toneFg = { danger: C.dangerText, warn: C.warnText, ok: C.primaryText, good: C.primaryText }[level.tone];
  return (
    <>
      <Section title={t('Weekly grocery budget')}>
        <View style={styles.budgetRow}>
          <Text style={styles.peso}>₱</Text>
          <TextInput
            value={text}
            onChangeText={(v) => {
              const clean = v.replace(/[^\d]/g, '');
              setText(clean);
              set({ budget: Number(clean) || 0 });
            }}
            keyboardType="number-pad"
            style={styles.budgetInput}
            accessibilityLabel={t('Weekly budget in pesos')}
          />
          <Text style={styles.help}>{t('a week')}</Text>
        </View>
        <Chips>
          {[g.low, g.typical, Math.round(g.typical * 1.3)].filter((x, i, a) => x > 0 && a.indexOf(x) === i).map((x) => (
            <Chip
              key={x}
              label={peso(Math.ceil(x / 50) * 50)}
              active={p.budget === Math.ceil(x / 50) * 50}
              onPress={() => {
                const v = Math.ceil(x / 50) * 50;
                setText(String(v));
                set({ budget: v });
              }}
            />
          ))}
        </Chips>
      </Section>

      <Section title={t('When are you paid?')}>
        <Chips>
          {PAYDAYS.map((o) => (
            <Chip key={o.label} label={t(o.label)} active={(p.payday ?? []).join() === o.days.join()} onPress={() => set({ payday: o.days })} />
          ))}
        </Chips>
        <Text style={styles.help}>{t('The week before payday gets a little less, the week after a little more. Same total over the month.')}</Text>
      </Section>

      <View style={[styles.levelCard, { backgroundColor: toneBg }]}>
        <Text style={[styles.levelLabel, { color: toneFg }]}>{t(loading ? 'Checking prices…' : level.label)}</Text>
        <Text style={[styles.levelHint, { color: toneFg }]}>{t(level.hint)}</Text>
      </View>

      <View style={styles.stats}>
        <Stat value={String(plates)} label={t('plates a week')} />
        <Stat value={peso(g.perPlate)} label={t('per plate')} />
        <Stat value={String(Math.round(portions(p) * 10) / 10)} label={t('portions a meal')} />
      </View>
      <View style={styles.stats}>
        <Stat value={peso(g.low)} label={t('a tipid week')} />
        <Stat value={peso(g.typical)} label={t('a typical week')} />
        <Stat value={String(options)} label={t('dishes that fit')} />
      </View>
      <Text style={styles.help}>{t("Based on today's prices for the dishes that fit your answers, counting rice and the share of oil, soy sauce and other staples you'd use.")}</Text>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }): ReactNode {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{t(label)}</Text>
    </View>
  );
}

const styles = themed(() => ({
  progress: { height: 6, backgroundColor: C.surface, borderRadius: R.pill, marginTop: 4, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: C.primary, borderRadius: R.pill },
  help: { fontSize: 13, color: C.muted, marginTop: 6, lineHeight: 18 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: R.lg,
    padding: 14,
    marginBottom: 8,
  },
  optionOn: { borderColor: C.primary, backgroundColor: C.primarySoft },
  optionLabel: { fontSize: 16, fontWeight: '600', color: C.text },
  step: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 20, fontWeight: '700', color: C.text, minWidth: 28, textAlign: 'center' },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' },
  input: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: C.text },
  budgetRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  peso: { fontSize: 32, fontWeight: '800', color: C.text },
  budgetInput: { fontSize: 32, fontWeight: '800', color: C.text, minWidth: 120, borderBottomWidth: 2, borderBottomColor: C.primary, paddingVertical: 4 },
  levelCard: { borderRadius: R.lg, padding: 16, marginTop: 16 },
  levelLabel: { fontSize: 20, fontWeight: '800' },
  levelHint: { fontSize: 14, marginTop: 4, lineHeight: 20 },
  stats: { flexDirection: 'row', gap: 8, marginTop: 10 },
  stat: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 12 },
  statValue: { fontSize: 18, fontWeight: '800', color: C.text },
  statLabel: { fontSize: 12, color: C.muted, marginTop: 2 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, backgroundColor: C.bg, borderTopWidth: 1, borderTopColor: C.line },
  footerRow: { width: '100%', maxWidth: MAX_WIDTH, flexDirection: 'row', alignItems: 'center' },
}));
