import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Button, Card, Field, Note, Screen, Section, confirm } from '../components/bits';
import { chooseFirstSync, signOut, syncNow, useSync } from '../lib/sync/engine';
import { supabase } from '../lib/supabase';
import { fmtTime } from '../lib/time';
import { IS_WEB } from '../lib/web';
import { C, themed } from '../theme';

/** Where Google and email sign-in links come back to. */
function returnUrl(): string {
  return IS_WEB ? `${window.location.origin}/account` : Linking.createURL('/account');
}

function ago(at: number | null): string {
  if (!at) return 'Not synced yet';
  const min = Math.round((Date.now() - at) / 60_000);
  if (min < 1) return 'Synced just now';
  if (min < 60) return `Synced ${min} min ago`;
  return `Synced at ${fmtTime(at)}`;
}

export default function AccountScreen() {
  const { configured, email, status } = useSync();
  // On phones, an email link opens gawain://account?code=… and the code is exchanged here.
  const { code } = useLocalSearchParams<{ code?: string }>();
  useEffect(() => {
    if (!IS_WEB && code && supabase) supabase.auth.exchangeCodeForSession(code).catch(() => {});
  }, [code]);

  return (
    <Screen stack title="Account & sync" subtitle="Optional. Gawain works the same without an account.">
      {!configured ? (
        <Section>
          <Note>Sync isn't set up in this version of Gawain. Everything stays on this device.</Note>
        </Section>
      ) : email ? (
        status === 'choose' ? (
          <ChooseFirstSync />
        ) : (
          <SignedIn />
        )
      ) : (
        <SignIn />
      )}

      <Section title="What syncs">
        <Text style={styles.help}>
          Signed in, your chores, done history, pantry, grocery list, weekly meetings, work hours and smart-home triggers are kept in your account and synced
          between your phone and browsers. When two devices change the same thing, the later change wins.
        </Text>
        <Text style={[styles.help, { marginTop: 8 }]}>
          Staying on this device only: calendar links (they're secret), which phone calendars to read, saved home and store locations, the
          store each item is set to, timers, your smart-home link, theme and notification choices.
        </Text>
      </Section>
    </Screen>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const db = supabase!;

  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await f();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const google = () =>
    run(async () => {
      const redirectTo = returnUrl();
      if (IS_WEB) {
        const { error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
        if (error) throw error;
        return; // the page goes to Google and comes back signed in
      }
      const { data, error } = await db.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
      if (error) throw error;
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type !== 'success') return;
      const back = new URL(res.url).searchParams.get('code');
      if (!back) throw new Error('Google sign-in did not finish. Try again.');
      const { error: e2 } = await db.auth.exchangeCodeForSession(back);
      if (e2) throw e2;
    });

  const sendLink = () =>
    run(async () => {
      const to = email.trim();
      if (!/^\S+@\S+\.\S+$/.test(to)) throw new Error("That doesn't look like an email address.");
      const { error } = await db.auth.signInWithOtp({ email: to, options: { emailRedirectTo: returnUrl(), shouldCreateUser: true } });
      if (error) throw error;
      setSentTo(to);
    });

  const verify = () =>
    run(async () => {
      const { error } = await db.auth.verifyOtp({ email: sentTo!, token: token.trim(), type: 'email' });
      if (error) throw error;
    });

  return (
    <>
      <Section title="Sign in">
        <Text style={styles.help}>
          Sign in to back up your chores and groceries and use them on more than one device. Whatever is on this device now comes with you.
        </Text>
        <View style={{ marginTop: 14 }}>
          <Button icon="logo-google" kind="soft" label="Continue with Google" onPress={google} disabled={busy} />
        </View>
      </Section>
      <Section title="Or with email">
        {sentTo ? (
          <Card>
            <Text style={styles.body}>
              We sent a sign-in link to {sentTo}. Open it in this {IS_WEB ? 'browser' : 'phone'}; a link opened somewhere else signs in there
              instead. If the email has a code, you can type it here.
            </Text>
            <Field label="Code (if the email has one)" value={token} onChangeText={setToken} keyboardType="number-pad" autoComplete="one-time-code" maxLength={10} onSubmitEditing={verify} />
            <View style={styles.row}>
              <Button label="Sign in" onPress={verify} disabled={busy || token.trim().length < 6} />
              <Button kind="ghost" label="Use another email" onPress={() => setSentTo(null)} />
            </View>
          </Card>
        ) : (
          <>
            <Field
              placeholder="you@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              onSubmitEditing={sendLink}
            />
            <View style={styles.row}>
              <Button icon="mail-outline" label="Email me a sign-in link" onPress={sendLink} disabled={busy || !email.trim()} />
            </View>
          </>
        )}
        {error && <Text style={styles.error}>{error}</Text>}
      </Section>
    </>
  );
}

function SignedIn() {
  const { email, status, error, lastSyncedAt, pending } = useSync();
  const line =
    status === 'syncing'
      ? 'Syncing…'
      : status === 'offline'
        ? `Offline. ${pending ? `${pending} change${pending === 1 ? '' : 's'} will sync when you're back online.` : "Changes will sync when you're back online."}`
        : status === 'error'
          ? "Couldn't sync"
          : ago(lastSyncedAt);
  return (
    <Section title="Signed in">
      <Card>
        <Text style={styles.title}>{email}</Text>
        <Text style={styles.body}>{line}</Text>
        {status === 'error' && error && <Text style={styles.error}>{error}</Text>}
        <View style={styles.row}>
          <Button small kind="soft" icon="sync-outline" label="Sync now" onPress={() => syncNow()} disabled={status === 'syncing'} />
          <Button
            small
            kind="ghost"
            icon="log-out-outline"
            label="Sign out"
            onPress={async () => {
              if (await confirm('Sign out?', 'Everything stays on this device. It just stops syncing.', 'Sign out')) signOut();
            }}
          />
        </View>
      </Card>
    </Section>
  );
}

function ChooseFirstSync() {
  const email = useSync((s) => s.email);
  return (
    <Section title="Put your data together">
      <Card>
        <Text style={styles.title}>{email} already has chores or groceries</Text>
        <Text style={styles.body}>
          This device has some too. Combine them to keep both (anything that's on both stays as the account has it), or replace what's here
          with the account's.
        </Text>
        <View style={styles.row}>
          <Button label="Combine" icon="git-merge-outline" onPress={() => chooseFirstSync('merge')} />
          <Button
            kind="danger"
            label="Use the account's"
            onPress={async () => {
              if (await confirm("Replace this device's data?", "Chores, history, groceries and meetings here are replaced with the account's.", 'Replace')) {
                await chooseFirstSync('replace');
                router.replace('/');
              }
            }}
          />
        </View>
        <View style={{ marginTop: 6 }}>
          <Button small kind="ghost" label="Sign out instead" onPress={() => signOut()} />
        </View>
      </Card>
    </Section>
  );
}

const styles = themed(() => ({
  help: { color: C.muted, fontSize: 14, lineHeight: 20 },
  title: { color: C.text, fontSize: 16, fontWeight: '600' },
  body: { color: C.muted, fontSize: 14, lineHeight: 20, marginTop: 4 },
  error: { color: C.dangerText, fontSize: 13, marginTop: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
}));
