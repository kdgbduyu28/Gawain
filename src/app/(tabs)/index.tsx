import { Redirect, router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Check, Chip, Chips, Icon, Note, Screen, Section } from '../../components/bits';
import { ChoreRow } from '../../components/ChoreRow';
import { TIMER_PRESETS } from '../../data/starters';
import { dueNow } from '../../lib/chores';
import { Gap, Suggestion, gapsOn, merge, remindAt, suggest } from '../../lib/gaps';
import { haptic } from '../../lib/haptics';
import { useHydrated, useNow } from '../../lib/hooks';
import { runningOutSoon } from '../../lib/pantry';
import { list } from '../../lib/reminders';
import { MIN, fmtMinutes, fmtTime } from '../../lib/time';
import { allBusy, useHome } from '../../store/useHome';
import { C, R, themed } from '../../theme';

function greeting(now: number) {
  const h = new Date(now).getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function gapTitle(g: Gap, now: number): string {
  const starts = g.start <= now + MIN ? 'Now' : fmtTime(g.start, true);
  if (g.next) return `${starts}: ${fmtMinutes(g.minutes)} before ${g.next.title || 'your next meeting'}`;
  if (g.work) return `${starts}: ${fmtMinutes(g.minutes)} until work ends`;
  return `${starts}: free until ${fmtTime(g.end, true)}`;
}

export default function Today() {
  const hydrated = useHydrated();
  const now = useNow(30_000);
  const welcomed = useHome((s) => s.settings.welcomed);
  const chores = useHome((s) => s.chores);
  const items = useHome((s) => s.items);
  const timers = useHome((s) => s.timers);
  const blocks = useHome((s) => s.blocks);
  const calendarBusy = useHome((s) => s.calendarBusy);
  const settings = useHome((s) => s.settings);
  const { markDone, startTimer, stopTimer, toggleList } = useHome.getState();

  const busy = useMemo(() => allBusy({ calendarBusy, blocks }, now), [calendarBusy, blocks, now]);
  const meeting = merge(busy).find((b) => b.start <= now && now < b.end) ?? null;
  const suggestions: Suggestion[] = useMemo(() => {
    const gaps = gapsOn(now, busy, settings.schedule, now, 5);
    return suggest(gaps, chores, settings.schedule, now);
  }, [busy, chores, settings.schedule, now]);
  const current = suggestions[0] && suggestions[0].gap.start <= now + MIN ? suggestions[0] : null;
  const later = suggestions.filter((s) => s !== current).slice(0, 4);
  const suggested = new Set(suggestions.flatMap((s) => s.chores.map((c) => c.id)));
  const due = dueNow(chores, now).filter((c) => !suggested.has(c.id));
  const onList = items.filter((i) => i.onList);
  const soon = runningOutSoon(items, now);
  const hasSchedule = settings.useCalendar || settings.icsUrls.length > 0 || blocks.length > 0;

  if (hydrated && !welcomed) return <Redirect href="/welcome" />;

  const summary = [
    `${dueNow(chores, now).length || 'No'} chore${dueNow(chores, now).length === 1 ? '' : 's'} due`,
    onList.length ? `${onList.length} on the list` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Screen title={greeting(now)} subtitle={`${new Date(now).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} · ${summary}`}>
      {meeting && (
        <Card style={[styles.hero, { backgroundColor: C.surface }]}>
          <Text style={styles.heroKicker}>IN A MEETING</Text>
          <Text style={styles.heroTitle}>
            {meeting.title || 'Busy'} until {fmtTime(meeting.end, true)}
          </Text>
          <Text style={styles.heroBody}>Chores can wait. Gawain will suggest something when you're free.</Text>
        </Card>
      )}

      {!meeting && current && (
        <Card style={styles.hero}>
          <Text style={[styles.heroKicker, { color: C.primaryText }]}>YOU'RE FREE</Text>
          <Text style={styles.heroTitle}>{gapTitle(current.gap, now)}</Text>
          <Text style={styles.heroBody}>
            {current.chores.length === 1 ? 'This fits:' : `These fit (${fmtMinutes(current.minutes)} total):`}
          </Text>
          {current.chores.map((c) => (
            <View key={c.id} style={styles.pick}>
              <View style={{ flex: 1 }}>
                <Text style={styles.pickName}>{c.name}</Text>
                <Text style={styles.pickMeta}>
                  {c.room} · {fmtMinutes(c.minutes)}
                </Text>
              </View>
              <Check
                label={`Mark ${c.name} done`}
                onPress={() => {
                  haptic();
                  markDone(c.id);
                }}
              />
            </View>
          ))}
        </Card>
      )}

      {!meeting && !current && !due.length && (
        <Card style={styles.hero}>
          <Text style={[styles.heroKicker, { color: C.primaryText }]}>ALL CAUGHT UP</Text>
          <Text style={styles.heroTitle}>Nothing needs doing right now</Text>
          <Text style={styles.heroBody}>Enjoy the break.</Text>
        </Card>
      )}

      {!hasSchedule && (
        <Note icon="calendar-outline">
          Gawain fits chores around your meetings. In Settings, connect your calendar (or paste its iCal link), or add your regular meetings.
        </Note>
      )}

      <Section title="Appliance timers">
        {timers.map((t) => {
          const left = Math.ceil((t.endsAt - now) / MIN);
          const r = remindAt(t.endsAt, busy);
          // Started by a smart plug that will also say when it's finished.
          const waiting = !!t.waitForFinish && t.finishedAt === undefined;
          return (
            <Card key={t.id} style={styles.timer}>
              <Icon name={t.icon} size={22} color={C.primaryText} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pickName}>
                  {t.label} {left > 0 ? `· ${waiting ? 'about ' : ''}${fmtMinutes(left)} left` : waiting ? '· running' : '· done'}
                </Text>
                <Text style={styles.pickMeta}>
                  {waiting
                    ? left > 0
                      ? `Usually done around ${fmtTime(t.endsAt, true)}. You'll hear when the plug says it's finished.`
                      : "Running longer than usual. You'll hear when the plug says it's finished."
                    : left > 0
                    ? r.during
                      ? `Ends ${fmtTime(t.endsAt)} during ${r.during.title || 'a meeting'}. Reminds you at ${fmtTime(r.at)}.`
                      : `Ends at ${fmtTime(t.endsAt, true)}. You're free then.`
                    : `Finished at ${fmtTime(t.endsAt, true)}.`}
                </Text>
              </View>
              <Button small kind={left > 0 || waiting ? 'ghost' : 'soft'} label={left > 0 || waiting ? 'Stop' : 'Dismiss'} onPress={() => stopTimer(t.id)} />
            </Card>
          );
        })}
        <Chips>
          {TIMER_PRESETS.slice(0, 4).map((p) => (
            <Chip key={p.label} icon={p.icon} label={`${p.label} ${p.minutes}m`} onPress={() => startTimer(p.label, p.icon, p.minutes)} />
          ))}
          <Chip icon="timer-outline" label="Other…" onPress={() => router.push('/timer')} />
        </Chips>
      </Section>

      {later.length > 0 && (
        <Section title="Later today">
          {later.map((s) => (
            <Card key={s.gap.start} style={{ marginBottom: 8 }}>
              <Text style={styles.laterTitle}>{gapTitle(s.gap, now)}</Text>
              <Text style={styles.pickMeta}>{list(s.chores.map((c) => `${c.name} (${fmtMinutes(c.minutes)})`))}</Text>
            </Card>
          ))}
        </Section>
      )}

      {due.length > 0 && (
        <Section title={suggestions.length ? 'Also due' : 'Due'}>
          {due.map((c) => (
            <ChoreRow key={c.id} chore={c} now={now} />
          ))}
        </Section>
      )}

      {(soon.length > 0 || onList.length > 0) && (
        <Section title="Groceries">
          <Card onPress={() => router.navigate('/groceries')}>
            {onList.length > 0 && (
              <Text style={styles.pickName}>
                {onList.length} on the list: <Text style={styles.pickMeta}>{list(onList.map((i) => i.name), 4)}</Text>
              </Text>
            )}
            {soon.map((i) => (
              <View key={i.id} style={styles.soon}>
                <Text style={[styles.pickMeta, { flex: 1 }]}>{i.name} usually runs out about now</Text>
                <Pressable onPress={() => toggleList(i.id)} hitSlop={8} accessibilityRole="button">
                  <Text style={styles.link}>Add to list</Text>
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
  hero: { marginTop: 12, backgroundColor: C.primarySoft, borderColor: 'transparent', borderRadius: R.lg + 4, padding: 18 },
  heroKicker: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: C.muted },
  heroTitle: { fontSize: 20, fontWeight: '800', color: C.text, marginTop: 4 },
  heroBody: { fontSize: 14, color: C.muted, marginTop: 6, marginBottom: 4 },
  pick: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: R.md, padding: 12, marginTop: 8 },
  pickName: { fontSize: 16, fontWeight: '600', color: C.text },
  pickMeta: { fontSize: 13, color: C.muted, marginTop: 2, fontWeight: '400' },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
  laterTitle: { fontSize: 15, fontWeight: '700', color: C.text },
  soon: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  link: { color: C.primaryText, fontWeight: '700', fontSize: 14 },
}));
