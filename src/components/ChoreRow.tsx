import { router } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { ROOM_ICONS } from '../data/starters';
import { Chore, daysLate, dueAt, status } from '../lib/chores';
import { haptic } from '../lib/haptics';
import { fmtDay, fmtEvery, fmtMinutes } from '../lib/time';
import { useHome } from '../store/useHome';
import { C, R, themed } from '../theme';
import { Check, Icon } from './bits';

export function dueLabel(c: Chore, now: number): { text: string; tone: 'danger' | 'warn' | 'muted' | 'ok' } {
  const s = status(c, now);
  if (s === 'new') return { text: 'Not tracked yet', tone: 'muted' };
  if (s === 'overdue') {
    const d = daysLate(c, now);
    return { text: d === 1 ? '1 day late' : `${d} days late`, tone: 'danger' };
  }
  if (s === 'today') return { text: c.everyDays === null ? 'To do' : 'Due today', tone: 'warn' };
  return { text: `Due ${fmtDay(dueAt(c), now)}`, tone: s === 'soon' ? 'ok' : 'muted' };
}

export function ChoreRow({ chore, now, hideRoom }: { chore: Chore; now: number; hideRoom?: boolean }) {
  const markDone = useHome((s) => s.markDone);
  const due = dueLabel(chore, now);
  const toneColor = { danger: C.dangerText, warn: C.warnText, muted: C.muted, ok: C.primaryText }[due.tone];
  const meta = [fmtEvery(chore.everyDays), fmtMinutes(chore.minutes)];
  if (!hideRoom && chore.where === 'out') meta.unshift('Errand');
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/chore', params: { id: chore.id } })}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
    >
      <View style={styles.icon}>
        <Icon name={chore.where === 'out' ? 'car-outline' : (ROOM_ICONS[chore.room] ?? 'home-outline')} size={18} color={C.primaryText} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name} numberOfLines={1}>
          {chore.name}
        </Text>
        <Text style={[styles.meta, { color: toneColor, fontWeight: '600' }]} numberOfLines={1}>
          {due.text}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {meta.join(' · ')}
        </Text>
      </View>
      <Check
        label={`Mark ${chore.name} done`}
        onPress={() => {
          haptic();
          markDone(chore.id);
        }}
      />
    </Pressable>
  );
}

const styles = themed(() => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.card,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.line,
    paddingVertical: 11,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 16, fontWeight: '600', color: C.text },
  meta: { fontSize: 13, color: C.muted, marginTop: 1 },
}));
