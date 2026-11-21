/** Fullscreen image viewer (modal). Tap anywhere or the close button to dismiss. */
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { de } from '@/i18n/de';
import { Glass } from '@/ui/Glass';
import { Icon } from '@/ui/Icon';
import { radii, spacing } from '@/ui/theme';

export function ImageViewer({ uri, onClose }: { uri: string | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={uri != null}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={de.common.close}>
        {uri ? <Image source={{ uri }} style={styles.image} contentFit="contain" transition={150} /> : null}
      </Pressable>
      <View style={[styles.closeWrap, { top: insets.top + spacing.sm }]} pointerEvents="box-none">
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={de.common.close} hitSlop={10}>
          <Glass interactive radius={radii.pill} style={styles.close}>
            <Icon name="close" size={18} color="#fff" />
          </Glass>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.94)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  closeWrap: { position: 'absolute', right: spacing.lg },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
