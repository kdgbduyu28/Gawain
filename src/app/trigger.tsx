import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';
import { Button, Card, Chip, Chips, Field, Note, Screen, Section, back, confirm } from '../components/bits';
import { TIMER_PRESETS } from '../data/starters';
import { KEY_RE, Trigger, keyFrom } from '../lib/smarthome';
import { useHome } from '../store/useHome';
import { C } from '../theme';

const BUTTON_ICON = 'radio-button-on-outline';
const APPLIANCE_ICON = 'flash-outline';

export default function TriggerScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const trigger = useHome((s) => s.triggers.find((t) => t.id === id));
  const triggers = useHome((s) => s.triggers);
  const chores = useHome((s) => s.chores);
  const { saveTrigger, removeTrigger } = useHome.getState();

  const [kind, setKind] = useState<Trigger['kind']>(trigger?.kind ?? 'chore');
  const [name, setName] = useState(trigger?.name ?? '');
  const [key, setKey] = useState(trigger?.key ?? '');
  // The key follows the name until it's edited by hand (or the trigger already exists, since hubs use it).
  const [keyTouched, setKeyTouched] = useState(!!trigger);
  const [choreId, setChoreId] = useState<string | null>(trigger?.choreId ?? null);
  const [icon, setIcon] = useState(trigger?.icon ?? BUTTON_ICON);
  const [minutes, setMinutes] = useState(String(trigger?.minutes ?? 45));

  const rename = (n: string) => {
    setName(n);
    if (!keyTouched) setKey(keyFrom(n));
  };

  const taken = triggers.some((t) => t.key === key && t.id !== trigger?.id);
  const mins = parseInt(minutes, 10) || 0;
  const valid = name.trim().length > 0 && KEY_RE.test(key) && !taken && (kind === 'chore' ? !!choreId : mins > 0);

  const save = () => {
    if (!valid) return;
    saveTrigger({
      ...(trigger ? { id: trigger.id } : {}),
      kind,
      name: name.trim(),
      key,
      icon,
      choreId: kind === 'chore' ? choreId : null,
      minutes: kind === 'appliance' ? mins : (trigger?.minutes ?? 45),
    });
    back();
  };

  return (
    <Screen stack title={trigger ? 'Edit trigger' : 'New trigger'} right={<Button small label="Save" onPress={save} disabled={!valid} />}>
      <Section title="What it does">
        <Chips>
          <Chip
            icon={BUTTON_ICON}
            label="Marks a chore done"
            active={kind === 'chore'}
            onPress={() => {
              setKind('chore');
              setIcon(BUTTON_ICON);
            }}
          />
          <Chip
            icon={APPLIANCE_ICON}
            label="Appliance timer"
            active={kind === 'appliance'}
            onPress={() => {
              setKind('appliance');
              setIcon(APPLIANCE_ICON);
            }}
          />
        </Chips>
        <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 8 }}>
          {kind === 'chore'
            ? 'For a button, an NFC tag or a robot vacuum. Counts exactly like ticking the chore yourself; a second press within 30 minutes is ignored.'
            : 'For a smart plug on the washer or dryer. "started" starts the timer, "finished" ends it and reminds you, after your meeting if you\'re in one.'}
        </Text>
      </Section>

      {kind === 'chore' ? (
        <Section title="Which chore">
          {chores.length ? (
            <Chips>
              {chores.map((c) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  active={choreId === c.id}
                  onPress={() => {
                    setChoreId(c.id);
                    if (!name.trim() || chores.some((x) => x.name === name)) rename(c.name);
                  }}
                />
              ))}
            </Chips>
          ) : (
            <Note>Add a chore first, then come back to give it a button.</Note>
          )}
        </Section>
      ) : (
        <Section title="Which appliance">
          <Chips>
            {TIMER_PRESETS.map((p) => (
              <Chip
                key={p.label}
                icon={p.icon}
                label={p.label}
                active={name === p.label}
                onPress={() => {
                  rename(p.label);
                  setIcon(p.icon);
                  if (!trigger) setMinutes(String(p.minutes));
                }}
              />
            ))}
          </Chips>
          <Field
            label="Usually runs (minutes)"
            value={minutes}
            onChangeText={(t) => setMinutes(t.replace(/\D/g, ''))}
            keyboardType="number-pad"
          />
          <Text style={{ color: C.muted, fontSize: 13, lineHeight: 18, marginTop: 6 }}>
            {trigger?.reportsFinish
              ? 'Learned from real cycles. Gawain waits for "finished" before reminding you.'
              : 'Used until the plug reports real cycles; then Gawain learns the real length.'}
          </Text>
        </Section>
      )}

      <Field label="Name" value={name} onChangeText={rename} placeholder={kind === 'chore' ? 'e.g. Trash button' : 'e.g. Washer'} />
      <Field
        label="Trigger name your hub sends"
        value={key}
        onChangeText={(t) => {
          setKeyTouched(true);
          setKey(t.toLowerCase().replace(/[^a-z0-9_-]/g, ''));
        }}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="e.g. washer"
      />
      <Text style={{ color: taken ? C.dangerText : C.muted, fontSize: 13, marginTop: 6 }}>
        {taken
          ? 'Another trigger already uses this name.'
          : trigger
            ? 'Changing it means changing it in your hub too.'
            : 'Lowercase letters, numbers, - and _.'}
      </Text>

      {trigger && (
        <Section>
          <Card>
            <Button
              kind="danger"
              icon="trash-outline"
              label="Delete trigger"
              onPress={async () => {
                if (!(await confirm('Delete this trigger?', `Events named "${trigger.key}" will be ignored.`, 'Delete'))) return;
                removeTrigger(trigger.id);
                back();
              }}
            />
          </Card>
        </Section>
      )}
    </Screen>
  );
}
