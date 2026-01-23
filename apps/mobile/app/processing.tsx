import { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { useVisitStore } from '../src/stores/visitStore';
import { useNetworkState } from '../src/hooks/useNetworkState';
import { uploadAudioFile } from '../src/lib/upload';
import { getAudioUploadStatus, getNotes, updateVisit, updateVisitStatus } from '../src/lib/api';

type ProcessingStep = 'uploading' | 'transcribing' | 'generating' | 'ready' | 'error';

export default function Processing() {
  const router = useRouter();
  const params = useLocalSearchParams<{ visitId?: string }>();
  const { isOnline } = useNetworkState();
  const {
    currentVisit,
    localAudioPath,
    recordingDuration,
    setCurrentVisit,
    setProviderNote,
    setPatientNote,
    addPendingUpload,
  } = useVisitStore();

  const [step, setStep] = useState<ProcessingStep>('uploading');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const visitId = params.visitId || currentVisit?.id;

  const processVisit = useCallback(async () => {
    if (!visitId || !localAudioPath) {
      if (!isOnline && currentVisit) {
        // Save for later upload
        addPendingUpload(currentVisit);
        setStep('ready');
        return;
      }
      setError('Missing visit or recording data');
      setStep('error');
      return;
    }

    try {
      // Step 1: Upload audio
      setStep('uploading');
      const uploadResult = await uploadAudioFile(
        visitId,
        localAudioPath,
        recordingDuration,
        (p) => setProgress(p)
      );

      if (!uploadResult.success) {
        if (!isOnline && currentVisit) {
          addPendingUpload({ ...currentVisit, audio_local_path: localAudioPath });
          setError('Offline - Recording saved for later upload');
          return;
        }
        throw new Error(uploadResult.error);
      }

      // Step 2: Wait for transcription
      setStep('transcribing');
      await updateVisitStatus(visitId, 'processing');

      // Update visit with structured data if provided
      if (currentVisit) {
        await updateVisit(visitId, {
          diagnosis: currentVisit.diagnosis || undefined,
          medications: currentVisit.medications || undefined,
          follow_up_instructions: currentVisit.follow_up_instructions || undefined,
          tests_ordered: currentVisit.tests_ordered || undefined,
        });
      }

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 60; // 5 minutes max

      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const audioStatus = await getAudioUploadStatus(visitId);

        if (audioStatus?.status === 'completed') {
          setStep('generating');
          break;
        } else if (audioStatus?.status === 'failed') {
          throw new Error(audioStatus.error_message || 'Transcription failed');
        }

        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new Error('Processing timed out. Please try again.');
      }

      // Step 3: Get generated notes
      const { providerNote, patientNote } = await getNotes(visitId);

      if (providerNote && patientNote) {
        setProviderNote(providerNote);
        setPatientNote(patientNote);
        setStep('ready');

        // Navigate to review after short delay
        setTimeout(() => {
          router.replace(`/review?visitId=${visitId}`);
        }, 1500);
      } else {
        throw new Error('Notes not generated. Please try again.');
      }
    } catch (err) {
      console.error('Processing error:', err);
      setError(err instanceof Error ? err.message : 'Processing failed');
      setStep('error');
    }
  }, [visitId, localAudioPath, recordingDuration, isOnline, currentVisit, addPendingUpload, setProviderNote, setPatientNote, router]);

  useEffect(() => {
    processVisit();
  }, [processVisit]);

  const handleRetry = () => {
    setError(null);
    setStep('uploading');
    processVisit();
  };

  const handleGoHome = () => {
    router.replace('/home');
  };

  const steps = [
    { key: 'uploading', label: 'Uploading recording...', icon: 'cloud-upload' },
    { key: 'transcribing', label: 'Transcribing audio...', icon: 'document-text' },
    { key: 'generating', label: 'Generating notes...', icon: 'create' },
    { key: 'ready', label: 'Notes ready!', icon: 'checkmark-circle' },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === step);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Processing Visit</Text>

      <Card style={styles.progressCard}>
        {steps.map((s, index) => {
          const isComplete = index < currentStepIndex;
          const isCurrent = s.key === step;
          const isPending = index > currentStepIndex;

          return (
            <View key={s.key} style={styles.stepRow}>
              <View
                style={[
                  styles.stepIcon,
                  isComplete && styles.stepComplete,
                  isCurrent && styles.stepCurrent,
                ]}
              >
                {isComplete ? (
                  <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                ) : isCurrent && step !== 'error' ? (
                  <ActivityIndicator size="small" color="#2563EB" />
                ) : (
                  <Ionicons
                    name={s.icon as any}
                    size={20}
                    color={isPending ? '#9CA3AF' : '#2563EB'}
                  />
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isComplete && styles.stepLabelComplete,
                  isCurrent && styles.stepLabelCurrent,
                  isPending && styles.stepLabelPending,
                ]}
              >
                {s.label}
              </Text>
            </View>
          );
        })}
      </Card>

      {error && (
        <Card style={styles.errorCard}>
          <Ionicons name="alert-circle" size={24} color="#DC2626" />
          <Text style={styles.errorText}>{error}</Text>
        </Card>
      )}

      {step === 'ready' && (
        <Card style={styles.successCard}>
          <Ionicons name="checkmark-circle" size={48} color="#16A34A" />
          <Text style={styles.successText}>Notes generated successfully!</Text>
          <Text style={styles.successHint}>Redirecting to review...</Text>
        </Card>
      )}

      {step === 'error' && (
        <View style={styles.buttons}>
          <Button title="Retry" onPress={handleRetry} />
          <Button title="Go Home" variant="ghost" onPress={handleGoHome} />
        </View>
      )}

      {!isOnline && step !== 'ready' && (
        <Card style={styles.offlineCard}>
          <Ionicons name="cloud-offline" size={20} color="#F59E0B" />
          <Text style={styles.offlineText}>
            You're offline. Recording saved and will upload when connected.
          </Text>
        </Card>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 24,
  },
  progressCard: {
    marginBottom: 24,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  stepIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  stepComplete: {
    backgroundColor: '#16A34A',
  },
  stepCurrent: {
    backgroundColor: '#EFF6FF',
    borderWidth: 2,
    borderColor: '#2563EB',
  },
  stepLabel: {
    fontSize: 16,
    color: '#6B7280',
  },
  stepLabelComplete: {
    color: '#16A34A',
  },
  stepLabelCurrent: {
    color: '#2563EB',
    fontWeight: '600',
  },
  stepLabelPending: {
    color: '#9CA3AF',
  },
  errorCard: {
    backgroundColor: '#FEE2E2',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  errorText: {
    color: '#DC2626',
    flex: 1,
    fontSize: 14,
  },
  successCard: {
    alignItems: 'center',
    padding: 32,
  },
  successText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#16A34A',
    marginTop: 16,
  },
  successHint: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 8,
  },
  offlineCard: {
    backgroundColor: '#FEF3C7',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 'auto',
  },
  offlineText: {
    color: '#92400E',
    flex: 1,
    fontSize: 14,
  },
  buttons: {
    gap: 12,
  },
});
