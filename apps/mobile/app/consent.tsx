import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { ConsentToggle } from '../src/components/ConsentToggle';
import { useVisitStore } from '../src/stores/visitStore';
import { useAuthStore } from '../src/stores/authStore';
import { createVisit } from '../src/lib/api';
import type { LocalVisit } from '@karibu/shared';

export default function Consent() {
  const router = useRouter();
  const { currentPatient, setCurrentVisit, isOnline } = useVisitStore();
  const { staff } = useAuthStore();

  const [consentGranted, setConsentGranted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleStartRecording = async () => {
    if (!consentGranted) {
      Alert.alert(
        'Consent Required',
        'Patient must consent to recording before continuing.',
        [{ text: 'OK' }]
      );
      return;
    }

    if (!currentPatient) {
      Alert.alert('Error', 'Patient information not found.');
      return;
    }

    setLoading(true);

    try {
      if (isOnline && staff?.id) {
        // Create visit in database
        const visit = await createVisit(currentPatient.id, staff.id, consentGranted);
        setCurrentVisit({
          ...visit,
          local_id: visit.id,
          synced: true,
          audio_uploaded: false,
        });
      } else {
        // Create local visit for offline
        const localVisit: LocalVisit = {
          id: `local_${Date.now()}`,
          local_id: `local_${Date.now()}`,
          clinic_id: '',
          patient_id: currentPatient.id,
          doctor_id: staff?.id || null,
          status: 'recording',
          consent_recording: consentGranted,
          consent_timestamp: new Date().toISOString(),
          diagnosis: null,
          medications: null,
          follow_up_instructions: null,
          tests_ordered: null,
          visit_date: new Date().toISOString().split('T')[0],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          finalized_at: null,
          synced: false,
          audio_uploaded: false,
        };
        setCurrentVisit(localVisit);
      }

      router.push('/recording');
    } catch (error) {
      console.error('Failed to create visit:', error);
      Alert.alert('Error', 'Failed to create visit. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Recording Consent</Text>

      <Card style={styles.patientCard}>
        <Text style={styles.patientLabel}>Patient</Text>
        <Text style={styles.patientName}>
          {currentPatient?.display_name || 'Unknown'}
        </Text>
        <Text style={styles.patientPhone}>{currentPatient?.whatsapp_number}</Text>
      </Card>

      <Card style={styles.consentCard}>
        <ConsentToggle
          value={consentGranted}
          onValueChange={setConsentGranted}
        />
      </Card>

      <View style={styles.instructions}>
        <Text style={styles.instructionsTitle}>Before starting:</Text>
        <Text style={styles.instructionsText}>
          1. Verbally inform the patient that this visit will be recorded
        </Text>
        <Text style={styles.instructionsText}>
          2. Explain that AI will transcribe the recording to create notes
        </Text>
        <Text style={styles.instructionsText}>
          3. Confirm the patient understands and agrees
        </Text>
        <Text style={styles.instructionsText}>
          4. Toggle the consent switch above
        </Text>
      </View>

      <View style={styles.buttons}>
        <Button
          title="Start Recording"
          onPress={handleStartRecording}
          loading={loading}
          disabled={!consentGranted}
          size="large"
        />

        <Button
          title="Back"
          variant="ghost"
          onPress={() => router.back()}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 24,
  },
  patientCard: {
    marginBottom: 16,
  },
  patientLabel: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  patientName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  patientPhone: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  consentCard: {
    marginBottom: 24,
    padding: 0,
  },
  instructions: {
    marginBottom: 32,
  },
  instructionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  instructionsText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 8,
    lineHeight: 20,
  },
  buttons: {
    gap: 12,
  },
});
