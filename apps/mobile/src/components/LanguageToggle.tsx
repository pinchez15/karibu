import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SourceLanguage } from '@karibu/shared';

interface LanguageToggleProps {
  value: SourceLanguage;
  onValueChange: (value: SourceLanguage) => void;
}

export function LanguageToggle({ value, onValueChange }: LanguageToggleProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Visit Language</Text>
      <Text style={styles.hint}>
        Select based on the language the patient will speak during this visit
      </Text>
      <View style={styles.options}>
        <TouchableOpacity
          style={[styles.option, value === 'eng' && styles.optionSelected]}
          onPress={() => onValueChange('eng')}
          activeOpacity={0.7}
        >
          <Ionicons
            name={value === 'eng' ? 'radio-button-on' : 'radio-button-off'}
            size={22}
            color={value === 'eng' ? '#0369A1' : '#9CA3AF'}
          />
          <View style={styles.optionContent}>
            <Text style={[styles.optionTitle, value === 'eng' && styles.optionTitleSelected]}>
              English
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.option, styles.optionDisabled]}
          activeOpacity={1}
          disabled
        >
          <Ionicons
            name="radio-button-off"
            size={22}
            color="#D1D5DB"
          />
          <View style={styles.optionContent}>
            <Text style={[styles.optionTitle, styles.optionTitleDisabled]}>
              Local Language
            </Text>
            <Text style={styles.optionSubtitle}>
              Coming soon — Luganda, Acholi, Runyankole, Ateso, Lugbara, Swahili
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  hint: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 12,
  },
  options: {
    gap: 8,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 12,
  },
  optionSelected: {
    borderColor: '#0369A1',
    backgroundColor: '#F0F9FF',
  },
  optionContent: {
    flex: 1,
  },
  optionTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#374151',
  },
  optionTitleSelected: {
    color: '#0369A1',
  },
  optionSubtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  optionDisabled: {
    opacity: 0.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
  },
  optionTitleDisabled: {
    color: '#9CA3AF',
  },
});
