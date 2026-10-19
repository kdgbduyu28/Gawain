import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';

// Gawain's own Supabase project (not the health platform's). Both values are
// public: the publishable key only gets what the database's row policies allow.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Null in builds without a Supabase project; the app then works exactly as before, on the device only. */
export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          // In the browser, Google and email links come back to the page with a code to exchange.
          detectSessionInUrl: Platform.OS === 'web',
          flowType: 'pkce',
        },
      })
    : null;

// Phones only refresh the session while the app is in front.
if (supabase && Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
