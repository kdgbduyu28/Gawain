import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Announcer } from '../components/Announcer';
import { Background } from '../components/Background';
import { UndoToast } from '../components/UndoToast';
import { WebNotifier } from '../components/WebNotifier';
import { startSync } from '../lib/sync/engine';
import { IS_WEB } from '../lib/web';
// Registers the background geofence task at startup (phone builds only).
import '../lib/places';
import { useHome } from '../store/useHome';
import { C, Scheme, setScheme } from '../theme';

export default function RootLayout() {
  const system = useColorScheme();
  const pref = useHome((s) => s.settings.theme);
  // Signed out (or in builds without Supabase) this does nothing.
  useEffect(startSync, []);
  const scheme: Scheme = pref === 'system' ? (system === 'dark' ? 'dark' : 'light') : pref;
  // Swap the palette before anything below renders; the key re-renders the
  // whole app so every screen and cached style picks up the change.
  setScheme(scheme);
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: C.primary, background: C.bg, card: C.card, text: C.text, border: C.line },
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <View key={scheme} style={{ flex: 1, backgroundColor: C.bg }}>
            <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="welcome" options={{ gestureEnabled: false }} />
              <Stack.Screen name="chore" options={{ presentation: 'modal' }} />
              <Stack.Screen name="item" options={{ presentation: 'modal' }} />
              <Stack.Screen name="timer" options={{ presentation: 'modal' }} />
              <Stack.Screen name="calendars" />
              <Stack.Screen name="account" />
              <Stack.Screen name="smarthome" />
              <Stack.Screen name="speaker" />
              <Stack.Screen name="trigger" options={{ presentation: 'modal' }} />
            </Stack>
            <UndoToast />
            <Background />
            {IS_WEB ? <WebNotifier /> : <Announcer />}
          </View>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
