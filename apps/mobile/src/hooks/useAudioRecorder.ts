import { useState, useCallback, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import { AUDIO_SETTINGS } from '@karibu/shared';
import { useVisitStore } from '../stores/visitStore';

interface UseAudioRecorderReturn {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  error: string | null;
  startRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  cancelRecording: () => Promise<void>;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { setIsRecording: setStoreRecording, setRecordingDuration } = useVisitStore();

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  // Update store when recording state changes
  useEffect(() => {
    setStoreRecording(isRecording);
  }, [isRecording, setStoreRecording]);

  useEffect(() => {
    setRecordingDuration(duration);
  }, [duration, setRecordingDuration]);

  const startDurationTimer = useCallback(() => {
    durationIntervalRef.current = setInterval(() => {
      setDuration((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError(null);

      // Request permissions
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        setError('Microphone permission is required to record visits.');
        return;
      }

      // Configure audio mode
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
        staysActiveInBackground: true,
        shouldDuckAndroid: true,
      });

      // Create recording with high quality settings
      const recording = new Audio.Recording();
      await recording.prepareToRecordAsync({
        android: {
          extension: '.m4a',
          outputFormat: Audio.AndroidOutputFormat.MPEG_4,
          audioEncoder: Audio.AndroidAudioEncoder.AAC,
          sampleRate: AUDIO_SETTINGS.sampleRate,
          numberOfChannels: AUDIO_SETTINGS.channels,
          bitRate: AUDIO_SETTINGS.bitRate,
        },
        ios: {
          extension: '.m4a',
          outputFormat: Audio.IOSOutputFormat.MPEG4AAC,
          audioQuality: Audio.IOSAudioQuality.HIGH,
          sampleRate: AUDIO_SETTINGS.sampleRate,
          numberOfChannels: AUDIO_SETTINGS.channels,
          bitRate: AUDIO_SETTINGS.bitRate,
        },
        web: {
          mimeType: 'audio/webm',
          bitsPerSecond: AUDIO_SETTINGS.bitRate,
        },
      });

      await recording.startAsync();
      recordingRef.current = recording;
      setIsRecording(true);
      setIsPaused(false);
      setDuration(0);
      startDurationTimer();
    } catch (err) {
      console.error('Failed to start recording:', err);
      setError('Failed to start recording. Please try again.');
    }
  }, [startDurationTimer]);

  const pauseRecording = useCallback(async () => {
    if (!recordingRef.current || !isRecording) return;

    try {
      await recordingRef.current.pauseAsync();
      setIsPaused(true);
      stopDurationTimer();
    } catch (err) {
      console.error('Failed to pause recording:', err);
      setError('Failed to pause recording.');
    }
  }, [isRecording, stopDurationTimer]);

  const resumeRecording = useCallback(async () => {
    if (!recordingRef.current || !isPaused) return;

    try {
      await recordingRef.current.startAsync();
      setIsPaused(false);
      startDurationTimer();
    } catch (err) {
      console.error('Failed to resume recording:', err);
      setError('Failed to resume recording.');
    }
  }, [isPaused, startDurationTimer]);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    if (!recordingRef.current) return null;

    try {
      stopDurationTimer();
      await recordingRef.current.stopAndUnloadAsync();

      const uri = recordingRef.current.getURI();
      if (!uri) {
        setError('Failed to save recording.');
        return null;
      }

      // Generate unique filename with timestamp
      const timestamp = Date.now();
      const randomId = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${timestamp}-${Math.random()}`
      );
      const shortId = randomId.substring(0, 8);
      const filename = `recording_${timestamp}_${shortId}.m4a`;

      // Move to app's document directory for persistence
      const destinationPath = `${FileSystem.documentDirectory}recordings/`;

      // Ensure directory exists
      const dirInfo = await FileSystem.getInfoAsync(destinationPath);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(destinationPath, { intermediates: true });
      }

      const finalPath = `${destinationPath}${filename}`;
      await FileSystem.moveAsync({ from: uri, to: finalPath });

      recordingRef.current = null;
      setIsRecording(false);
      setIsPaused(false);

      return finalPath;
    } catch (err) {
      console.error('Failed to stop recording:', err);
      setError('Failed to save recording.');
      return null;
    }
  }, [stopDurationTimer]);

  const cancelRecording = useCallback(async () => {
    if (!recordingRef.current) return;

    try {
      stopDurationTimer();
      await recordingRef.current.stopAndUnloadAsync();

      // Delete the temporary file
      const uri = recordingRef.current.getURI();
      if (uri) {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      }

      recordingRef.current = null;
      setIsRecording(false);
      setIsPaused(false);
      setDuration(0);
    } catch (err) {
      console.error('Failed to cancel recording:', err);
    }
  }, [stopDurationTimer]);

  return {
    isRecording,
    isPaused,
    duration,
    error,
    startRecording,
    pauseRecording,
    resumeRecording,
    stopRecording,
    cancelRecording,
  };
}

// Format duration as MM:SS
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}
