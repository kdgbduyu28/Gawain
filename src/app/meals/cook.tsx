import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Icon, Screen, back } from '../../components/bits';
import { getLang, t } from '../../i18n';
import { stepMinutes } from '../../lib/meals/cooking';
import { INGREDIENT } from '../../lib/meals/ingredients';
import { linesFor, portions } from '../../lib/meals/planner';
import { RECIPE } from '../../lib/meals/recipes';
import { fmtMinutes } from '../../lib/time';
import { Command, canListen, canSpeak, hush, listen, say, stayAwake } from '../../lib/voice';
import { useHome } from '../../store/useHome';
import { useMeals } from '../../store/useMeals';
import { C, R, themed } from '../../theme';

function amount(qty: number, unit: string): string {
  if (unit === 'pc') return `${Math.max(1, Math.round(qty))}`;
  if (qty >= 1000) return `${Math.round(qty / 100) / 10} ${unit === 'g' ? 'kg' : 'L'}`;
  return `${Math.max(5, Math.round(qty / 5) * 5)} ${unit}`;
}

/** One big step at a time, readable from across the kitchen, with voice in the browser. */
export default function CookMode() {
  const { id, key } = useLocalSearchParams<{ id: string; key?: string }>();
  const profile = useMeals((s) => s.profile);
  const plan = useMeals((s) => s.plan);
  const cooked = useMeals((s) => s.cooked);
  const startTimer = useHome((s) => s.startTimer);
  const recipe = RECIPE[id ?? ''];
  const slot = plan?.slots.find((s) => s.key === key);
  // Page 0 is "get everything out"; then one page per step.
  const [page, setPage] = useState(0);
  const [aloud, setAloud] = useState(false);
  const [voice, setVoice] = useState(false);
  const total = (recipe?.steps.length ?? 0) + 1;
  const lang = getLang() === 'fil' ? 'fil-PH' : 'en-US';

  const text = useCallback(
    (p: number) => {
      if (!recipe) return '';
      if (p === 0) return t('Get these out: {list}', { list: recipe.ingredients.map((l) => INGREDIENT[l.id]?.name ?? l.id).join(', ') });
      return `${t('Step {n}.', { n: p })} ${recipe.steps[p - 1]}`;
    },
    [recipe],
  );

  const go = useCallback((p: number) => setPage(Math.max(0, Math.min(total - 1, p))), [total]);

  useEffect(() => {
    if (aloud) say(text(page), lang);
  }, [aloud, page, text, lang]);

  useEffect(() => () => hush(), []);

  useEffect(() => {
    let release = () => {};
    stayAwake().then((r) => (release = r));
    return () => release();
  }, []);

  const mins = page > 0 && recipe ? stepMinutes(recipe.steps[page - 1]) : null;
  const onCommand = useCallback(
    (c: Command) => {
      if (c === 'next') setPage((p) => Math.min(total - 1, p + 1));
      else if (c === 'back') setPage((p) => Math.max(0, p - 1));
      else if (c === 'repeat') say(text(page), lang);
      else if (c === 'timer' && mins && recipe) startTimer(`${recipe.name} (${t('step {n}', { n: page })})`, 'flame-outline', mins);
    },
    [total, text, page, lang, mins, recipe, startTimer],
  );

  useEffect(() => {
    if (!voice) return;
    return listen(onCommand, lang);
  }, [voice, onCommand, lang]);

  // Arrow keys and space on a keyboard.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') go(page + 1);
      else if (e.key === 'ArrowLeft') go(page - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, page]);

  if (!recipe || !profile) return <Screen stack title={t('Cook mode')}>{null}</Screen>;
  const n = slot?.portions ?? portions(profile);
  const last = page === total - 1;
  const done = !!slot && cooked.includes(slot.key);

  return (
    <Screen stack title={recipe.name} subtitle={page === 0 ? t('Get ready') : t('Step {n} of {total}', { n: page, total: total - 1 })}>
      <View style={styles.progress}>
        <View style={[styles.fill, { width: `${((page + 1) / total) * 100}%` }]} />
      </View>

      {page === 0 ? (
        <View style={styles.body}>
          <Text style={styles.kicker}>{t('GET THESE OUT')}</Text>
          {linesFor(recipe, n).map((l) => (
            <View key={l.id} style={styles.ing}>
              <Text style={styles.ingName}>{INGREDIENT[l.id]?.name ?? l.id}</Text>
              <Text style={styles.ingQty}>{amount(l.qty, INGREDIENT[l.id]?.unit ?? 'g')}</Text>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.body}>
          <Text style={styles.step} accessibilityLiveRegion="polite">
            {recipe.steps[page - 1]}
          </Text>
          {mins && (
            <Pressable onPress={() => startTimer(`${recipe.name} (${t('step {n}', { n: page })})`, 'flame-outline', mins)} style={styles.timer} accessibilityRole="button">
              <Icon name="timer-outline" size={22} color={C.onColor} />
              <Text style={styles.timerText}>{t('Start {time} timer', { time: fmtMinutes(mins) })}</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.nav}>
        <Pressable onPress={() => go(page - 1)} disabled={page === 0} style={[styles.navBtn, page === 0 && { opacity: 0.4 }]} accessibilityRole="button" accessibilityLabel={t('Back')}>
          <Icon name="arrow-back" size={28} color={C.primaryText} />
        </Pressable>
        {last ? (
          <Pressable
            onPress={() => {
              if (slot && !done) useMeals.getState().markCooked(slot.key);
              back();
            }}
            style={[styles.navBtn, styles.navMain]}
            accessibilityRole="button"
          >
            <Icon name="checkmark-done" size={26} color={C.onColor} />
            <Text style={styles.navMainText}>{slot && !done ? t('Done: mark cooked') : t('Done')}</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => go(page + 1)} style={[styles.navBtn, styles.navMain]} accessibilityRole="button" accessibilityLabel={t('Next')}>
            <Text style={styles.navMainText}>{t('Next')}</Text>
            <Icon name="arrow-forward" size={26} color={C.onColor} />
          </Pressable>
        )}
      </View>

      <View style={styles.tools}>
        {canSpeak && <Button small kind={aloud ? 'primary' : 'soft'} icon="volume-high-outline" label={aloud ? t('Reading aloud') : t('Read aloud')} onPress={() => setAloud(!aloud)} />}
        {canListen && <Button small kind={voice ? 'primary' : 'soft'} icon="mic-outline" label={voice ? t('Listening') : t('Voice control')} onPress={() => setVoice(!voice)} />}
      </View>
      <Text style={styles.hint}>
        {canListen
          ? t('Say "next", "back", "repeat" or "timer" (or "sunod", "balik", "ulit"). The screen stays on while this is open.')
          : t('Tap the big buttons, or use the arrow keys. Voice works in Chrome and Edge.')}
      </Text>
    </Screen>
  );
}

const styles = themed(() => ({
  progress: { height: 8, backgroundColor: C.surface, borderRadius: R.pill, marginTop: 8, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: C.primary, borderRadius: R.pill },
  body: { minHeight: 260, justifyContent: 'center', paddingVertical: 24 },
  kicker: { fontSize: 12, fontWeight: '800', color: C.muted, letterSpacing: 0.8, marginBottom: 8 },
  ing: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.line },
  ingName: { fontSize: 20, color: C.text, flex: 1 },
  ingQty: { fontSize: 20, fontWeight: '700', color: C.text },
  step: { fontSize: 30, lineHeight: 42, fontWeight: '600', color: C.text },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', marginTop: 20, backgroundColor: C.primary, borderRadius: R.pill, paddingHorizontal: 18, paddingVertical: 12 },
  timerText: { fontSize: 18, fontWeight: '700', color: C.onColor },
  nav: { flexDirection: 'row', gap: 12, marginTop: 8 },
  navBtn: { height: 72, minWidth: 72, borderRadius: R.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: C.primarySoft, flexDirection: 'row', gap: 8 },
  navMain: { flex: 1, backgroundColor: C.primary },
  navMainText: { fontSize: 20, fontWeight: '800', color: C.onColor },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  hint: { fontSize: 13, color: C.muted, marginTop: 10, lineHeight: 18 },
}));
