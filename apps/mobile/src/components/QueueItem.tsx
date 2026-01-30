import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import type { QueueItem as QueueItemType, QueueStatus, VisitPriority } from '@karibu/shared';

interface QueueItemProps {
  item: QueueItemType;
  onPress?: () => void;
  onClaim?: () => void;
  showClaimButton?: boolean;
  claimLabel?: string;
}

const queueStatusConfig: Record<QueueStatus, { label: string; color: string; bg: string }> = {
  waiting: { label: 'Waiting', color: '#92400E', bg: '#FEF3C7' },
  with_nurse: { label: 'With Nurse', color: '#1E40AF', bg: '#DBEAFE' },
  ready_for_doctor: { label: 'Ready', color: '#166534', bg: '#DCFCE7' },
  with_doctor: { label: 'In Progress', color: '#7C3AED', bg: '#EDE9FE' },
  completed: { label: 'Completed', color: '#4B5563', bg: '#F3F4F6' },
  cancelled: { label: 'Cancelled', color: '#991B1B', bg: '#FEE2E2' },
};

const priorityConfig: Record<VisitPriority, { icon: string; color: string }> = {
  low: { icon: 'arrow-down', color: '#6B7280' },
  normal: { icon: 'remove', color: '#3B82F6' },
  high: { icon: 'arrow-up', color: '#F59E0B' },
  urgent: { icon: 'alert-circle', color: '#EF4444' },
};

export function QueueItemComponent({
  item,
  onPress,
  onClaim,
  showClaimButton = false,
  claimLabel = 'Claim',
}: QueueItemProps) {
  const statusConfig = queueStatusConfig[item.queue_status];
  const priority = priorityConfig[item.priority];

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <Card style={styles.card} variant="elevated">
        <View style={styles.header}>
          <View style={styles.queuePosition}>
            <Text style={styles.positionNumber}>#{item.queue_position}</Text>
          </View>
          <View style={[styles.statusBadge, { backgroundColor: statusConfig.bg }]}>
            <Text style={[styles.statusText, { color: statusConfig.color }]}>
              {statusConfig.label}
            </Text>
          </View>
        </View>

        <View style={styles.content}>
          <View style={styles.patientInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.patientName}>
                {item.patient_name || 'Unknown Patient'}
              </Text>
              {item.priority !== 'normal' && (
                <Ionicons
                  name={priority.icon as any}
                  size={16}
                  color={priority.color}
                  style={styles.priorityIcon}
                />
              )}
            </View>
            <Text style={styles.patientPhone}>
              {item.patient_phone.replace(/(\+\d{3})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4')}
            </Text>
          </View>

          {item.chief_complaint && (
            <View style={styles.complaint}>
              <Text style={styles.complaintLabel}>Chief Complaint:</Text>
              <Text style={styles.complaintText} numberOfLines={2}>
                {item.chief_complaint}
              </Text>
            </View>
          )}

          <View style={styles.footer}>
            <View style={styles.waitTime}>
              <Ionicons name="time-outline" size={14} color="#6B7280" />
              <Text style={styles.waitTimeText}>
                {item.wait_minutes < 60
                  ? `${item.wait_minutes} min`
                  : `${Math.floor(item.wait_minutes / 60)}h ${item.wait_minutes % 60}m`}
              </Text>
            </View>

            {item.nurse_name && (
              <View style={styles.staffInfo}>
                <Ionicons name="medkit-outline" size={14} color="#6B7280" />
                <Text style={styles.staffName}>{item.nurse_name}</Text>
              </View>
            )}

            {item.doctor_name && (
              <View style={styles.staffInfo}>
                <Ionicons name="person-outline" size={14} color="#6B7280" />
                <Text style={styles.staffName}>{item.doctor_name}</Text>
              </View>
            )}
          </View>
        </View>

        {showClaimButton && onClaim && (
          <TouchableOpacity style={styles.claimButton} onPress={onClaim}>
            <Ionicons name="hand-left-outline" size={18} color="#FFFFFF" />
            <Text style={styles.claimButtonText}>{claimLabel}</Text>
          </TouchableOpacity>
        )}
      </Card>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  queuePosition: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  positionNumber: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4B5563',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  content: {
    gap: 8,
  },
  patientInfo: {
    marginBottom: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  priorityIcon: {
    marginLeft: 6,
  },
  patientPhone: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  complaint: {
    backgroundColor: '#F9FAFB',
    padding: 8,
    borderRadius: 6,
  },
  complaintLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  complaintText: {
    fontSize: 14,
    color: '#374151',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  waitTime: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  waitTimeText: {
    fontSize: 13,
    color: '#6B7280',
  },
  staffInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  staffName: {
    fontSize: 13,
    color: '#6B7280',
  },
  claimButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2563EB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginTop: 12,
    gap: 6,
  },
  claimButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
  },
});
