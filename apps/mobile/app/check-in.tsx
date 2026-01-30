import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../src/components/Button';
import { Input } from '../src/components/Input';
import { Card } from '../src/components/Card';
import { lookupPatient, createPatient, getOrCreatePatient } from '../src/lib/api';
import { checkInPatient } from '../src/lib/queue';
import { formatPhoneNumber, isValidUgandaPhone } from '@karibu/shared';
import type { Patient, VisitPriority } from '@karibu/shared';

export default function CheckIn() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [patientName, setPatientName] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [priority, setPriority] = useState<VisitPriority>('normal');
  const [patient, setPatient] = useState<Patient | null>(null);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showNewPatient, setShowNewPatient] = useState(false);

  const handleLookup = async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter a phone number');
      return;
    }

    const formatted = formatPhoneNumber(phoneNumber);
    if (!isValidUgandaPhone(formatted)) {
      Alert.alert('Error', 'Please enter a valid Uganda phone number');
      return;
    }

    setSearching(true);
    try {
      const found = await lookupPatient(formatted);
      if (found) {
        setPatient(found);
        setPatientName(found.display_name || '');
        setShowNewPatient(false);
      } else {
        setPatient(null);
        setShowNewPatient(true);
      }
    } catch (error) {
      console.error('Lookup error:', error);
      Alert.alert('Error', 'Failed to look up patient');
    } finally {
      setSearching(false);
    }
  };

  const handleCheckIn = async () => {
    if (!phoneNumber.trim()) {
      Alert.alert('Error', 'Please enter a phone number');
      return;
    }

    setSubmitting(true);
    try {
      // Get or create patient
      const formatted = formatPhoneNumber(phoneNumber);
      let patientToCheckIn = patient;

      if (!patientToCheckIn) {
        patientToCheckIn = await createPatient({
          whatsapp_number: formatted,
          display_name: patientName || undefined,
        });
      }

      // Check in the patient
      const visitId = await checkInPatient({
        patient_id: patientToCheckIn.id,
        chief_complaint: chiefComplaint || undefined,
        priority,
      });

      Alert.alert(
        'Success',
        `${patientToCheckIn.display_name || 'Patient'} has been checked in`,
        [
          {
            text: 'Go to Queue',
            onPress: () => router.replace('/queue'),
          },
          {
            text: 'Check In Another',
            onPress: () => {
              setPhoneNumber('');
              setPatientName('');
              setChiefComplaint('');
              setPriority('normal');
              setPatient(null);
              setShowNewPatient(false);
            },
          },
        ]
      );
    } catch (error) {
      console.error('Check-in error:', error);
      Alert.alert('Error', 'Failed to check in patient');
    } finally {
      setSubmitting(false);
    }
  };

  const priorityOptions: { value: VisitPriority; label: string; color: string }[] = [
    { value: 'low', label: 'Low', color: '#6B7280' },
    { value: 'normal', label: 'Normal', color: '#3B82F6' },
    { value: 'high', label: 'High', color: '#F59E0B' },
    { value: 'urgent', label: 'Urgent', color: '#EF4444' },
  ];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Patient Information</Text>

          <Input
            label="WhatsApp Number"
            placeholder="+256 7XX XXX XXX"
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
          />

          <Button
            title={searching ? 'Searching...' : 'Look Up Patient'}
            onPress={handleLookup}
            variant="secondary"
            disabled={searching || !phoneNumber.trim()}
            style={styles.lookupButton}
          />

          {patient && (
            <View style={styles.patientFound}>
              <Text style={styles.patientFoundLabel}>Patient Found</Text>
              <Text style={styles.patientFoundName}>
                {patient.display_name || 'Unnamed Patient'}
              </Text>
            </View>
          )}

          {showNewPatient && (
            <View style={styles.newPatient}>
              <Text style={styles.newPatientLabel}>New Patient</Text>
              <Input
                label="Patient Name (optional)"
                placeholder="Enter patient name"
                value={patientName}
                onChangeText={setPatientName}
              />
            </View>
          )}
        </Card>

        <Card style={styles.card}>
          <Text style={styles.sectionTitle}>Visit Details</Text>

          <Input
            label="Chief Complaint"
            placeholder="What brings the patient in today?"
            value={chiefComplaint}
            onChangeText={setChiefComplaint}
            multiline
            numberOfLines={3}
          />

          <Text style={styles.priorityLabel}>Priority</Text>
          <View style={styles.priorityRow}>
            {priorityOptions.map((option) => (
              <Button
                key={option.value}
                title={option.label}
                onPress={() => setPriority(option.value)}
                variant={priority === option.value ? 'primary' : 'secondary'}
                size="small"
                style={[
                  styles.priorityButton,
                  priority === option.value && { backgroundColor: option.color },
                ]}
              />
            ))}
          </View>
        </Card>

        <Button
          title={submitting ? 'Checking In...' : 'Check In Patient'}
          onPress={handleCheckIn}
          disabled={submitting || (!patient && !showNewPatient)}
          size="large"
          style={styles.submitButton}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  lookupButton: {
    marginTop: 8,
  },
  patientFound: {
    backgroundColor: '#DCFCE7',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  patientFoundLabel: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  patientFoundName: {
    fontSize: 16,
    color: '#166534',
    fontWeight: '600',
    marginTop: 4,
  },
  newPatient: {
    backgroundColor: '#FEF3C7',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  newPatientLabel: {
    fontSize: 12,
    color: '#92400E',
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  priorityLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityButton: {
    flex: 1,
  },
  submitButton: {
    marginTop: 8,
  },
});
