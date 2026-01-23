import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../src/components/Button';
import { Input } from '../src/components/Input';
import { Card } from '../src/components/Card';
import { useVisitStore } from '../src/stores/visitStore';
import { useAuthStore } from '../src/stores/authStore';
import {
  getNotes,
  updateProviderNote,
  updatePatientNote,
  finalizeVisit,
} from '../src/lib/api';

type TabType = 'provider' | 'patient';

export default function Review() {
  const router = useRouter();
  const params = useLocalSearchParams<{ visitId: string }>();
  const { staff } = useAuthStore();
  const {
    providerNote,
    patientNote,
    setProviderNote,
    setPatientNote,
    clearCurrentVisit,
  } = useVisitStore();

  const [activeTab, setActiveTab] = useState<TabType>('provider');
  const [providerContent, setProviderContent] = useState('');
  const [patientContent, setPatientContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const visitId = params.visitId;

  // Load notes
  useEffect(() => {
    const loadNotes = async () => {
      if (!visitId) return;

      try {
        const { providerNote: pNote, patientNote: paNote } = await getNotes(visitId);
        if (pNote) {
          setProviderNote(pNote);
          setProviderContent(pNote.note_content || '');
        }
        if (paNote) {
          setPatientNote(paNote);
          setPatientContent(paNote.content || '');
        }
      } catch (error) {
        console.error('Failed to load notes:', error);
      } finally {
        setLoading(false);
      }
    };

    if (!providerNote || !patientNote) {
      loadNotes();
    } else {
      setProviderContent(providerNote.note_content || '');
      setPatientContent(patientNote.content || '');
      setLoading(false);
    }
  }, [visitId, providerNote, patientNote, setProviderNote, setPatientNote]);

  const handleProviderChange = (text: string) => {
    setProviderContent(text);
    setHasChanges(true);
  };

  const handlePatientChange = (text: string) => {
    setPatientContent(text);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!visitId) return;

    setSaving(true);
    try {
      await Promise.all([
        updateProviderNote(visitId, providerContent),
        updatePatientNote(visitId, patientContent),
      ]);
      setHasChanges(false);
      Alert.alert('Saved', 'Changes saved successfully.');
    } catch (error) {
      console.error('Failed to save:', error);
      Alert.alert('Error', 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (!visitId || !staff?.id) return;

    Alert.alert(
      'Send to Patient',
      'This will finalize the notes and send them to the patient via WhatsApp. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setFinalizing(true);
            try {
              // Save any pending changes first
              if (hasChanges) {
                await Promise.all([
                  updateProviderNote(visitId, providerContent),
                  updatePatientNote(visitId, patientContent),
                ]);
              }

              const result = await finalizeVisit(visitId, staff.id);
              clearCurrentVisit();
              router.replace(`/success?token=${result.magicLinkToken}`);
            } catch (error) {
              console.error('Failed to finalize:', error);
              Alert.alert('Error', 'Failed to send to patient. Please try again.');
            } finally {
              setFinalizing(false);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.loading}>
        <Text>Loading notes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Review Notes</Text>

      {/* Tabs */}
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'provider' && styles.activeTab]}
          onPress={() => setActiveTab('provider')}
        >
          <Ionicons
            name="medical"
            size={20}
            color={activeTab === 'provider' ? '#2563EB' : '#6B7280'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'provider' && styles.activeTabText,
            ]}
          >
            Provider Note
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tab, activeTab === 'patient' && styles.activeTab]}
          onPress={() => setActiveTab('patient')}
        >
          <Ionicons
            name="person"
            size={20}
            color={activeTab === 'patient' ? '#2563EB' : '#6B7280'}
          />
          <Text
            style={[
              styles.tabText,
              activeTab === 'patient' && styles.activeTabText,
            ]}
          >
            Patient Note
          </Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={styles.scrollView}>
        {activeTab === 'provider' ? (
          <Card style={styles.noteCard}>
            <Text style={styles.noteLabel}>Provider Note (SOAP format)</Text>
            <Text style={styles.noteHint}>
              Technical note for medical records. Not shared with patient.
            </Text>
            <Input
              value={providerContent}
              onChangeText={handleProviderChange}
              multiline
              style={styles.noteInput}
              containerStyle={styles.inputContainer}
            />
          </Card>
        ) : (
          <Card style={styles.noteCard}>
            <Text style={styles.noteLabel}>Patient Note</Text>
            <Text style={styles.noteHint}>
              Plain language summary sent to patient via WhatsApp.
            </Text>
            <Input
              value={patientContent}
              onChangeText={handlePatientChange}
              multiline
              style={styles.noteInput}
              containerStyle={styles.inputContainer}
            />
          </Card>
        )}

        {/* Transcript (if available) */}
        {providerNote?.transcript && (
          <Card style={styles.transcriptCard}>
            <TouchableOpacity style={styles.transcriptHeader}>
              <Ionicons name="document-text" size={20} color="#6B7280" />
              <Text style={styles.transcriptTitle}>View Transcript</Text>
              <Ionicons name="chevron-down" size={20} color="#6B7280" />
            </TouchableOpacity>
          </Card>
        )}
      </ScrollView>

      {/* Actions */}
      <View style={styles.actions}>
        {hasChanges && (
          <Button
            title="Save Changes"
            variant="secondary"
            onPress={handleSave}
            loading={saving}
          />
        )}

        <Button
          title="Approve & Send to Patient"
          onPress={handleFinalize}
          loading={finalizing}
          size="large"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    padding: 24,
    paddingBottom: 16,
  },
  tabs: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    marginBottom: 16,
    gap: 12,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    gap: 8,
  },
  activeTab: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  activeTabText: {
    color: '#2563EB',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 24,
  },
  noteCard: {
    marginBottom: 16,
  },
  noteLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  noteHint: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  inputContainer: {
    marginBottom: 0,
  },
  noteInput: {
    height: 300,
    textAlignVertical: 'top',
  },
  transcriptCard: {
    marginBottom: 24,
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  transcriptTitle: {
    flex: 1,
    fontSize: 14,
    color: '#6B7280',
  },
  actions: {
    padding: 24,
    paddingTop: 16,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
});
