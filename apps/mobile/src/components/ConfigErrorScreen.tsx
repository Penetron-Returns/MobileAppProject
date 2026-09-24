import { AlertTriangle } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';

/**
 * Rendered instead of the app when a required `EXPO_PUBLIC_*` variable is
 * missing, so a bad `.env` fails loudly instead of crashing deep inside
 * Clerk/Supabase. Deliberately dependency-free (no NativeWind/Clerk) so it
 * always renders.
 */
export function ConfigErrorScreen({ missing }: { missing: string[] }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FB', paddingTop: 64 }}>
      <ScrollView contentContainerStyle={{ padding: 24, gap: 12 }}>
        <AlertTriangle size={28} color="#B42318" />
        <Text style={{ fontSize: 18, fontWeight: '700', color: '#101828' }}>
          Missing configuration
        </Text>
        <Text style={{ fontSize: 14, color: '#475467' }}>
          Add the following to a .env.local file at the project root (see
          .env.example), then restart the dev server:
        </Text>
        {missing.map((name) => (
          <Text
            key={name}
            style={{ fontFamily: 'Courier', fontSize: 13, color: '#B42318' }}
          >
            {name}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}
