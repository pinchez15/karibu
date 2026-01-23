import { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, BackHandler } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { RecordingIndicator } from '../src/components/RecordingIndicator';
import { useAudioRecorder, formatDuration } from '../src/hooks/useAudioRecorder';
import { useVisitStore } from '../src/stores/visitStore';

export default function Recording() {
  const router = useRouter();
  const {
    isRecording,
    isPaused,
    duration,
    error,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
  } = useAudioRecorder();

  const { currentVisit, currentPatient, setLocalAudioPath } = useVisitStore();
  const [hasStarted, setHasStarted] = useState(false);

  // Auto-start recording on mount
  useEffect(() => {
    if (!hasStarted) {
      startRecording();
      setHasStarted(true);
    }
  }, [hasStarted, startRecording]);

  // Prevent accidental back navigation during recording
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isRecording) {
        handleCancel();
        return true;
      }
      return false;
    });

    return () => backHandler.remove();
  }, [isRecording]);

  const handlePauseResume = async () => {
    if (isPaused) {
      await resumeRecording();
    } else {
      await pauseRecording();
    }
  };

  const handleStop = async () => {
    Alert.alert(
      'Stop Recording',
      'Are you sure you want to stop the recording?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop',
          style: 'default',
          onPress: async () => {
            const filePath = await stopRecording();
            if (filePath) {
              setLocalAudioPath(filePath);
              router.push('/visit-details');
            } else {
              Alert.alert('Error', 'Failed to save recording. Please try again.');
            }
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    Alert.alert(
      'Cancel Recording',
      'This will discard the current recording. Are you sure?',
      [
        { text: 'Keep Recording', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            await cancelRecording();
            router.back();
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <Card style={styles.patientCard}>
        <Text style={styles.patientLabel}>Recording visit for</Text>
        <Text style={styles.patientName}>
          {currentPatient?.display_name || currentPatient?.whatsapp_number}
        </Text>
      </Card>

      {error && (
        <Card style={styles.errorCard}>
          <Ionicons name="alert-circle" size={20} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      <View style={styles.recorderContainer}>
        <RecordingIndicator duration={duration} isPaused={isPaused} />
      </View>

      <View style={styles.controls}>
        <Button
          title={isPaused ? 'Resume' : 'Pause'}
          variant="secondary"
          onPress={handlePauseResume}
          disabled={!isRecording && !isPaused}
        />

        <Button
          title="Stop Recording"
          variant="danger"
          onPress={handleStop}
          disabled={duration < 5}
          size="large"
        />

        <Button
          title="Cancel"
          variant="ghost"
          onPress={handleCancel}
        />
      </View>

      <Text style={styles.hint}>
        Minimum recording length: 5 seconds
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 24,
  },
  patientCard: {
    marginBottom: 24,
  },
  patientLabel: {
    fontSize: 12,
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  patientName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginTop: 4,
  },
  errorCard: {
    backgroundColor: '#FEE2E2',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 24,
  },
  errorText: {
    color: '#DC2626',
    flex: 1,
  },
  recorderContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controls: {
    gap: 12,
    marginBottom: 16,
  },
  hint: {
    textAlign: 'center',
    color: '#6B7280',
    fontSize: 14,
  },
});
