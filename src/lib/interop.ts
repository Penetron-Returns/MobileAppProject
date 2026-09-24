/**
 * NativeWind only maps `className` for React Native core components.
 * Register the third-party components we style with classes.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { cssInterop } from 'nativewind';
import { SafeAreaView } from 'react-native-safe-area-context';

cssInterop(SafeAreaView, { className: 'style' });
cssInterop(LinearGradient, { className: 'style' });
