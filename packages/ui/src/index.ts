/**
 * @booking/ui: the Booking design system. Import everything from here, for
 * example `import { Button, Page, useDepth } from '@booking/ui'`. Deep imports
 * of package internals are blocked by lint (docs/design-system.md).
 */
import './lib/interop';

// Tokens
export { COLOR_ROLES, THEME, cssVariable, hsl } from './tokens/colors';
export type { ColorRole, ColorScheme, ThemeColors } from './tokens/colors';
export {
  SYSTEM_COLORS,
  SYSTEM_COLOR_KEYS,
  SYSTEM_TINT,
  darken,
  getDepth,
  lighten,
  resolveSystemColor,
  systemColorKey,
  withAlpha,
} from './tokens/depth';
export type {
  CapsuleColors,
  CapsuleToneKey,
  DepthColors,
  DepthScheme,
  DepthTokens,
  SystemColorKey,
} from './tokens/depth';
export {
  BEZIER,
  DURATION,
  EASING,
  MOTION,
  SCALE,
  SPRING,
  STAGGER,
  TOAST_TTL,
  springConfig,
  staggerDelay,
  timingConfig,
} from './tokens/motion';
export { RADII } from './tokens/radii';
export type { RadiusStep } from './tokens/radii';
export { LAYOUT, SPACING } from './tokens/spacing';
export { TYPE_SCALE } from './tokens/typography';
export type { TypeStep } from './tokens/typography';
export { Z_INDEX } from './tokens/zIndex';

// Theme
export {
  useAppColorScheme,
  useRestoreColorScheme,
} from './theme/useAppColorScheme';
export { SchemeScope } from './theme/SchemeScope';
export { useDepth } from './theme/useDepth';
export { useReduceMotion } from './theme/useReduceMotion';

// Utilities
export { cn } from './lib/cn';
export { initials } from './lib/initials';
export { DS_STRINGS } from './lib/strings';
export {
  KEYBOARD_AVOIDING_BEHAVIOR,
  keyboardAvoidingBehavior,
} from './lib/keyboard';
export type { DsStringKey } from './lib/strings';

// Primitives
export { Divider } from './primitives/Divider';
export { Ground } from './primitives/Ground';
export { Icon } from './primitives/Icon';
export { NativeOnlyAnimatedView } from './primitives/NativeOnlyAnimatedView';
export { Pressable } from './primitives/Pressable';
export type { PressableProps } from './primitives/Pressable';
export { Skeleton } from './primitives/Skeleton';
export { Surface } from './primitives/Surface';
export type { SurfaceProps, SurfaceVariant } from './primitives/Surface';
export { Text, TextClassContext, TextStyleContext } from './primitives/Text';

// Components
export { Avatar } from './components/Avatar';
export type { AvatarProps, AvatarSize } from './components/Avatar';
export {
  Button,
  buttonTextVariants,
  buttonVariants,
} from './components/Button';
export type { ButtonProps } from './components/Button';
export { Capsule } from './components/Capsule';
export { ColorSwatches } from './components/ColorSwatches';
export type { ColorSwatchesProps } from './components/ColorSwatches';
export type { CapsuleProps, CapsuleTone } from './components/Capsule';
export { ChoiceCard } from './components/ChoiceCard';
export type { ChoiceCardProps } from './components/ChoiceCard';
export { Chip, Chips } from './components/Chips';
export type { ChipOption, ChipProps, ChipsProps } from './components/Chips';
export { ConfirmDialog } from './components/ConfirmDialog';
export { DestructiveRow } from './components/DestructiveRow';
export type { DestructiveRowProps } from './components/DestructiveRow';
export { Disclosure } from './components/Disclosure';
export { Reveal } from './components/Reveal';
export type { RevealProps } from './components/Reveal';
export { Turn } from './components/Turn';
export type { TurnProps } from './components/Turn';
export type { DisclosureProps } from './components/Disclosure';
export { DoneCard } from './components/DoneCard';
export type { DoneCardProps } from './components/DoneCard';
export { FormField } from './components/FormField';
export { GLYPHS } from './components/Glyph';
export type { GlyphComponent, GlyphProps } from './components/Glyph';
export { FormSheet } from './components/FormSheet';
export type { FormSheetProps } from './components/FormSheet';
export { Group, GroupBlock, GroupRow, SectionTitle } from './components/Group';
export type { GroupProps, GroupRowProps } from './components/Group';
export { GroupField } from './components/GroupField';
export type { GroupFieldProps } from './components/GroupField';
export { IconButton } from './components/IconButton';
export type { IconButtonProps } from './components/IconButton';
export { IconDome } from './components/IconDome';
export type { IconDomeProps } from './components/IconDome';
export { InlineInsetInput } from './components/InlineInsetInput';
export type { InlineInsetInputProps } from './components/InlineInsetInput';
export { AmountInsetField, LabeledInsetField } from './components/InsetFields';
export { InsetInput } from './components/InsetInput';
export type { InsetInputProps } from './components/InsetInput';
export { MonthGrid } from './components/MonthGrid';
export type { MonthCell, MonthGridProps } from './components/MonthGrid';
export { OptionSheet } from './components/OptionSheet';
export type { SheetOption } from './components/OptionSheet';
export { SearchField } from './components/SearchField';
export type { SearchFieldProps } from './components/SearchField';
export { SegmentedControl } from './components/SegmentedControl';
export type {
  SegmentedControlProps,
  SegmentedOption,
} from './components/SegmentedControl';
export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
} from './components/Sheet';
export { DayChips, SlotSkeleton, TimeChips } from './components/SlotPicker';
export type {
  DayChipsProps,
  SlotDay,
  SlotTime,
  TimeChipsProps,
} from './components/SlotPicker';
export { Stepper } from './components/Stepper';
export type { StepperProps } from './components/Stepper';
export { CheckPoint, SuccessMark } from './components/SuccessMark';
export { Switch } from './components/Switch';
export type { SwitchProps } from './components/Switch';
export { SwitchRow } from './components/SwitchRow';
export type { SwitchRowProps } from './components/SwitchRow';
export { TimeField } from './components/TimeField';
export type { TimeFieldProps } from './components/TimeField';
export { TimeWheel } from './components/TimeWheel';
export type { TimeWheelProps } from './components/TimeWheel';
export { TintLink } from './components/TintLink';
export type { TintLinkProps } from './components/TintLink';
export { Toaster } from './components/Toast';
export { dismissToast, showToast, useToasts } from './components/toastStore';
export type { ToastInput, ToastItem, ToastKind } from './components/toastStore';

// Patterns
export { BackPill } from './patterns/BackPill';
export type { BackPillProps } from './patterns/BackPill';
export {
  FlowCaption,
  FlowFooter,
  FlowHeading,
  FlowTopBar,
} from './patterns/Flow';
export { GLASS_NAV_HEIGHT, GlassPage } from './patterns/GlassPage';
export type { GlassPageProps } from './patterns/GlassPage';
export { goBack } from './patterns/navigation';
export { Page } from './patterns/Page';
export type { PageProps } from './patterns/Page';
export { Presenter } from './patterns/Presenter';
export { SaveFooter } from './patterns/SaveFooter';
export { Screen } from './patterns/Screen';
export { StackHeader } from './patterns/StackHeader';
export type { StackHeaderProps } from './patterns/StackHeader';
export { BlockedActionSheet } from './patterns/states/BlockedActionSheet';
export { ErrorState } from './patterns/states/ErrorState';
export type { ErrorStateProps } from './patterns/states/ErrorState';
export { ListSkeleton } from './patterns/states/ListSkeleton';
export { OfflineBanner } from './patterns/states/OfflineBanner';
export type { OfflineBannerProps } from './patterns/states/OfflineBanner';
export {
  CenteredSpinner,
  EmptyState,
  LoadingCard,
} from './patterns/states/States';
export type { EmptyStateProps } from './patterns/states/States';
export { useOfflineGuard } from './patterns/states/useOfflineGuard';
export { FloatingTabBar } from './patterns/tab-bar/FloatingTabBar';
export type { CenterAction } from './patterns/tab-bar/FloatingTabBar';
export { CompanionDome } from './patterns/tab-bar/CompanionDome';
export type { CompanionDomeProps } from './patterns/tab-bar/CompanionDome';
export { InboxDome } from './patterns/tab-bar/InboxDome';
export type { InboxDomeProps } from './patterns/tab-bar/InboxDome';
export {
  INBOX_DOME_CLEARANCE,
  INBOX_DOME_GAP,
  INBOX_DOME_SIZE,
  TAB_BAR_HEIGHT,
  isTabRootPath,
  tabBarBottomOffset,
  tabBarClearance,
} from './patterns/tab-bar/layout';

// react-native-reusables base (shadcn for RN), wrapped by the design system.
export * from './rnr/accordion';
export * from './rnr/alert';
export * from './rnr/alert-dialog';
export * from './rnr/aspect-ratio';
export * from './rnr/badge';
export * from './rnr/card';
export * from './rnr/checkbox';
export * from './rnr/collapsible';
export * from './rnr/context-menu';
export * from './rnr/dialog';
export * from './rnr/dropdown-menu';
export * from './rnr/hover-card';
export * from './rnr/input';
export * from './rnr/label';
export * from './rnr/menubar';
export * from './rnr/popover';
export * from './rnr/progress';
export * from './rnr/radio-group';
export * from './rnr/select';
export * from './rnr/separator';
export * from './rnr/tabs';
export * from './rnr/textarea';
export * from './rnr/toggle';
export * from './rnr/toggle-group';
export * from './rnr/tooltip';

// Haptics and title collapse
export { haptics } from './lib/haptics';
export {
  COLLAPSE_FADE,
  collapseThreshold,
  titleCollapse,
} from './lib/titleCollapse';
export {
  AnimatedScrollView,
  CollapsingBar,
  NAV_ROW_HEIGHT,
  useTitleCollapse,
} from './patterns/CollapsingTitle';
