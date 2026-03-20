import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';
import { PostHogProvider, usePostHog } from 'posthog-react-native';
import { tokenCache } from '../src/lib/clerk';
import { setSupabaseAuth } from '../src/lib/supabase';
import { useAuthStore } from '../src/stores/authStore';
import { useOfflineSync } from '../src/hooks/useOfflineSync';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { View } from 'react-native';

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY!;
const posthogApiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY || '';
const posthogHost = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

function AuthProvider({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth();
  const { setAuth, setLoaded } = useAuthStore();
  const posthog = usePostHog();

  // Initialize offline sync (processes pending uploads on reconnect)
  useOfflineSync();

  useEffect(() => {
    setLoaded(isLoaded);
  }, [isLoaded, setLoaded]);

  useEffect(() => {
    setAuth(isSignedIn ?? false, userId ?? null);
  }, [isSignedIn, userId, setAuth]);

  // Identify user in PostHog
  useEffect(() => {
    if (isSignedIn && userId && posthog) {
      posthog.identify(userId);
    } else if (!isSignedIn && posthog) {
      posthog.reset();
    }
  }, [isSignedIn, userId, posthog]);

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

function AppContent() {
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

export default function RootLayout() {
  if (!posthogApiKey) {
    return <AppContent />;
  }

  return (
    <PostHogProvider
      apiKey={posthogApiKey}
      options={{ host: posthogHost }}
    >
      <AppContent />
    </PostHogProvider>
  );
}
