import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Chip, Chips, Field, Icon, Label, Note, Screen, Section, TimeField } from '../components/bits';
import { CALENDAR_SUPPORTED } from '../lib/calendar';
import { Block } from '../lib/gaps';
import { Clock, fmtClock, weekdayName } from '../lib/time';
import { useHome } from '../store/useHome';
import { C, R, themed } from '../theme';

// Monday first, the way a work week reads.
const WEEK = [1, 2, 3, 4, 5, 6, 0];

function DayPicker({ value, onChange }: { value: number[]; onChange: (d: number[]) => void }) {
  return (
    <Chips>
      {WEEK.map((d) => (
        <Chip key={d} label={weekdayName(d)} active={value.includes(d)} onPress={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d])} />
      ))}
    </Chips>
  );
}

const EMPTY: Omit<Block, 'id'> & { id?: string } = { title: '', days: [1, 2, 3, 4, 5], start: '10:00', end: '10:30' };

export default function ScheduleScreen() {
  const schedule = useHome((s) => s.settings.schedule);
  const blocks = useHome((s) => s.blocks);
  const useCalendar = useHome((s) => s.settings.useCalendar);
  const { setSchedule, saveBlock, removeBlock } = useHome.getState();
  const [draft, setDraft] = useState(EMPTY);

  const set = (p: Partial<typeof draft>) => setDraft((d) => ({ ...d, ...p }));
  const canAdd = draft.title.trim() && draft.days.length && draft.end > draft.start;

  return (
    <Screen stack title="Work schedule">
      <Section title="Work days">
        <DayPicker value={schedule.workDays} onChange={(workDays) => setSchedule({ workDays })} />
        <View style={styles.pair}>
          <TimeField label="Work starts" value={schedule.workStart} onChange={(workStart) => setSchedule({ workStart })} />
          <TimeField label="Work ends" value={schedule.workEnd} onChange={(workEnd) => setSchedule({ workEnd })} />
        </View>
      </Section>

      <Section title="Chores during work">
        <Label>Only suggest chores up to</Label>
        <Chips>
          {[5, 10, 15, 20, 30].map((m) => (
            <Chip key={m} label={`${m} min`} active={schedule.maxWorkChore === m} onPress={() => setSchedule({ maxWorkChore: m })} />
          ))}
        </Chips>
        <View style={{ height: 12 }} />
        <Label>Keep free before a meeting</Label>
        <Chips>
          {[0, 5, 10, 15].map((m) => (
            <Chip key={m} label={m ? `${m} min` : 'None'} active={schedule.buffer === m} onPress={() => setSchedule({ buffer: m })} />
          ))}
        </Chips>
      </Section>

      <Section title="Chore hours">
        <View style={styles.pair}>
          <TimeField label="Earliest" value={schedule.dayStart} onChange={(dayStart) => setSchedule({ dayStart })} />
          <TimeField label="Latest" value={schedule.dayEnd} onChange={(dayEnd) => setSchedule({ dayEnd })} />
        </View>
      </Section>

      <Section title="Regular meetings">
        {CALENDAR_SUPPORTED && useCalendar ? (
          <Note icon="calendar-outline">Your calendar is connected. Add meetings here only if they're missing from it.</Note>
        ) : (
          <Note icon="calendar-outline">Add meetings you have every week (standup, 1:1s). Gawain keeps them free when suggesting chores.</Note>
        )}
        <View style={{ height: 12 }} />
        {blocks.map((b) => (
          <Pressable key={b.id} onPress={() => setDraft(b)} style={styles.block}>
            <View style={{ flex: 1 }}>
              <Text style={styles.blockTitle}>{b.title}</Text>
              <Text style={styles.blockMeta}>
                {WEEK.filter((d) => b.days.includes(d)).map(weekdayName).join(', ')} · {fmtClock(b.start)}–{fmtClock(b.end)}
              </Text>
            </View>
            <Pressable onPress={() => removeBlock(b.id)} hitSlop={10} accessibilityLabel={`Delete ${b.title}`}>
              <Icon name="trash-outline" size={20} color={C.muted} />
            </Pressable>
          </Pressable>
        ))}
        <Card>
          <Text style={styles.blockTitle}>{draft.id ? 'Edit meeting' : 'Add a meeting'}</Text>
          <Field label="Name" value={draft.title} onChangeText={(title) => set({ title })} placeholder="e.g. Standup" />
          <View style={{ height: 12 }} />
          <DayPicker value={draft.days} onChange={(days) => set({ days })} />
          <View style={styles.pair}>
            <TimeField label="Starts" value={draft.start} onChange={(start: Clock) => set({ start })} />
            <TimeField label="Ends" value={draft.end} onChange={(end: Clock) => set({ end })} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
            <Button
              small
              icon={draft.id ? 'checkmark' : 'add'}
              label={draft.id ? 'Save' : 'Add meeting'}
              disabled={!canAdd}
              onPress={() => {
                saveBlock({ ...draft, title: draft.title.trim() });
                setDraft(EMPTY);
              }}
            />
            {draft.id && <Button small kind="ghost" label="Cancel" onPress={() => setDraft(EMPTY)} />}
          </View>
        </Card>
      </Section>
    </Screen>
  );
}

const styles = themed(() => ({
  pair: { flexDirection: 'row', gap: 12, marginTop: 14 },
  block: {
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
  blockTitle: { fontSize: 16, fontWeight: '600', color: C.text },
  blockMeta: { fontSize: 13, color: C.muted, marginTop: 2 },
}));
