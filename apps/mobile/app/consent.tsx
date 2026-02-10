import { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { ConsentToggle } from '../src/components/ConsentToggle';
import { LanguageToggle } from '../src/components/LanguageToggle';
import { useVisitStore } from '../src/stores/visitStore';
import { useAuthStore } from '../src/stores/authStore';
import { createVisitWithConsent } from '../src/lib/api';
import type { LocalVisit, SourceLanguage } from '@karibu/shared';

export default function Consent() {
  const router = useRouter();
  const { currentPatient, setCurrentVisit, isOnline } = useVisitStore();
  const { staff } = useAuthStore();

  // Language toggle
  const [sourceLanguage, setSourceLanguage] = useState<SourceLanguage>('eng');

  // DPPA consent items
  const [consentRecording, setConsentRecording] = useState(false);
  const [consentAiProcessing, setConsentAiProcessing] = useState(false);
  const [consentStorage, setConsentStorage] = useState(false);
  const [consentCrossBorder, setConsentCrossBorder] = useState(false);

  // Guardian fields (for minors)
  const [isMinor, setIsMinor] = useState(false);
  const [guardianName, setGuardianName] = useState('');
  const [guardianRelationship, setGuardianRelationship] = useState('');

  const [loading, setLoading] = useState(false);

  const allConsentsGranted =
    consentRecording && consentAiProcessing && consentStorage && consentCrossBorder;

  const guardianValid = !isMinor || (guardianName.trim().length > 0 && guardianRelationship.trim().length > 0);

  const canProceed = allConsentsGranted && guardianValid;

  const handleStartRecording = async () => {
    if (!canProceed) {
      Alert.alert(
        'Consent Required',
        'All consent items must be granted before recording can begin.',
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
        // Create visit with consent records in database
        const visit = await createVisitWithConsent(
          currentPatient.id,
          staff.id,
          sourceLanguage,
          {
            consentLanguage: sourceLanguage === 'eng' ? 'eng' : 'local',
            consentMethod: 'digital_app' as const,
            grantedBy: isMinor ? 'guardian' as const : 'clinician_witnessed' as const,
            guardianName: isMinor ? guardianName.trim() : undefined,
            guardianRelationship: isMinor ? guardianRelationship.trim() : undefined,
          }
        );
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
          nurse_id: null,
          status: 'recording',
          queue_status: 'with_doctor',
          queue_position: null,
          priority: 'normal',
          chief_complaint: null,
          checked_in_at: null,
          consent_recording: true,
          consent_timestamp: new Date().toISOString(),
          source_language: sourceLanguage,
          consent_verified: true,
          consent_id: null,
          review_status: 'pending',
          reviewed_by: null,
          reviewed_at: null,
          audio_deleted_at: null,
          retention_expires_at: null,
          diagnosis: null,
          medications: null,
          follow_up_instructions: null,
          tests_ordered: null,
          visit_date: new Date().toISOString().split('T')[0],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          finalized_at: null,
          error_message: null,
          error_at: null,
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
      <Text style={styles.title}>Patient Consent</Text>

      <Card style={styles.patientCard}>
        <Text style={styles.patientLabel}>Patient</Text>
        <Text style={styles.patientName}>
          {currentPatient?.display_name || 'Unknown'}
        </Text>
        <Text style={styles.patientPhone}>{currentPatient?.whatsapp_number}</Text>
      </Card>

      {/* Language Toggle */}
      <Card style={styles.section}>
        <LanguageToggle
          value={sourceLanguage}
          onValueChange={setSourceLanguage}
        />
      </Card>

      {/* DPPA Consent Disclosure */}
      <Card style={styles.section}>
        <View style={styles.disclosureHeader}>
          <Ionicons name="shield-checkmark" size={20} color="#0369A1" />
          <Text style={styles.disclosureTitle}>Informed Consent</Text>
        </View>

        <Text style={styles.disclosureText}>
          Please inform the patient of the following before recording:
        </Text>

        <View style={styles.disclosureItem}>
          <Text style={styles.disclosureBullet}>What:</Text>
          <Text style={styles.disclosureItemText}>
            This visit will be audio recorded
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Text style={styles.disclosureBullet}>Why:</Text>
          <Text style={styles.disclosureItemText}>
            To create your medical record and a summary for you
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Text style={styles.disclosureBullet}>Who:</Text>
          <Text style={styles.disclosureItemText}>
            Your doctor and authorized Karibu Health staff
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Text style={styles.disclosureBullet}>Storage:</Text>
          <Text style={styles.disclosureItemText}>
            Your recording is stored securely and may be processed on servers outside Uganda
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Text style={styles.disclosureBullet}>Rights:</Text>
          <Text style={styles.disclosureItemText}>
            You can stop recording at any time and request deletion of your data
          </Text>
        </View>
        <View style={styles.disclosureItem}>
          <Text style={styles.disclosureBullet}>Retention:</Text>
          <Text style={styles.disclosureItemText}>
            Audio is deleted after processing. Your medical record is kept as required by law.
          </Text>
        </View>

        {sourceLanguage === 'local' && (
          <View style={styles.lugandaBox}>
            <Text style={styles.lugandaTitle}>Luganda Translation</Text>
            <Text style={styles.lugandaText}>
              Okutegeeza: Olw'okulaba kuno kuja kuwulizibwa nga kukwatibwa ku katambi.
              {'\n'}Ensonga: Okukolamu ebiwandiiko by'obulamu bwo n'okukuwa ekisumuluzo.
              {'\n'}Obuyinza: Osobola okukomya okukwata obudde bwonna n'okusaba okusazaamu ebikukwatako.
            </Text>
          </View>
        )}
      </Card>

      {/* Consent Toggles */}
      <Card style={styles.section}>
        <Text style={styles.sectionTitle}>Confirm Patient Consent</Text>

        <ConsentToggle
          value={consentRecording}
          onValueChange={setConsentRecording}
          label="Audio Recording"
          description="Patient agrees to have this visit recorded"
        />

        <ConsentToggle
          value={consentAiProcessing}
          onValueChange={setConsentAiProcessing}
          label="AI Processing"
          description="Patient agrees to AI transcription and note generation"
        />

        <ConsentToggle
          value={consentStorage}
          onValueChange={setConsentStorage}
          label="Data Storage"
          description="Patient agrees to secure storage of medical records"
        />

        <ConsentToggle
          value={consentCrossBorder}
          onValueChange={setConsentCrossBorder}
          label="Cross-Border Transfer"
          description="Patient agrees that data may be processed outside Uganda"
        />
      </Card>

      {/* Minor / Guardian Section */}
      <Card style={styles.section}>
        <ConsentToggle
          value={isMinor}
          onValueChange={setIsMinor}
          label="Patient is under 18"
          description="Guardian consent is required for minors"
        />

        {isMinor && (
          <View style={styles.guardianFields}>
            <Text style={styles.fieldLabel}>Guardian Name</Text>
            <TextInput
              style={styles.input}
              value={guardianName}
              onChangeText={setGuardianName}
              placeholder="Full name of guardian"
              placeholderTextColor="#9CA3AF"
            />

            <Text style={styles.fieldLabel}>Relationship to Patient</Text>
            <TextInput
              style={styles.input}
              value={guardianRelationship}
              onChangeText={setGuardianRelationship}
              placeholder="e.g., Parent, Guardian"
              placeholderTextColor="#9CA3AF"
            />
          </View>
        )}
      </Card>

      {/* Status indicator */}
      {allConsentsGranted && guardianValid && (
        <View style={styles.readyBanner}>
          <Ionicons name="checkmark-circle" size={20} color="#16A34A" />
          <Text style={styles.readyText}>All consents captured. Ready to record.</Text>
        </View>
      )}

      {/* Actions */}
      <View style={styles.buttons}>
        <Button
          title="Start Recording"
          onPress={handleStartRecording}
          loading={loading}
          disabled={!canProceed}
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
    paddingBottom: 48,
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
  section: {
    marginBottom: 16,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  disclosureHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  disclosureTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0369A1',
  },
  disclosureText: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  disclosureItem: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 4,
  },
  disclosureBullet: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    width: 72,
  },
  disclosureItemText: {
    fontSize: 14,
    color: '#374151',
    flex: 1,
    lineHeight: 20,
  },
  lugandaBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  lugandaTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#92400E',
    marginBottom: 4,
  },
  lugandaText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 20,
  },
  guardianFields: {
    marginTop: 12,
    gap: 4,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginTop: 8,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#1A1A1A',
    backgroundColor: '#FFFFFF',
  },
  readyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    marginBottom: 16,
  },
  readyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#16A34A',
  },
  buttons: {
    gap: 12,
  },
});
