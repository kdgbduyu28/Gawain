import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Button, Card, Chip, Chips, Field, Icon, Label, Note, Screen, Section, ToggleRow } from '../components/bits';
import { LOCATION_SUPPORTED, currentPosition, locationAccess } from '../lib/places';
import { notificationAccess } from '../lib/push';
import { useHome } from '../store/useHome';
import { C, R, themed } from '../theme';

const RADII = [100, 150, 250];

export default function PlacesScreen() {
  const places = useHome((s) => s.places);
  const awayReminders = useHome((s) => s.settings.awayReminders);
  const { savePlace, removePlace, setSettings } = useHome.getState();
  const [storeName, setStoreName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const home = places.find((p) => p.kind === 'home');
  const stores = places.filter((p) => p.kind === 'store');

  const saveHere = async (kind: 'home' | 'store', name: string) => {
    setBusy(true);
    setError(null);
    try {
      const pos = await currentPosition();
      if (!pos) {
        setError('Location permission is off. Turn it on for Gawain in your phone settings.');
        return;
      }
      savePlace({ ...(kind === 'home' ? { id: 'home' } : {}), kind, name, ...pos, radius: kind === 'home' ? 150 : 100 });
      if (kind === 'store') setStoreName('');
    } catch {
      setError("Couldn't get your location. Try again outside or near a window.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen stack title="Away from home">
      {!LOCATION_SUPPORTED && <Note>This works in the phone app only. Browsers can't tell when you leave home.</Note>}

      <Section>
        <Card>
          <ToggleRow
            label="Remind me when I'm out"
            hint="Your grocery list and errands when you leave home, and that store's items when you arrive at one"
            value={awayReminders}
            disabled={!LOCATION_SUPPORTED}
            onChange={async (v) => {
              if (v) {
                await notificationAccess(true);
                const access = await locationAccess(true);
                if (access !== 'always') {
                  setError('Gawain needs location set to "Always" so the phone can tell it when you leave, even when the app is closed. Change it in Settings → Gawain → Location.');
                  return;
                }
              }
              setError(null);
              setSettings({ awayReminders: v });
            }}
          />
          <Text style={styles.help}>Your location stays on this phone. The phone itself watches for you crossing the edge of these places, so battery use is low.</Text>
        </Card>
        {error && <Note icon="alert-circle-outline">{error}</Note>}
      </Section>

      <Section title="Home">
        {home ? (
          <PlaceRow name="Home" meta={`${home.radius} m around the spot you saved`} radius={home.radius} onRadius={(radius) => savePlace({ ...home, radius })} onRemove={() => removePlace(home.id)} />
        ) : (
          <Text style={styles.help}>Not set yet.</Text>
        )}
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          <Button small kind="soft" icon="home-outline" label={home ? "Update: I'm home now" : "Set: I'm home now"} disabled={!LOCATION_SUPPORTED || busy} onPress={() => saveHere('home', 'Home')} />
        </View>
      </Section>

      <Section title={`Stores (${stores.length}/19)`}>
        {stores.map((s) => (
          <PlaceRow key={s.id} name={s.name} meta={`${s.radius} m`} radius={s.radius} onRadius={(radius) => savePlace({ ...s, radius })} onRemove={() => removePlace(s.id)} />
        ))}
        <Card>
          <Text style={styles.title}>At a store right now?</Text>
          <Text style={styles.help}>Save it, and next time you walk in Gawain shows what to buy there.</Text>
          <Field label="Store name" value={storeName} onChangeText={setStoreName} placeholder="e.g. Puregold Taft" />
          <View style={{ flexDirection: 'row', marginTop: 12 }}>
            <Button
              small
              icon="storefront-outline"
              label="Save this store"
              disabled={!LOCATION_SUPPORTED || busy || !storeName.trim() || stores.length >= 19}
              onPress={() => saveHere('store', storeName.trim())}
            />
          </View>
        </Card>
      </Section>
    </Screen>
  );
}

function PlaceRow({ name, meta, radius, onRadius, onRemove }: { name: string; meta: string; radius: number; onRadius: (r: number) => void; onRemove: () => void }) {
  return (
    <View style={styles.row}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.help}>{meta}</Text>
        </View>
        <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${name}`}>
          <Icon name="trash-outline" size={20} color={C.muted} />
        </Pressable>
      </View>
      <View style={{ marginTop: 10 }}>
        <Label>Size</Label>
        <Chips>
          {RADII.map((r) => (
            <Chip key={r} label={`${r} m`} active={radius === r} onPress={() => onRadius(r)} />
          ))}
        </Chips>
      </View>
    </View>
  );
}

const styles = themed(() => ({
  help: { fontSize: 13, color: C.muted, marginTop: 4, lineHeight: 18 },
  title: { fontSize: 16, fontWeight: '600', color: C.text },
  row: { backgroundColor: C.card, borderWidth: 1, borderColor: C.line, borderRadius: R.lg, padding: 12, marginBottom: 8 },
}));
