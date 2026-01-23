import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Button } from '../src/components/Button';
import { Input } from '../src/components/Input';
import { Card } from '../src/components/Card';
import { useVisitStore } from '../src/stores/visitStore';
import { formatPhoneNumber, isValidUgandaPhone, PHONE_FORMATS } from '@karibu/shared';
import { getOrCreatePatient } from '../src/lib/api';

export default function NewVisit() {
  const router = useRouter();
  const { setCurrentPatient, isOnline } = useVisitStore();

  const [phoneNumber, setPhoneNumber] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [loading, setLoading] = useState(false);

  const validatePhone = (value: string) => {
    const formatted = formatPhoneNumber(value);
    if (value && !isValidUgandaPhone(value)) {
      setPhoneError(`Please enter a valid Uganda phone number (${PHONE_FORMATS.exampleFormat})`);
      return false;
    }
    setPhoneError('');
    return true;
  };

  const handlePhoneChange = (value: string) => {
    setPhoneNumber(value);
    if (value.length > 5) {
      validatePhone(value);
    } else {
      setPhoneError('');
    }
  };

  const handleContinue = async () => {
    if (!validatePhone(phoneNumber)) return;

    const formattedPhone = formatPhoneNumber(phoneNumber);
    setLoading(true);

    try {
      // Create or get patient
      const patient = await getOrCreatePatient(formattedPhone, displayName || undefined);
      setCurrentPatient(patient);
      router.push('/consent');
    } catch (error) {
      console.error('Failed to create/get patient:', error);
      // For offline, store locally
      if (!isOnline) {
        setCurrentPatient({
          id: `local_${Date.now()}`,
          clinic_id: '',
          whatsapp_number: formattedPhone,
          display_name: displayName || null,
          date_of_birth: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
        router.push('/consent');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>New Visit</Text>
        <Text style={styles.subtitle}>
          Enter the patient's WhatsApp number to begin
        </Text>

        <Card style={styles.card}>
          <Input
            label="WhatsApp Number"
            value={phoneNumber}
            onChangeText={handlePhoneChange}
            placeholder="+256 7XX XXX XXX"
            keyboardType="phone-pad"
            error={phoneError}
            hint="The patient's visit summary will be sent here"
          />

          <Input
            label="Patient Name (Optional)"
            value={displayName}
            onChangeText={setDisplayName}
            placeholder="Enter patient's name"
            autoCapitalize="words"
          />
        </Card>

        <View style={styles.buttons}>
          <Button
            title="Continue"
            onPress={handleContinue}
            loading={loading}
            disabled={!phoneNumber || !!phoneError}
          />

          <Button
            title="Cancel"
            variant="ghost"
            onPress={() => router.back()}
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
  card: {
    marginBottom: 24,
  },
  buttons: {
    gap: 12,
  },
});
