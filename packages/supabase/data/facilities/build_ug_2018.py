#!/usr/bin/env python3
"""Builds the Uganda facility register seed from two public sources.

  1. Ministry of Health, "National Health Facility Master List 2018" (PDF, CC BY,
     via open.africa). The authority: district, sub-county, name, level,
     managing authority and ownership for every facility.
  2. Kisejjere, Kakande and Sserwadda, "Uganda Healthcare Facilities' Features
     and Services", Mendeley Data v2, doi:10.17632/58k7zpwt84.2 (CC BY 4.0).
     Built on the same 2018 list, with phone numbers looked up on Google Maps.
     Its authors say it is not validated, so a phone is only taken when the
     facility name AND sub-county both match the Ministry's row, and it is
     stored as unverified.

Usage (run pdftotext first; it ships with poppler):
  pdftotext -layout national-health-facility-master-list-2018.pdf mfl2018.txt
  python3 build_ug_2018.py mfl2018.txt mendeley.csv ug_facilities_2018.csv facilities.sql
"""
import csv
import re
import sys

OWNERSHIP = {'GOVT', 'PFP', 'PNFP'}
LEVELS = {'HC II', 'HC III', 'HC IV', 'Clinic', 'Hospital', 'RRH', 'NRH', 'SC', 'BCDP', 'General Hospital', 'RBB', 'NBB'}


SUBCOUNTY = re.compile(r'(Subcounty|Sub County|Town Council|Division|Municipal Council|Municipality|Town Board)$', re.I)
LEVEL_FIX = {'clinic': 'Clinic', 'CLINIC': 'Clinic'}


def key(s):
    return re.sub(r'[^a-z0-9]+', '', s.lower())


def parse_master_list(path):
    rows, skipped = [], []
    district = None
    in_list = False
    for raw in open(path, encoding='utf-8', errors='replace'):
        line = raw.rstrip()
        text = line.strip()
        m = re.match(r'^([A-Z][A-Z .\'-]+?) DISTRICT$', text)
        if m and not text.startswith('SUMMARY'):
            district = m.group(1).title()
            in_list = True
            continue
        if not in_list or not text:
            continue
        parts = re.split(r'\s{2,}', text)
        if len(parts) >= 6 and parts[-1] in OWNERSHIP:
            hsd, subcounty = parts[0], parts[1]
            name = ' '.join(parts[2:-3])
            level, authority, ownership = parts[-3], parts[-2], parts[-1]
            rows.append(dict(district=district, subcounty=subcounty, name=name, level=level, authority=authority, ownership=ownership))
        elif len(parts) == 5 and parts[-1] in OWNERSHIP:
            # One cell is blank in the report. Work out which from what the others look like.
            a, b = parts[0], parts[1]
            level, authority, ownership = parts[-3], parts[-2], parts[-1]
            if SUBCOUNTY.search(a) and not SUBCOUNTY.search(b):      # health sub-district missing
                rows.append(dict(district=district, subcounty=a, name=b, level=level, authority=authority, ownership=ownership))
            elif not SUBCOUNTY.search(b):                            # sub-county missing
                rows.append(dict(district=district, subcounty='', name=b, level=level, authority=authority, ownership=ownership))
            else:                                                    # the name itself is missing: nothing to list
                skipped.append(text)
        elif parts[-1] in OWNERSHIP:
            skipped.append(text)
    return rows, skipped


def phone_ok(p):
    digits = re.sub(r'\D', '', p or '')
    return 9 <= len(digits) <= 13


def main(master_txt, mendeley_csv, out_csv, out_sql):
    rows, skipped = parse_master_list(master_txt)

    phones = {}
    clash = set()
    for r in csv.DictReader(open(mendeley_csv, encoding='utf-8-sig', errors='replace')):
        k = (key(r['facility_name']), key(r['Subcounty']))
        p = (r.get('phone_number') or '').strip()
        if not phone_ok(p):
            continue
        if k in phones and phones[k] != p:
            clash.add(k)
        phones[k] = p
    # The same number against many facilities is a call centre or a bad match.
    counts = {}
    for p in phones.values():
        counts[p] = counts.get(p, 0) + 1

    seen = set()
    out = []
    for r in rows:
        k = (key(r['district']), key(r['subcounty']), key(r['name']))
        if k in seen:
            continue
        seen.add(k)
        pk = (key(r['name']), key(r['subcounty']))
        phone = phones.get(pk) if pk not in clash else None
        if phone and counts[phone] > 2:
            phone = None
        out.append({**r, 'level': LEVEL_FIX.get(r['level'], r['level']), 'phone': phone or ''})

    fields = ['district', 'subcounty', 'name', 'level', 'authority', 'ownership', 'phone']
    with open(out_csv, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(out)

    def q(s):
        return "'" + s.replace("'", "''") + "'" if s else 'NULL'

    with open(out_sql, 'w', encoding='utf-8') as f:
        for i in range(0, len(out), 500):
            f.write('INSERT INTO office.facilities (country, district, subcounty, name, level, authority, ownership, phone, phone_source, source, source_year) VALUES\n')
            chunk = out[i:i + 500]
            f.write(',\n'.join(
                f"('UG', {q(r['district'])}, {q(r['subcounty']) if r['subcounty'] else "''"}, {q(r['name'])}, {q(r['level'])}, {q(r['authority'])}, {q(r['ownership'])}, "
                f"{q(r['phone'])}, {q('google_maps_unverified') if r['phone'] else 'NULL'}, 'moh_master_list', 2018)"
                for r in chunk))
            f.write('\nON CONFLICT DO NOTHING;\n\n')

    print(f'facilities: {len(out)}  (parsed {len(rows)}, duplicates dropped {len(rows) - len(out)}, unparsed lines {len(skipped)})')
    print(f'with a phone: {sum(1 for r in out if r["phone"])}')
    return out, skipped


if __name__ == '__main__':
    main(*sys.argv[1:5])
