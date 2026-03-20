import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Button } from '../src/components/Button';
import { Card } from '../src/components/Card';
import { useAuthStore } from '../src/stores/authStore';
import { recordPayment, skipPayment } from '../src/lib/api';
import { SERVICE_TYPES } from '@karibu/shared';

const SERVICE_TYPE_OPTIONS = ['', ...SERVICE_TYPES];

export default function Payment() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    visitId: string;
    patientName: string;
    token: string;
  }>();
  const { staff } = useAuthStore();

  const [amount, setAmount] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [notes, setNotes] = useState('');
  const [waived, setWaived] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showServicePicker, setShowServicePicker] = useState(false);

  const visitId = params.visitId;
  const patientName = params.patientName ? decodeURIComponent(params.patientName) : 'Patient';
  const token = params.token;

  const handleRecordPayment = async () => {
    if (!visitId || !staff?.id) return;

    if (!waived && (!amount || parseInt(amount) <= 0)) {
      Alert.alert('Error', 'Please enter a valid amount.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await recordPayment(visitId, staff.id, {
        amount_ugx: waived ? 0 : parseInt(amount),
        payment_method: 'cash',
        service_type: serviceType || undefined,
        notes: notes || undefined,
        waived,
      });

      router.replace(
        `/success?token=${token}&receiptNumber=${result.receipt_number}&paymentAmount=${waived ? 0 : amount}&paymentStatus=${waived ? 'waived' : 'paid'}`
      );
    } catch (error) {
      console.error('Failed to record payment:', error);
      Alert.alert('Error', 'Failed to record payment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSkip = () => {
    Alert.alert(
      'Skip Payment',
      'The visit will be completed without a payment record. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Skip',
          onPress: async () => {
            setSubmitting(true);
            try {
              await skipPayment(visitId);
              router.replace(`/success?token=${token}`);
            } catch (error) {
              console.error('Failed to skip:', error);
              Alert.alert('Error', 'Something went wrong.');
            } finally {
              setSubmitting(false);
            }
          },
        },
      ]
    );
  };

  const formatAmount = (text: string) => {
    const digits = text.replace(/[^0-9]/g, '');
    setAmount(digits);
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>Record Payment</Text>
        <Text style={styles.subtitle}>{patientName}</Text>

        {/* Waive toggle */}
        <Card style={styles.waiveCard}>
          <View style={styles.waiveRow}>
            <View style={styles.waiveText}>
              <Text style={styles.waiveLabel}>Waive Payment</Text>
              <Text style={styles.waiveHint}>Patient unable to pay</Text>
            </View>
            <Switch
              value={waived}
              onValueChange={setWaived}
              trackColor={{ false: '#D1D5DB', true: '#93C5FD' }}
              thumbColor={waived ? '#2563EB' : '#F9FAFB'}
            />
          </View>
        </Card>

        {/* Amount */}
        {!waived && (
          <View style={styles.field}>
            <Text style={styles.label}>Amount (UGX) *</Text>
            <View style={styles.amountRow}>
              <Text style={styles.currency}>UGX</Text>
              <TextInput
                style={styles.amountInput}
                value={amount}
                onChangeText={formatAmount}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#9CA3AF"
              />
            </View>
          </View>
        )}

        {/* Payment method — cash only for Phase 1 */}
        <View style={styles.field}>
          <Text style={styles.label}>Payment Method</Text>
          <View style={styles.methodRow}>
            <View style={[styles.methodOption, styles.methodSelected]}>
              <Ionicons name="cash-outline" size={20} color="#0369A1" />
              <Text style={[styles.methodText, styles.methodTextSelected]}>Cash</Text>
            </View>
            <View style={[styles.methodOption, styles.methodDisabled]}>
              <Text style={styles.methodTextDisabled}>MTN MoMo</Text>
              <Text style={styles.comingSoon}>Soon</Text>
            </View>
            <View style={[styles.methodOption, styles.methodDisabled]}>
              <Text style={styles.methodTextDisabled}>Airtel</Text>
              <Text style={styles.comingSoon}>Soon</Text>
            </View>
          </View>
        </View>

        {/* Service type */}
        <View style={styles.field}>
          <Text style={styles.label}>Service Type</Text>
          <TouchableOpacity
            style={styles.picker}
            onPress={() => setShowServicePicker(!showServicePicker)}
          >
            <Text style={serviceType ? styles.pickerText : styles.pickerPlaceholder}>
              {serviceType || 'Select service type'}
            </Text>
            <Ionicons name="chevron-down" size={20} color="#6B7280" />
          </TouchableOpacity>
          {showServicePicker && (
            <View style={styles.pickerOptions}>
              {SERVICE_TYPE_OPTIONS.map((type) => (
                <TouchableOpacity
                  key={type || 'none'}
                  style={[
                    styles.pickerOption,
                    serviceType === type && styles.pickerOptionSelected,
                  ]}
                  onPress={() => {
                    setServiceType(type);
                    setShowServicePicker(false);
                  }}
                >
                  <Text
                    style={[
                      styles.pickerOptionText,
                      serviceType === type && styles.pickerOptionTextSelected,
                    ]}
                  >
                    {type || 'None'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Notes */}
        <View style={styles.field}>
          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            style={styles.notesInput}
            value={notes}
            onChangeText={setNotes}
            multiline
            placeholder="Additional payment notes..."
            placeholderTextColor="#9CA3AF"
          />
        </View>
      </ScrollView>

      {/* Actions */}
      <View style={styles.actions}>
        <Button
          title={waived ? 'Record Waiver' : 'Record Payment'}
          onPress={handleRecordPayment}
          loading={submitting}
          size="large"
        />
        <TouchableOpacity onPress={handleSkip} disabled={submitting} style={styles.skipButton}>
          <Text style={styles.skipText}>Skip Payment</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 24,
  },
  waiveCard: {
    marginBottom: 20,
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
  },
  waiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  waiveText: {
    flex: 1,
  },
  waiveLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
  },
  waiveHint: {
    fontSize: 13,
    color: '#B45309',
    marginTop: 2,
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  currency: {
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    paddingVertical: 14,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
  },
  methodOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 6,
  },
  methodSelected: {
    borderColor: '#0369A1',
    backgroundColor: '#F0F9FF',
  },
  methodDisabled: {
    opacity: 0.5,
    backgroundColor: '#F9FAFB',
  },
  methodText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  methodTextSelected: {
    color: '#0369A1',
  },
  methodTextDisabled: {
    fontSize: 13,
    color: '#9CA3AF',
  },
  comingSoon: {
    fontSize: 10,
    color: '#9CA3AF',
    position: 'absolute',
    bottom: 2,
    right: 6,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  pickerText: {
    fontSize: 16,
    color: '#1A1A1A',
  },
  pickerPlaceholder: {
    fontSize: 16,
    color: '#9CA3AF',
  },
  pickerOptions: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    marginTop: 4,
  },
  pickerOption: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  pickerOptionSelected: {
    backgroundColor: '#F0F9FF',
  },
  pickerOptionText: {
    fontSize: 15,
    color: '#374151',
  },
  pickerOptionTextSelected: {
    color: '#0369A1',
    fontWeight: '600',
  },
  notesInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#1A1A1A',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actions: {
    padding: 24,
    paddingTop: 16,
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    alignItems: 'center',
  },
  skipButton: {
    paddingVertical: 8,
  },
  skipText: {
    fontSize: 14,
    color: '#6B7280',
    textDecorationLine: 'underline',
  },
});
