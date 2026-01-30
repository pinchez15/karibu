import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Card } from '../src/components/Card';
import { QueueItemComponent } from '../src/components/QueueItem';
import { useAuthStore } from '../src/stores/authStore';
import {
  getClinicQueue,
  getQueueStats,
  claimPatient,
  assignToNurse,
  markReadyForDoctor,
  subscribeToQueueUpdates,
} from '../src/lib/queue';
import type { QueueItem, QueueStatus } from '@karibu/shared';

type FilterTab = 'all' | 'waiting' | 'ready' | 'mine';

export default function Queue() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [stats, setStats] = useState({
    waiting: 0,
    withNurse: 0,
    readyForDoctor: 0,
    withDoctor: 0,
    completed: 0,
    averageWaitMinutes: 0,
  });
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  const isDoctor = staff?.role === 'doctor' || staff?.role === 'admin';
  const isNurse = staff?.role === 'nurse' || staff?.role === 'admin';

  const fetchQueue = useCallback(async () => {
    try {
      const [queueData, statsData] = await Promise.all([
        getClinicQueue(),
        getQueueStats(),
      ]);
      setQueue(queueData);
      setStats(statsData);
    } catch (error) {
      console.error('Failed to fetch queue:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchQueue();

    // Subscribe to real-time updates
    const unsubscribe = subscribeToQueueUpdates(() => {
      fetchQueue();
    });

    return () => unsubscribe();
  }, [fetchQueue]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchQueue();
    setRefreshing(false);
  }, [fetchQueue]);

  const handleClaimAsNurse = async (visitId: string) => {
    try {
      await assignToNurse(visitId);
      await fetchQueue();
    } catch (error) {
      Alert.alert('Error', 'Failed to claim patient');
    }
  };

  const handleMarkReady = async (visitId: string) => {
    try {
      await markReadyForDoctor(visitId);
      await fetchQueue();
    } catch (error) {
      Alert.alert('Error', 'Failed to mark patient ready');
    }
  };

  const handleClaimAsDoctor = async (visitId: string) => {
    try {
      await claimPatient(visitId);
      await fetchQueue();
      // Navigate to recording flow
      router.push(`/consent?visitId=${visitId}`);
    } catch (error) {
      Alert.alert('Error', 'Failed to claim patient');
    }
  };

  const filteredQueue = queue.filter((item) => {
    switch (activeTab) {
      case 'waiting':
        return item.queue_status === 'waiting';
      case 'ready':
        return item.queue_status === 'ready_for_doctor';
      case 'mine':
        return (
          (isDoctor && item.doctor_id === staff?.id) ||
          (isNurse && item.nurse_id === staff?.id)
        );
      default:
        return true;
    }
  });

  const renderQueueItem = ({ item }: { item: QueueItem }) => {
    let showClaimButton = false;
    let claimLabel = '';
    let onClaim: (() => void) | undefined;

    if (isNurse && item.queue_status === 'waiting') {
      showClaimButton = true;
      claimLabel = 'Start Intake';
      onClaim = () => handleClaimAsNurse(item.visit_id);
    } else if (isNurse && item.queue_status === 'with_nurse' && item.nurse_id === staff?.id) {
      showClaimButton = true;
      claimLabel = 'Ready for Doctor';
      onClaim = () => handleMarkReady(item.visit_id);
    } else if (isDoctor && item.queue_status === 'ready_for_doctor') {
      showClaimButton = true;
      claimLabel = 'Start Visit';
      onClaim = () => handleClaimAsDoctor(item.visit_id);
    }

    return (
      <QueueItemComponent
        item={item}
        showClaimButton={showClaimButton}
        claimLabel={claimLabel}
        onClaim={onClaim}
        onPress={() => {
          // Navigate to visit details or appropriate screen
          if (item.doctor_id === staff?.id && item.queue_status === 'with_doctor') {
            router.push(`/consent?visitId=${item.visit_id}`);
          }
        }}
      />
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text>Loading queue...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Stats Cards */}
      <View style={styles.statsRow}>
        <Card style={[styles.statCard, { backgroundColor: '#FEF3C7' }]}>
          <Text style={styles.statNumber}>{stats.waiting}</Text>
          <Text style={styles.statLabel}>Waiting</Text>
        </Card>
        <Card style={[styles.statCard, { backgroundColor: '#DCFCE7' }]}>
          <Text style={styles.statNumber}>{stats.readyForDoctor}</Text>
          <Text style={styles.statLabel}>Ready</Text>
        </Card>
        <Card style={[styles.statCard, { backgroundColor: '#EDE9FE' }]}>
          <Text style={styles.statNumber}>{stats.withDoctor}</Text>
          <Text style={styles.statLabel}>In Progress</Text>
        </Card>
        <Card style={[styles.statCard, { backgroundColor: '#F3F4F6' }]}>
          <Text style={styles.statNumber}>{stats.averageWaitMinutes}m</Text>
          <Text style={styles.statLabel}>Avg Wait</Text>
        </Card>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabs}>
        {(['all', 'waiting', 'ready', 'mine'] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
              {tab === 'all' ? 'All' : tab === 'waiting' ? 'Waiting' : tab === 'ready' ? 'Ready' : 'My Patients'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Queue List */}
      <FlatList
        data={filteredQueue}
        renderItem={renderQueueItem}
        keyExtractor={(item) => item.visit_id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={48} color="#D1D5DB" />
            <Text style={styles.emptyText}>
              {activeTab === 'all'
                ? 'No patients in queue'
                : activeTab === 'waiting'
                ? 'No patients waiting'
                : activeTab === 'ready'
                ? 'No patients ready for doctor'
                : 'No patients assigned to you'}
            </Text>
          </View>
        }
      />

      {/* Check-in FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/check-in')}
      >
        <Ionicons name="person-add" size={24} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    padding: 12,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 2,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    marginBottom: 8,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  activeTab: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
  },
  tabText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#FFFFFF',
  },
  list: {
    padding: 16,
    paddingBottom: 100,
  },
  empty: {
    alignItems: 'center',
    marginTop: 60,
  },
  emptyText: {
    color: '#9CA3AF',
    marginTop: 12,
    fontSize: 15,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563EB',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
});
