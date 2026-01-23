import { View, Text, StyleSheet, Platform } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';

export default function Success() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();

  const handleNewVisit = () => {
    router.replace('/new-visit');
  };

  const handleGoHome = () => {
    router.replace('/home');
  };

  const noteUrl = params.token
    ? `${process.env.EXPO_PUBLIC_WEB_URL}/note/${params.token}`
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="checkmark-circle" size={80} color="#16A34A" />
        </View>

        <Text style={styles.title}>Visit Complete!</Text>
        <Text style={styles.subtitle}>
          The patient note has been sent via WhatsApp
        </Text>

        <Card style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="logo-whatsapp" size={24} color="#25D366" />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Message Sent</Text>
              <Text style={styles.cardDescription}>
                Patient will receive a link to view their visit summary
              </Text>
            </View>
          </View>
        </Card>

        <Card style={styles.card}>
          <View style={styles.cardRow}>
            <Ionicons name="document-text" size={24} color="#2563EB" />
            <View style={styles.cardText}>
              <Text style={styles.cardTitle}>Notes Finalized</Text>
              <Text style={styles.cardDescription}>
                Provider and patient notes saved to visit record
              </Text>
            </View>
          </View>
        </Card>

        {noteUrl && (
          <Card style={styles.linkCard}>
            <Text style={styles.linkLabel}>Patient Note Link:</Text>
            <Text style={styles.linkUrl} numberOfLines={1}>
              {noteUrl}
            </Text>
          </Card>
        )}
      </View>

      <View style={styles.buttons}>
        <Button
          title="Start New Visit"
          onPress={handleNewVisit}
          size="large"
        />

        <Button
          title="Go to Home"
          variant="ghost"
          onPress={handleGoHome}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconContainer: {
    marginBottom: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 32,
  },
  card: {
    width: '100%',
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  cardText: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  cardDescription: {
    fontSize: 14,
    color: '#6B7280',
  },
  linkCard: {
    width: '100%',
    backgroundColor: '#F3F4F6',
    marginTop: 12,
  },
  linkLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  linkUrl: {
    fontSize: 14,
    color: '#2563EB',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  buttons: {
    padding: 24,
    gap: 12,
  },
});
