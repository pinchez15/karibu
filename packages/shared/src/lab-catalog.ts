/** HC III lab test catalog — mirrors lab_test_catalog (migration 069) so the
 *  web/Android order pickers send exact catalog names, never free text. */

export interface LabCatalogTest {
  code: string;
  name: string;
  category: string;
  specimen: string;
}

export const LAB_CATALOG_TESTS: LabCatalogTest[] = [
  { code: 'MRDT', name: 'Malaria RDT', category: 'Malaria', specimen: 'blood' },
  { code: 'BS_MPS', name: 'Blood slide for malaria parasites', category: 'Malaria', specimen: 'blood' },
  { code: 'HIV_RDT', name: 'HIV rapid test', category: 'Serology', specimen: 'blood' },
  { code: 'HBSAG', name: 'Hepatitis B rapid test (HBsAg)', category: 'Serology', specimen: 'blood' },
  { code: 'BRU_RDT', name: 'Brucellosis rapid test', category: 'Serology', specimen: 'blood' },
  { code: 'HB', name: 'Haemoglobin', category: 'Haematology', specimen: 'blood' },
  { code: 'AFB', name: 'Sputum smear (AFB / TB)', category: 'Microbiology', specimen: 'sputum' },
  { code: 'URINALYSIS', name: 'Urinalysis', category: 'Urine', specimen: 'urine' },
  { code: 'STOOL_OC', name: 'Stool microscopy (ova/cysts)', category: 'Microbiology', specimen: 'stool' },
  { code: 'RBS', name: 'Random blood sugar', category: 'Biochemistry', specimen: 'blood' },
  { code: 'SYPHILIS', name: 'Syphilis test (RPR/TPHA)', category: 'Serology', specimen: 'blood' },
  { code: 'UCG', name: 'Pregnancy test (UCG)', category: 'Serology', specimen: 'urine' },
  { code: 'WIDAL', name: 'Widal test (typhoid)', category: 'Serology', specimen: 'blood' },
  { code: 'STOOL_RDT', name: 'Stool antigen / H. pylori RDT', category: 'Microbiology', specimen: 'stool' },
];

export function labTestsByCategory(): [string, LabCatalogTest[]][] {
  const map = new Map<string, LabCatalogTest[]>();
  for (const t of LAB_CATALOG_TESTS) {
    const list = map.get(t.category) ?? [];
    list.push(t);
    map.set(t.category, list);
  }
  return Array.from(map.entries());
}
