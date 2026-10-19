import { Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Planned } from '../lib/reminders';
import { announcePlanned } from '../lib/speaker';
import { usePlanTimers } from '../lib/usePlanTimers';
import { registerServiceWorker, showWebNotification } from '../lib/web';
import { C, MAX_WIDTH, R, themed } from '../theme';
import { Icon } from './bits';

const BANNER_MS = 12_000;

/**
 * Browser version of phone notifications. Browsers can't schedule notifications
 * for later, so while the tab is open this shows a system notification (if
 * allowed) plus an in-app banner when each reminder is due, and says it on the
 * speaker if one is set up.
 */
export function WebNotifier() {
  const [banner, setBanner] = useState<Planned | null>(null);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    registerServiceWorker((href) => router.navigate(href as Href));
  }, []);

  usePlanTimers((p) => {
    showWebNotification(p.id, p.title, p.body, p.href).catch(() => {});
    setBanner(p);
    announcePlanned(p);
  });

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), BANNER_MS);
    return () => clearTimeout(t);
  }, [banner]);

  if (!banner) return null;
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Pressable
        style={styles.banner}
        onPress={() => {
          setBanner(null);
          router.navigate(banner.href as Href);
        }}
        accessibilityLiveRegion="assertive"
      >
        <Icon name="notifications" size={20} color={C.onColor} />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{banner.title}</Text>
          <Text style={styles.body}>{banner.body}</Text>
        </View>
        <Pressable onPress={() => setBanner(null)} hitSlop={10} accessibilityLabel="Dismiss">
          <Icon name="close" size={20} color={C.onColor} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = themed(() => ({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: MAX_WIDTH - 32,
    backgroundColor: C.primary,
    borderRadius: R.lg,
    padding: 14,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  title: { color: C.onColor, fontWeight: '700', fontSize: 15 },
  body: { color: C.onColor, fontSize: 14, marginTop: 2, opacity: 0.92 },
}));
