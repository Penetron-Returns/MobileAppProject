import { BlurView } from 'expo-blur';
import * as React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable as RNPressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KEYBOARD_AVOIDING_BEHAVIOR } from '../lib/keyboard';
import { Pressable } from '../primitives/Pressable';
import { Text } from '../primitives/Text';
import { useDepth } from '../theme/useDepth';
import { withAlpha } from '../tokens/depth';
import { useDsText } from '../lib/strings';

/** The sheet stops 8pt above the status bar's bottom edge (board: top 54 on a 62pt inset). */
const TOP_OVERLAP = 8;
/** Height of the pinned footer (board: 96). */
const FOOTER_HEIGHT = 96;

export interface FormSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Pinned at the bottom over a frosted fade (the Save button). */
  footer?: React.ReactNode;
  /** Label of the tint button at the top left; defaults to "Cancel". */
  cancelLabel?: string;
  children: React.ReactNode;
}

/**
 * The full-height form sheet of the boards (Edit service): a lit sheet with a
 * grabber, "Cancel" and a centred title, a scrolling body and a pinned footer.
 * Slides over the screen and dims it.
 */
export function FormSheet({
  open,
  onClose,
  title,
  footer,
  cancelLabel,
  children,
}: FormSheetProps) {
  const t = useDsText();
  const depth = useDepth();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: depth.scrim }}>
        <RNPressable
          accessible={false}
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <KeyboardAvoidingView
          behavior={KEYBOARD_AVOIDING_BEHAVIOR}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            top: Math.max(insets.top - TOP_OVERLAP, 0),
          }}
        >
          <View
            accessibilityViewIsModal
            style={[
              depth.sheet,
              {
                flex: 1,
                borderTopLeftRadius: 34,
                borderTopRightRadius: 34,
                overflow: 'hidden',
              },
            ]}
          >
            <View
              style={{ backgroundColor: depth.grabber }}
              className="mx-auto mt-2 h-[5px] w-9 rounded-[3px]"
            />
            <View className="relative h-[52px] items-center justify-center">
              <Pressable
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={cancelLabel ?? t('common.cancel')}
                className="absolute left-2 top-1.5 h-10 min-w-11 justify-center px-3"
                hitSlop={{ top: 2, bottom: 2 }}
              >
                <Text
                  style={{ color: depth.colors.tint }}
                  className="text-title"
                >
                  {cancelLabel ?? t('common.cancel')}
                </Text>
              </Pressable>
              <Text
                role="heading"
                aria-level="1"
                numberOfLines={1}
                className="mx-24 text-title font-semibold"
              >
                {title}
              </Text>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{
                paddingTop: 8,
                paddingHorizontal: 20,
                paddingBottom:
                  (footer ? FOOTER_HEIGHT + insets.bottom : 0) + 34,
              }}
            >
              {children}
            </ScrollView>
            {footer ? (
              <View
                style={[
                  depth.sheetFade,
                  // Blur is unreliable behind scrolling content on Android: sit on the
                  // opaque ground there so rows never show through. A hairline
                  // separates the footer from the list on both.
                  Platform.OS === 'ios'
                    ? null
                    : { backgroundColor: depth.ground.backgroundColor },
                  {
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: withAlpha(depth.colors.label, 0.12),
                  },
                  {
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    minHeight: FOOTER_HEIGHT,
                    paddingTop: 8,
                    paddingHorizontal: 20,
                    paddingBottom: insets.bottom,
                  },
                ]}
              >
                {Platform.OS === 'ios' ? (
                  <BlurView
                    intensity={30}
                    tint={
                      depth.scheme === 'dark'
                        ? 'systemChromeMaterialDark'
                        : 'systemChromeMaterialLight'
                    }
                    style={StyleSheet.absoluteFill}
                    pointerEvents="none"
                  />
                ) : null}
                {footer}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
