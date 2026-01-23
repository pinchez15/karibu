import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../src/components/Button';
import { Input } from '../src/components/Input';
import { Card } from '../src/components/Card';
import { useVisitStore } from '../src/stores/visitStore';
import { formatDuration } from '../src/hooks/useAudioRecorder';

export default function VisitDetails() {
  const router = useRouter();
  const {
    currentVisit,
    currentPatient,
    recordingDuration,
    setCurrentVisit,
  } = useVisitStore();

  const [diagnosis, setDiagnosis] = useState(currentVisit?.diagnosis || '');
  const [medications, setMedications] = useState(currentVisit?.medications || '');
  const [followUp, setFollowUp] = useState(currentVisit?.follow_up_instructions || '');
  const [tests, setTests] = useState(currentVisit?.tests_ordered || '');

  const handleSubmit = () => {
    if (currentVisit) {
      setCurrentVisit({
        ...currentVisit,
        diagnosis: diagnosis || null,
        medications: medications || null,
        follow_up_instructions: followUp || null,
        tests_ordered: tests || null,
      });
    }
    router.push('/processing');
  };

  const handleSkip = () => {
    router.push('/processing');
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Visit Details</Text>
        <Text style={styles.subtitle}>
          Optional: Add details to help generate better notes
        </Text>

        <Card style={styles.recordingCard}>
          <View style={styles.recordingRow}>
            <Text style={styles.recordingLabel}>Recording saved</Text>
            <Text style={styles.recordingDuration}>
              {formatDuration(recordingDuration)}
            </Text>
          </View>
          <Text style={styles.patientName}>
            {currentPatient?.display_name || currentPatient?.whatsapp_number}
          </Text>
        </Card>

        <Text style={styles.sectionTitle}>
          Add Structured Data (Optional)
        </Text>
        <Text style={styles.sectionHint}>
          These details will be included in the generated notes
        </Text>

        <Input
          label="Diagnosis"
          value={diagnosis}
          onChangeText={setDiagnosis}
          placeholder="e.g., Upper respiratory infection"
          multiline
        />

        <Input
          label="Medications Prescribed"
          value={medications}
          onChangeText={setMedications}
          placeholder="e.g., Amoxicillin 500mg TID x 7 days"
          multiline
        />

        <Input
          label="Follow-up Instructions"
          value={followUp}
          onChangeText={setFollowUp}
          placeholder="e.g., Return in 1 week if symptoms persist"
          multiline
        />

        <Input
          label="Tests Ordered"
          value={tests}
          onChangeText={setTests}
          placeholder="e.g., CBC, Malaria RDT"
          multiline
        />

        <View style={styles.buttons}>
          <Button
            title="Submit for Processing"
            onPress={handleSubmit}
            size="large"
          />

          <Button
            title="Skip - Just Use Recording"
            variant="ghost"
            onPress={handleSkip}
          />
        </View>
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
    padding: 24,
    paddingBottom: 48,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  recordingCard: {
    backgroundColor: '#ECFDF5',
    marginBottom: 24,
  },
  recordingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  recordingLabel: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '500',
  },
  recordingDuration: {
    fontSize: 14,
    color: '#059669',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  patientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#065F46',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  buttons: {
    gap: 12,
    marginTop: 8,
  },
});
