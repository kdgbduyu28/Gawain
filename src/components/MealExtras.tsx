import { Text, View } from 'react-native';
import { locale, t } from '../i18n';
import { DEFAULT_RATES, Rates, TANK_KG, gasPerDay, pesos, planGasPerDay, tankLeft, weekEnergy } from '../lib/meals/energy';
import { peso } from '../lib/meals/labels';
import { Plan, Profile } from '../lib/meals/planner';
import { STORM_KIT, stormDays } from '../lib/meals/weather';
import { useNow } from '../lib/hooks';
import { useHome } from '../store/useHome';
import { PriceMeta, useMeals } from '../store/useMeals';
import { C, R, themed } from '../theme';
import { Button, Card, Icon, Section } from './bits';

const dayName = (d: number) => new Date(d).toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric' });

/** "Petsa de peligro" or "bagong sahod": how the pay cycle moved this week's budget. */
export function PayNote({ plan, profile }: { plan: Plan; profile: Profile }) {
  const pay = plan.pay;
  if (!pay || pay.kind === 'normal') return null;
  const tight = pay.kind === 'tight';
  return (
    <View style={[styles.pay, { backgroundColor: tight ? C.warnSoft : C.primarySoft }]}>
      <Icon name={tight ? 'wallet-outline' : 'cash-outline'} size={18} color={tight ? C.warnText : C.primaryText} />
      <Text style={[styles.payText, { color: tight ? C.warnText : C.primaryText }]}>
        {tight
          ? t('Petsa de peligro: {amount} this week instead of {usual}, until payday on {day}.', { amount: peso(plan.budget), usual: peso(profile.budget), day: dayName(pay.next) })
          : t('Bagong sahod: {amount} this week, a little more than usual.', { amount: peso(plan.budget) })}
      </Text>
    </View>
  );
}

/** The week's weather as it shaped the plan, and bagyo mode when a storm is coming. */
export function WeatherCard() {
  const weather = useMeals((s) => s.weather);
  const bagyoUntil = useMeals((s) => s.bagyoUntil);
  const now = useNow();
  const { setBagyo, generate } = useMeals.getState();
  const added = useHome((s) => s.items.filter((i) => i.onList).length);
  const storms = stormDays(weather.filter((w) => w.date >= now - 86_400_000));
  const bagyo = !!bagyoUntil && bagyoUntil > now;
  const rainy = weather.filter((w) => w.rain && w.date >= now - 86_400_000).length;
  const hot = weather.filter((w) => w.hot && w.date >= now - 86_400_000).length;
  if (!weather.length && !bagyo) return null;

  const stockUp = () => {
    const { addToList } = useHome.getState();
    // English names, so they merge with pantry items already on the list.
    for (const name of STORM_KIT) addToList(name);
  };

  return (
    <Section title={t('Weather this week')}>
      <Card>
        {(storms.length > 0 || bagyo) && (
          <View style={styles.storm}>
            <Icon name="thunderstorm" size={20} color={C.dangerText} />
            <View style={{ flex: 1 }}>
              <Text style={styles.stormTitle}>{bagyo ? t('Bagyo mode is on') : t('Looks stormy: {days}', { days: storms.map((w) => dayName(w.date)).join(', ') })}</Text>
              <Text style={styles.meta}>
                {storms.length
                  ? t('Gusts up to {gust} km/h and {rain} mm of rain in the forecast. Check PAGASA for storm signals.', {
                      gust: Math.round(Math.max(...storms.map((w) => w.gustKmh))),
                      rain: Math.round(Math.max(...storms.map((w) => w.rainMm))),
                    })
                  : t('Planning from the pantry: canned goods, rice, eggs and roots, nothing that needs the market or the fridge.')}
              </Text>
            </View>
          </View>
        )}
        {(storms.length > 0 || bagyo) && (
          <View style={styles.row}>
            <Button small icon="basket-outline" label={t('Add storm supplies to list')} onPress={stockUp} />
            <Button
              small
              kind="soft"
              icon={bagyo ? 'close' : 'umbrella-outline'}
              label={bagyo ? t('Turn off bagyo mode') : t('Bagyo mode')}
              onPress={() => {
                setBagyo(!bagyo);
                generate();
              }}
            />
          </View>
        )}
        {added > 0 && (storms.length > 0 || bagyo) && <Text style={styles.meta}>{t('{n} things on your grocery list.', { n: added })}</Text>}
        <View style={styles.chips}>
          {rainy > 0 && <Chiplet icon="rainy-outline" text={t('{n} rainy days: more sabaw', { n: rainy })} />}
          {hot > 0 && <Chiplet icon="sunny-outline" text={t('{n} hot days: lighter cooking', { n: hot })} />}
          {!rainy && !hot && !storms.length && <Chiplet icon="partly-sunny-outline" text={t('Mild week')} />}
        </View>
        <Text style={styles.foot}>{t('Forecast from Open-Meteo.')}</Text>
      </Card>
    </Section>
  );
}

function Chiplet({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.chiplet}>
      <Icon name={icon} size={14} color={C.primaryText} />
      <Text style={styles.chipletText}>{text}</Text>
    </View>
  );
}

export function ratesOf(meta: PriceMeta | null): Rates {
  return { lpgPerKg: meta?.lpg?.perKg ?? DEFAULT_RATES.lpgPerKg, kwh: meta?.power?.kwh ?? DEFAULT_RATES.kwh };
}

/** What the week's cooking burns, and when the LPG tank runs out. */
export function EnergyCard({ plan, profile }: { plan: Plan; profile: Profile }) {
  const meta = useMeals((s) => s.meta);
  const tank = useMeals((s) => s.tank);
  const now = useNow();
  const { newTank, stopTank } = useMeals.getState();
  const rates = ratesOf(meta);
  const e = weekEnergy(plan, profile);
  const perDay = gasPerDay(tank, planGasPerDay(plan, profile));
  const left = tankLeft(tank, now, perDay);
  const low = !!left && left.days <= 4;
  const tankPrice = rates.lpgPerKg * TANK_KG;

  return (
    <Section title={t('Gas and power')}>
      <Card>
        <Text style={styles.big}>{peso(pesos(e, rates))}</Text>
        <Text style={styles.meta}>
          {t('Cooking this week: about {kg} kg of LPG and {kwh} kWh of electricity.', { kg: e.lpgKg.toFixed(1), kwh: e.kwh.toFixed(1) })}
          {e.charcoal ? ` ${t('Plus {amount} of uling.', { amount: peso(e.charcoal) })}` : ''}
        </Text>

        <View style={styles.tank}>
          <Icon name="flame-outline" size={20} color={low ? C.dangerText : C.primaryText} />
          <View style={{ flex: 1 }}>
            {left ? (
              <>
                <Text style={[styles.tankTitle, low && { color: C.dangerText }]}>
                  {left.days < 1 ? t('LPG may run out today') : t('LPG lasts about {n} more days', { n: Math.round(left.days) })}
                </Text>
                <View style={styles.bar}>
                  <View style={[styles.fill, { width: `${Math.round(left.share * 100)}%`, backgroundColor: low ? C.danger : C.primary }]} />
                </View>
                <Text style={styles.meta}>
                  {t('Empty around {day}', { day: dayName(left.emptyOn) })} ·{' '}
                  {tank.lasted.length ? t('from how long your last tanks lasted') : t("estimated from this week's cooking")}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.tankTitle}>{t('Track your LPG tank')}</Text>
                <Text style={styles.meta}>{t('Tap when a new tank goes in. Gawain learns how long yours last and warns you before it runs out.')}</Text>
              </>
            )}
          </View>
        </View>
        <View style={styles.row}>
          <Button small kind={left ? 'soft' : 'primary'} icon="refresh-outline" label={t('New tank today')} onPress={() => newTank()} />
          {low && <Button small icon="basket-outline" label={t('Add LPG to list')} onPress={() => useHome.getState().addToList(t('LPG refill (11 kg)'))} />}
          {left && <Button small kind="ghost" label={t('Stop tracking')} onPress={stopTank} />}
        </View>
        <Text style={styles.foot}>
          {t('Rough: a 2-burner stove on medium, appliances at their usual wattage.')}{' '}
          {meta?.lpg ? t('LPG {amount} per 11 kg tank (DOE, Metro Manila, {period}).', { amount: peso(tankPrice), period: meta.lpg.period }) : ''}{' '}
          {meta?.power ? t('Power {rate}/kWh ({period}).', { rate: `₱${rates.kwh.toFixed(2)}`, period: meta.power.period }) : ''}
        </Text>
      </Card>
    </Section>
  );
}

const styles = themed(() => ({
  pay: { flexDirection: 'row', gap: 8, alignItems: 'center', borderRadius: R.md, padding: 10, marginTop: 10 },
  payText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  storm: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginBottom: 10 },
  stormTitle: { fontSize: 15, fontWeight: '700', color: C.dangerText },
  meta: { fontSize: 13, color: C.muted, marginTop: 2, lineHeight: 18 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chiplet: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.primarySoft, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 5 },
  chipletText: { fontSize: 12, color: C.primaryText, fontWeight: '600' },
  foot: { fontSize: 12, color: C.muted, marginTop: 10, lineHeight: 17 },
  big: { fontSize: 24, fontWeight: '800', color: C.text },
  tank: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 14 },
  tankTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  bar: { height: 8, backgroundColor: C.surface, borderRadius: R.pill, marginTop: 6, overflow: 'hidden' },
  fill: { height: 8, borderRadius: R.pill },
}));
