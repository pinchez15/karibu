import type { RetrievedChunk } from './validate-suggestion.js'

/**
 * Static fake corpus chunks (ids 1–5) for eval retrieval — no Supabase required.
 */
export const MOCK_CORPUS_CHUNKS: RetrievedChunk[] = [
  {
    id: 1,
    document_id: 101,
    document_title: 'Uganda Clinical Guidelines — Malaria',
    document_slug: 'ug-malaria-2023',
    source_org: 'MOH Uganda',
    source_year: 2023,
    section: 'Diagnosis and treatment',
    section_anchor: 'malaria-diagnosis',
    content:
      'All suspected malaria cases must be confirmed with an RDT or blood smear before starting ACT. Do not prescribe artemether-lumefantrine without a positive malaria test unless RDT is unavailable and clinical diagnosis is strongly supported. Re-test if fever persists after completed ACT course.',
    distance: 0.12,
  },
  {
    id: 2,
    document_id: 102,
    document_title: 'IMCI Chart Booklet — Pneumonia',
    document_slug: 'imci-pneumonia',
    source_org: 'WHO',
    source_year: 2022,
    section: 'Classify cough or difficult breathing',
    section_anchor: 'pneumonia-classification',
    content:
      'Fast breathing: respiratory rate ≥50/min in infants 2–11 months, ≥40/min in children 12–59 months. Chest indrawing is a general danger sign. Pneumonia with chest indrawing or very severe disease requires urgent referral or inpatient care. Give first dose of appropriate antibiotic before referral when possible.',
    distance: 0.18,
  },
  {
    id: 3,
    document_id: 103,
    document_title: 'IMCI — General danger signs',
    document_slug: 'imci-danger-signs',
    source_org: 'WHO',
    source_year: 2022,
    section: 'Assess general danger signs',
    section_anchor: 'danger-signs',
    content:
      'General danger signs: unable to drink or breastfeed, vomiting everything, convulsions this illness, lethargic or unconscious, convulsing now, or chest indrawing. Any danger sign requires urgent assessment and referral. Do not send home without addressing danger signs.',
    distance: 0.22,
  },
  {
    id: 4,
    document_id: 104,
    document_title: 'Uganda Clinical Guidelines — Upper respiratory infection',
    document_slug: 'ug-uri-2023',
    source_org: 'MOH Uganda',
    source_year: 2023,
    section: 'Common cold and mild URI',
    section_anchor: 'uri-mild',
    content:
      'Uncomplicated upper respiratory infection with runny nose, mild cough, and no fever or danger signs does not require antibiotics. Advise fluids, rest, and return if breathing difficulty, high fever, or danger signs develop.',
    distance: 0.35,
  },
  {
    id: 5,
    document_id: 105,
    document_title: 'Uganda Clinical Guidelines — Dehydration',
    document_slug: 'ug-dehydration-2023',
    source_org: 'MOH Uganda',
    source_year: 2023,
    section: 'Severe dehydration',
    section_anchor: 'dehydration-severe',
    content:
      'Severe dehydration: lethargy, sunken eyes, skin pinch goes back very slowly, unable to drink. Treat with IV fluids or urgent referral. ORS alone is insufficient for severe dehydration. Assess for shock and treat immediately.',
    distance: 0.28,
  },
]

/** Default HC III lab and pharmacy lists used across golden cases. */
export const DEFAULT_LABS = [
  'Malaria RDT',
  'Blood smear',
  'Hemoglobin',
  'Blood glucose',
  'Urinalysis',
  'HIV rapid test',
  'Blood culture',
]

export const DEFAULT_DRUGS = [
  'Artemether-lumefantrine (Coartem)',
  'Amoxicillin',
  'Paracetamol',
  'ORS sachets',
  'Zinc tablets',
  'Metronidazole',
  'Cotrimoxazole',
]
