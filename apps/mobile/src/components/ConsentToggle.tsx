import React from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface ConsentToggleProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

export function ConsentToggle({ value, onValueChange, disabled }: ConsentToggleProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons
          name={value ? 'checkmark-circle' : 'alert-circle'}
          size={48}
          color={value ? '#16A34A' : '#F59E0B'}
        />
      </View>

      <Text style={styles.title}>Recording Consent</Text>

      <Text style={styles.description}>
        The patient has been informed that this visit will be recorded and
        transcribed using AI to generate medical notes.
      </Text>

      <View style={styles.toggleRow}>
        <Text style={styles.toggleLabel}>Patient consents to recording</Text>
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ false: '#E5E7EB', true: '#86EFAC' }}
          thumbColor={value ? '#16A34A' : '#9CA3AF'}
        />
      </View>

      {value && (
        <View style={styles.confirmation}>
          <Ionicons name="checkmark" size={16} color="#16A34A" />
          <Text style={styles.confirmationText}>
            Consent captured at {new Date().toLocaleTimeString()}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    alignItems: 'center',
  },
  iconContainer: {
    marginBottom: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 24,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    backgroundColor: '#F9FAFB',
    padding: 16,
    borderRadius: 8,
    marginBottom: 16,
  },
  toggleLabel: {
    fontSize: 16,
    color: '#1A1A1A',
    fontWeight: '500',
    flex: 1,
    marginRight: 12,
  },
  confirmation: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  confirmationText: {
    fontSize: 14,
    color: '#16A34A',
  },
});
