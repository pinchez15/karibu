import { describe, expect, it } from 'vitest'
import { clinicRowsFromCsv, parseCsv } from './csv'

describe('parseCsv', () => {
  it('handles quotes, embedded commas and newlines, CRLF and a BOM', () => {
    const csv = '﻿name,notes\r\n"Kitanda HC III","Asked for a demo, call ""Sr. Grace"""\r\n"Two\nLines",x\r\n\r\n'
    expect(parseCsv(csv)).toEqual([
      ['name', 'notes'],
      ['Kitanda HC III', 'Asked for a demo, call "Sr. Grace"'],
      ['Two\nLines', 'x'],
    ])
  })
})

describe('clinicRowsFromCsv', () => {
  it('maps common header spellings and drops rows with no name', () => {
    const csv = 'Facility Name,District,Phone,Level\nBukoto HC II,Masaka,0700 111222,HC II\n,Masaka,,\n'
    expect(clinicRowsFromCsv(csv)).toEqual([
      { name: 'Bukoto HC II', district: 'Masaka', contact_phone: '0700 111222', facility_level: 'HC II' },
    ])
  })

  it('refuses a file with no name column', () => {
    expect(() => clinicRowsFromCsv('district,phone\nMasaka,07\n')).toThrow('NO_NAME_COLUMN')
  })
})
