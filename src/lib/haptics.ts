import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function haptic() {
  if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
