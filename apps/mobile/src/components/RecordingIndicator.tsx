import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDuration } from '../hooks/useAudioRecorder';

interface RecordingIndicatorProps {
  duration: number;
  isPaused: boolean;
}

export function RecordingIndicator({ duration, isPaused }: RecordingIndicatorProps) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (isPaused) {
      pulseAnim.setValue(1);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [isPaused, pulseAnim]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={[
          styles.indicator,
          isPaused && styles.paused,
          { transform: [{ scale: pulseAnim }] },
        ]}
      >
        <Ionicons
          name={isPaused ? 'pause' : 'mic'}
          size={32}
          color="#FFFFFF"
        />
      </Animated.View>
      <Text style={styles.duration}>{formatDuration(duration)}</Text>
      <Text style={styles.status}>
        {isPaused ? 'Paused' : 'Recording...'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  indicator: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  paused: {
    backgroundColor: '#F59E0B',
  },
  duration: {
    fontSize: 48,
    fontWeight: '700',
    color: '#1A1A1A',
    fontVariant: ['tabular-nums'],
  },
  status: {
    fontSize: 18,
    color: '#6B7280',
    marginTop: 8,
  },
});
