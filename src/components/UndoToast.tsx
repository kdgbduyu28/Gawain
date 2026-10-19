import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHome } from '../store/useHome';
import { C, R, themed } from '../theme';

const SHOW_MS = 5000;

/** "Wash the dishes done · Undo" bar after marking done, buying or deleting. */
export function UndoToast() {
  const undo = useHome((s) => s.undo);
  const undoLast = useHome((s) => s.undoLast);
  const clearUndo = useHome((s) => s.clearUndo);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(clearUndo, SHOW_MS);
    return () => clearTimeout(t);
  }, [undo, clearUndo]);

  if (!undo) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { bottom: 76 + insets.bottom }]}>
      <View style={styles.toast} accessibilityLiveRegion="polite">
        <Text style={styles.text} numberOfLines={1}>
          {undo.message}
        </Text>
        <Pressable onPress={undoLast} hitSlop={10} accessibilityRole="button">
          <Text style={styles.action}>Undo</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#1C211E',
    borderRadius: R.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxWidth: 480,
    width: '100%',
  },
  text: { flex: 1, color: '#fff', fontSize: 15 },
  action: { color: '#6EE7B7', fontWeight: '700', fontSize: 15 },
}));
