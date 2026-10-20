import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import { ColorValue, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dueNow } from '../../lib/chores';
import { useNow } from '../../lib/hooks';
import { useHome } from '../../store/useHome';
import { t } from '../../i18n';
import { C } from '../../theme';

type IconName = keyof typeof Ionicons.glyphMap;

function icon(active: IconName, inactive: IconName) {
  return ({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) => (
    <Ionicons name={focused ? active : inactive} color={color} size={size} />
  );
}

export default function TabLayout() {
  const now = useNow();
  const due = useHome((s) => dueNow(s.chores, now).length);
  const onList = useHome((s) => s.items.filter((i) => i.onList).length);
  const insets = useSafeAreaInsets();
  // Desktop browsers and tablets get a side rail instead of a bottom bar.
  const wide = useWindowDimensions().width >= 1024;
  const badge = { backgroundColor: C.primary, fontSize: 10 };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.primaryText,
        tabBarInactiveTintColor: C.muted,
        tabBarPosition: wide ? 'left' : 'bottom',
        tabBarVariant: wide ? 'material' : 'uikit',
        tabBarStyle: wide
          ? { backgroundColor: C.card, borderRightColor: C.line, paddingTop: insets.top + 12 }
          : { height: 62 + insets.bottom, paddingBottom: insets.bottom, backgroundColor: C.card, borderTopColor: C.line },
        tabBarLabelStyle: { fontSize: 11, lineHeight: 14 },
        sceneStyle: { backgroundColor: C.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: t('Today'), tabBarIcon: icon('sunny', 'sunny-outline') }} />
      <Tabs.Screen
        name="chores"
        options={{ title: t('Chores'), tabBarIcon: icon('checkmark-circle', 'checkmark-circle-outline'), tabBarBadge: due || undefined, tabBarBadgeStyle: badge }}
      />
      <Tabs.Screen name="meals" options={{ title: t('Meals'), tabBarIcon: icon('restaurant', 'restaurant-outline') }} />
      <Tabs.Screen
        name="groceries"
        options={{ title: t('Groceries'), tabBarIcon: icon('basket', 'basket-outline'), tabBarBadge: onList || undefined, tabBarBadgeStyle: badge }}
      />
      <Tabs.Screen name="settings" options={{ title: t('Settings'), tabBarIcon: icon('settings', 'settings-outline') }} />
    </Tabs>
  );
}
