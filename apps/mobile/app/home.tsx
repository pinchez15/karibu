import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { useAuthStore } from '../src/stores/authStore';
import { useVisitStore } from '../src/stores/visitStore';
import { getOrCreateStaff, getRecentVisits } from '../src/lib/api';
import { useNetworkState } from '../src/hooks/useNetworkState';
import type { Visit } from '@karibu/shared';

export default function Home() {
  const router = useRouter();
  const { signOut } = useAuth();
  const { user } = useUser();
  const { clerkUserId, staff, setStaff } = useAuthStore();
  const { recentVisits, setRecentVisits, pendingUploads, isOnline } = useVisitStore();
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  useNetworkState();

  // Initialize staff on mount
  useEffect(() => {
    const initStaff = async () => {
      if (!clerkUserId || !user) return;

      try {
        const staffData = await getOrCreateStaff(
          clerkUserId,
          user.primaryEmailAddress?.emailAddress || '',
          user.fullName || user.firstName || 'Doctor'
        );
        setStaff(staffData);
      } catch (error) {
        console.error('Failed to initialize staff:', error);
      } finally {
        setLoading(false);
      }
    };

    initStaff();
  }, [clerkUserId, user, setStaff]);

  // Fetch recent visits
  const fetchVisits = useCallback(async () => {
    if (!staff?.id) return;

    try {
      const visits = await getRecentVisits(staff.id);
      setRecentVisits(visits);
    } catch (error) {
      console.error('Failed to fetch visits:', error);
    }
  }, [staff?.id, setRecentVisits]);

  useEffect(() => {
    if (staff?.id && isOnline) {
      fetchVisits();
    }
  }, [staff?.id, isOnline, fetchVisits]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchVisits();
    setRefreshing(false);
  }, [fetchVisits]);

  const handleNewVisit = () => {
    router.push('/new-visit');
  };

  const handleSignOut = async () => {
    await signOut();
    router.replace('/sign-in');
  };

  const renderVisitItem = ({ item }: { item: Visit }) => {
    const statusColors: Record<string, string> = {
      recording: '#F59E0B',
      uploading: '#3B82F6',
      processing: '#8B5CF6',
      review: '#2563EB',
      sent: '#16A34A',
      completed: '#6B7280',
    };

    return (
      <TouchableOpacity
        onPress={() => {
          if (item.status === 'review') {
            router.push(`/review?visitId=${item.id}`);
          } else if (item.status === 'processing') {
            router.push(`/processing?visitId=${item.id}`);
          }
        }}
      >
        <Card style={styles.visitCard}>
          <View style={styles.visitHeader}>
            <Text style={styles.visitDate}>
              {new Date(item.visit_date).toLocaleDateString()}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusColors[item.status] || '#6B7280' },
              ]}
            >
              <Text style={styles.statusText}>{item.status}</Text>
            </View>
          </View>
          <Text style={styles.visitPatient}>
            {(item as any).patient?.display_name || 'Unknown Patient'}
          </Text>
          <Text style={styles.visitPhone}>
            {(item as any).patient?.whatsapp_number}
          </Text>
        </Card>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>
            Hello, {staff?.display_name || 'Doctor'}
          </Text>
          <Text style={styles.clinicName}>Karibu Demo Clinic</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut}>
          <Ionicons name="log-out-outline" size={24} color="#6B7280" />
        </TouchableOpacity>
      </View>

      {pendingUploads.length > 0 && (
        <Card style={styles.pendingCard}>
          <View style={styles.pendingRow}>
            <Ionicons name="cloud-upload" size={20} color="#F59E0B" />
            <Text style={styles.pendingText}>
              {pendingUploads.length} recording{pendingUploads.length > 1 ? 's' : ''} pending upload
            </Text>
          </View>
        </Card>
      )}

      <Button
        title="New Visit"
        onPress={handleNewVisit}
        size="large"
        style={styles.newVisitButton}
      />

      <Text style={styles.sectionTitle}>Recent Visits</Text>

      <FlatList
        data={recentVisits}
        renderItem={renderVisitItem}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>
            No visits yet. Tap "New Visit" to get started.
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 16,
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  clinicName: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  pendingCard: {
    backgroundColor: '#FEF3C7',
    marginBottom: 16,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pendingText: {
    color: '#92400E',
    fontWeight: '500',
  },
  newVisitButton: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  list: {
    paddingBottom: 24,
  },
  visitCard: {
    marginBottom: 12,
  },
  visitHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  visitDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  visitPatient: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  visitPhone: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#6B7280',
    marginTop: 32,
  },
});
