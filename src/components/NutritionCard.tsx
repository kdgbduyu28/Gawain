import { Text, View } from 'react-native';
import { DAILY, Nutrients, SALTY } from '../lib/meals/nutrition';
import { t } from '../i18n';
import { C, R, themed } from '../theme';
import { Card, Icon } from './bits';

const ROWS: { key: keyof Nutrients; label: string; unit: string }[] = [
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
  { key: 'fiber', label: 'Fiber', unit: 'g' },
  { key: 'sodium', label: 'Sodium', unit: 'mg' },
];

/** Calories big, then each nutrient with how much of an adult's day it is. */
export function NutritionCard({ n, note, salty = SALTY }: { n: Nutrients; note: string; salty?: number }) {
  return (
    <Card>
      <View style={styles.top}>
        <Text style={styles.kcal}>{Math.round(n.kcal)}</Text>
        <Text style={styles.kcalUnit}>kcal</Text>
        <Text style={styles.share}>{t('{pct}% of a 2,000 kcal day', { pct: Math.round((n.kcal / DAILY.kcal) * 100) })}</Text>
      </View>
      {ROWS.map((r) => {
        const v = n[r.key];
        const pct = Math.min(100, Math.round((v / DAILY[r.key]) * 100));
        const warn = r.key === 'sodium' && v > salty;
        return (
          <View key={r.key} style={styles.row}>
            <Text style={styles.label}>{t(r.label)}</Text>
            <View style={styles.bar}>
              <View style={[styles.fill, { width: `${pct}%`, backgroundColor: warn ? C.danger : C.primary }]} />
            </View>
            <Text style={[styles.value, warn && { color: C.dangerText }]}>
              {r.unit === 'mg' ? Math.round(v / 10) * 10 : Math.round(v)} {r.unit}
            </Text>
          </View>
        );
      })}
      {n.sodium > salty && (
        <View style={styles.warn}>
          <Icon name="alert-circle-outline" size={16} color={C.dangerText} />
          <Text style={styles.warnText}>{t('Salty. Go easy on the soy sauce, patis or salt to taste.')}</Text>
        </View>
      )}
      <Text style={styles.note}>{note}</Text>
    </Card>
  );
}

const styles = themed(() => ({
  top: { flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap', marginBottom: 6 },
  kcal: { fontSize: 26, fontWeight: '800', color: C.text },
  kcalUnit: { fontSize: 14, fontWeight: '700', color: C.muted },
  share: { fontSize: 12, color: C.muted, marginLeft: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  label: { width: 62, fontSize: 14, color: C.text },
  bar: { flex: 1, height: 6, borderRadius: R.pill, backgroundColor: C.line, overflow: 'hidden' },
  fill: { height: 6, borderRadius: R.pill },
  value: { width: 70, textAlign: 'right', fontSize: 14, fontWeight: '700', color: C.text },
  warn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  warnText: { flex: 1, fontSize: 13, color: C.dangerText },
  note: { fontSize: 12, color: C.muted, marginTop: 8, lineHeight: 17 },
}));
