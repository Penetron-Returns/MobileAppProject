/**
 * NativeWind only maps `className` for React Native core components.
 * Register the third-party components the design system styles with classes.
 * Imported for its side effect by the package entry point.
 */
import { cssInterop } from 'nativewind';
import { SafeAreaView } from 'react-native-safe-area-context';

cssInterop(SafeAreaView, { className: 'style' });
