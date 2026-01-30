import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { tokenCache } from '../src/lib/clerk';
import { setSupabaseAuth } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';
import { useOfflineSync } from '../src/hooks/useOfflineSync';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { View } from 'react-native';

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { setAuth, setLoaded } = useAuthStore();

  // Initialize offline sync (processes pending uploads on reconnect)
  useOfflineSync();

  useEffect(() => {
    setLoaded(isLoaded);
  }, [isLoaded, setLoaded]);

  useEffect(() => {
    setAuth(isSignedIn ?? false, userId ?? null);
  }, [isSignedIn, userId, setAuth]);

  // Sync Clerk token with Supabase
  useEffect(() => {
    const syncToken = async () => {
      if (isSignedIn) {
        const token = await getToken({ template: 'supabase' });
        await setSupabaseAuth(token);
      } else {
        await setSupabaseAuth(null);
      }
    };

    syncToken();
  }, [isSignedIn, getToken]);

  return <>{children}</>;
}

export default function RootLayout() {
  return (
    <ClerkProvider publishableKey={clerkPublishableKey} tokenCache={tokenCache}>
      <AuthProvider>
        <View style={{ flex: 1 }}>
          <OfflineBanner />
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: '#FFFFFF',
              },
              headerTintColor: '#1A1A1A',
              headerTitleStyle: {
                fontWeight: '600',
              },
              headerShadowVisible: false,
              contentStyle: {
                backgroundColor: '#F9FAFB',
              },
            }}
          />
          <StatusBar style="dark" />
        </View>
      </AuthProvider>
    </ClerkProvider>
  );
}
