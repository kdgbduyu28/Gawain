import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ReactNode, useEffect, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleProp, Switch, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Clock, fmtClock, parseClock } from '../lib/time';
import { C, MAX_WIDTH, R, themed } from '../theme';

export type IconName = keyof typeof Ionicons.glyphMap;

export function Icon({ name, size = 20, color = C.text }: { name: string; size?: number; color?: string }) {
  return <Ionicons name={name as IconName} size={size} color={color} />;
}

/** Asks before something that can't be undone. */
export function confirm(title: string, body: string, ok: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n\n${body}`));
  return new Promise((resolve) =>
    Alert.alert(title, body, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: ok, style: 'destructive', onPress: () => resolve(true) },
    ]),
  );
}

export function back() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** A scrolling page with a big title (tabs) or a back-arrow header (stack screens). */
export function Screen({
  title,
  subtitle,
  right,
  stack,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  stack?: boolean;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <View style={[styles.header, { paddingTop: insets.top + (stack ? 4 : 12) }]}>
        <View style={styles.wrapRow}>
          {stack && (
            <Pressable onPress={back} hitSlop={10} accessibilityLabel="Back" style={{ marginRight: 8 }}>
              <Icon name="arrow-back" size={24} color={C.primaryText} />
            </Pressable>
          )}
          <View style={{ flex: 1 }}>
            <Text style={stack ? styles.stackTitle : styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>
          {right}
        </View>
      </View>
      <ScrollView contentContainerStyle={{ paddingBottom: 96 + insets.bottom }} keyboardShouldPersistTaps="handled">
        <View style={styles.wrap}>{children}</View>
      </ScrollView>
      {footer}
    </View>
  );
}

export function Section({ title, right, children }: { title?: string; right?: ReactNode; children: ReactNode }) {
  return (
    <View style={{ marginTop: 18 }}>
      {(title || right) && (
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {right}
        </View>
      )}
      {children}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  if (onPress)
    return (
      <Pressable onPress={onPress} style={({ pressed }) => [styles.card, style, pressed && { opacity: 0.85 }]}>
        {children}
      </Pressable>
    );
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  icon,
  kind = 'primary',
  small,
  disabled,
}: {
  label: string;
  onPress: () => void;
  icon?: string;
  kind?: 'primary' | 'soft' | 'ghost' | 'danger';
  small?: boolean;
  disabled?: boolean;
}) {
  const bg = { primary: C.primary, soft: C.primarySoft, ghost: 'transparent', danger: C.dangerSoft }[kind];
  const fg = { primary: C.onColor, soft: C.primaryText, ghost: C.primaryText, danger: C.dangerText }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
      ]}
    >
      {icon && <Icon name={icon} size={small ? 16 : 18} color={fg} />}
      <Text style={[styles.buttonText, small && { fontSize: 13 }, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={[styles.chip, active && { backgroundColor: C.primary, borderColor: C.primary }]}
    >
      {icon && <Icon name={icon} size={15} color={active ? C.onColor : C.muted} />}
      <Text style={[styles.chipText, active && { color: C.onColor }]}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

/** A round check button: tap to mark something done. */
export function Check({ onPress, label, done }: { onPress: () => void; label: string; done?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button" accessibilityLabel={label} style={[styles.check, done && styles.checkDone]}>
      <Icon name="checkmark" size={18} color={done ? C.onColor : C.primaryText} />
    </Pressable>
  );
}

export function Label({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Field({ label, ...props }: { label?: string } & TextInputProps) {
  return (
    <View style={{ marginTop: 14 }}>
      {label && <Label>{label}</Label>}
      <TextInput placeholderTextColor={C.muted} {...props} style={[styles.input, props.style]} />
    </View>
  );
}

/** Text box for a time of day: accepts "9", "9:30", "2pm", "14:00". */
export function TimeField({ label, value, onChange }: { label: string; value: Clock; onChange: (c: Clock) => void }) {
  const [text, setText] = useState(fmtClock(value));
  useEffect(() => setText(fmtClock(value)), [value]);
  const commit = () => {
    const c = parseClock(text);
    if (c) onChange(c);
    else setText(fmtClock(value));
  };
  return (
    <View style={{ flex: 1 }}>
      <Label>{label}</Label>
      <TextInput value={text} onChangeText={setText} onBlur={commit} onSubmitEditing={commit} style={styles.input} placeholderTextColor={C.muted} />
    </View>
  );
}

export function ToggleRow({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: C.primary, false: C.line }} thumbColor="#fff" />
    </View>
  );
}

export function LinkRow({ icon, label, hint, onPress }: { icon: string; label: string; hint?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
      <Icon name={icon} size={20} color={C.primaryText} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      <Icon name="chevron-forward" size={18} color={C.muted} />
    </Pressable>
  );
}

export function Empty({ icon, title, body, children }: { icon: string; title: string; body?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Icon name={icon} size={36} color={C.muted} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {body ? <Text style={styles.emptyBody}>{body}</Text> : null}
      {children}
    </View>
  );
}

export function Note({ icon = 'information-circle-outline', children }: { icon?: string; children: ReactNode }) {
  return (
    <View style={styles.note}>
      <Icon name={icon} size={18} color={C.warnText} />
      <Text style={styles.noteText}>{children}</Text>
    </View>
  );
}

/** Floating "+" button for tab screens. */
export function Fab({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <View pointerEvents="box-none" style={styles.fabWrap}>
      <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [styles.fab, pressed && { opacity: 0.85 }]}>
        <Icon name="add" size={22} color={C.onColor} />
        <Text style={styles.fabText}>{label}</Text>
      </Pressable>
    </View>
  );
}

export const styles = themed(() => ({
  header: { backgroundColor: C.bg, paddingHorizontal: 16, paddingBottom: 8 },
  wrapRow: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', flexDirection: 'row', alignItems: 'center' },
  wrap: { width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 16 },
  title: { fontSize: 28, fontWeight: '800', color: C.text, letterSpacing: -0.5 },
  stackTitle: { fontSize: 20, fontWeight: '700', color: C.text },
  subtitle: { fontSize: 14, color: C.muted, marginTop: 2 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  card: { backgroundColor: C.card, borderRadius: R.lg, padding: 14, borderWidth: 1, borderColor: C.line },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: R.md },
  buttonSmall: { paddingHorizontal: 10, paddingVertical: 7 },
  buttonText: { fontSize: 15, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: R.pill,
    borderWidth: 1,
    borderColor: C.line,
    backgroundColor: C.card,
  },
  chipText: { fontSize: 14, color: C.text, fontWeight: '500' },
  check: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: C.primaryText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkDone: { backgroundColor: C.primary, borderColor: C.primary },
  label: { fontSize: 13, fontWeight: '600', color: C.muted, marginBottom: 6 },
  input: {
    backgroundColor: C.surface,
    borderRadius: R.md,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 16,
    color: C.text,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  rowTitle: { fontSize: 16, color: C.text, fontWeight: '500' },
  rowHint: { fontSize: 13, color: C.muted, marginTop: 2 },
  empty: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 24, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: C.text, textAlign: 'center' },
  emptyBody: { fontSize: 14, color: C.muted, textAlign: 'center', lineHeight: 20 },
  note: { flexDirection: 'row', gap: 8, backgroundColor: C.warnSoft, borderRadius: R.md, padding: 12, marginTop: 12 },
  noteText: { flex: 1, color: C.warnText, fontSize: 13, lineHeight: 19 },
  fabWrap: { position: 'absolute', right: 0, left: 0, bottom: 16, alignItems: 'center' },
  fab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: C.primary,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: R.pill,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabText: { color: C.onColor, fontWeight: '700', fontSize: 15 },
}));
