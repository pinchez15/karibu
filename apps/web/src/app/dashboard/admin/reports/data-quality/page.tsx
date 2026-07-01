import { getStaff, hasDataReportsAccess } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getDataQualityStats } from '../actions'

export default async function DataQualityPage() {
  const staff = await getStaff()
  if (!staff) redirect('/')

  if (!(await hasDataReportsAccess())) redirect('/dashboard')

  const result = await getDataQualityStats()
  if (result.error || !result.data) {
    return (
      <div className="p-4">
        <p className="text-destructive">Failed to load data quality stats</p>
      </div>
    )
  }

  const stats = result.data

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/admin/reports">
          <Button variant="ghost" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Reports
          </Button>
        </Link>
      </div>

      <div>
        <h2 className="text-2xl font-bold">Data Quality</h2>
        <p className="text-muted-foreground mt-1">
          Review and fix missing data that affects HMIS reporting accuracy
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-xl p-6 border border-border">
          <p className="text-sm font-medium text-muted-foreground">HMIS Coding Rate</p>
          <p className="text-3xl font-bold mt-2">
            {stats.total_visits > 0
              ? `${Math.round((stats.coded_visits / stats.total_visits) * 100)}%`
              : '-'}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {stats.coded_visits} of {stats.total_visits} finalized visits coded
          </p>
        </div>

        <div className={`rounded-xl p-6 shadow-sm border ${
          stats.missing_sex > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-card border-border'
        }`}>
          <p className="text-sm font-medium text-muted-foreground">Patients Missing Sex</p>
          <p className="text-3xl font-bold mt-2">{stats.missing_sex}</p>
          <p className="text-sm text-muted-foreground mt-1">
            of {stats.total_patients} total patients
          </p>
        </div>

        <div className={`rounded-xl p-6 shadow-sm border ${
          stats.missing_dob > 0 ? 'bg-amber-500/10 border-amber-500/30' : 'bg-card border-border'
        }`}>
          <p className="text-sm font-medium text-muted-foreground">Patients Missing Age Data</p>
          <p className="text-3xl font-bold mt-2">{stats.missing_dob}</p>
          <p className="text-sm text-muted-foreground mt-1">
            of {stats.total_patients} total patients
          </p>
        </div>
      </div>

      {/* Issue lists side-by-side + each scrollable, so a long list never
          buries the sections below it (#12). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 items-start">
      {/* Uncoded visits */}
      {stats.uncoded_visit_ids.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold">
              Uncoded Visits ({stats.uncoded_visits})
            </h3>
            <p className="text-sm text-muted-foreground">
              Finalized visits without HMIS diagnosis codes
            </p>
          </div>
          <div className="max-h-72 divide-y divide-border overflow-y-auto">
            {stats.uncoded_visit_ids.map((visit) => (
              <Link
                key={visit.id}
                href={`/dashboard/visits/${visit.id}`}
                className="flex items-center justify-between p-3 hover:bg-muted transition-colors"
              >
                <div>
                  <span className="font-medium text-sm">
                    {visit.patient_name || 'Unknown Patient'}
                  </span>
                  <span className="text-sm text-muted-foreground ml-3">
                    {new Date(visit.visit_date).toLocaleDateString()}
                  </span>
                </div>
                <span className="text-sm text-primary">Code Now</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Patients missing sex */}
      {stats.patients_missing_sex.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold">
              Patients Missing Sex ({stats.missing_sex})
            </h3>
            <p className="text-sm text-muted-foreground">
              Cannot disaggregate by sex for HMIS 105 reporting
            </p>
          </div>
          <div className="max-h-72 divide-y divide-border overflow-y-auto">
            {stats.patients_missing_sex.map((patient) => (
              <Link
                key={patient.id}
                href={`/dashboard/patients/${patient.id}`}
                className="flex items-center justify-between p-3 hover:bg-muted transition-colors"
              >
                <div>
                  <span className="font-medium text-sm">
                    {patient.display_name || 'Unknown'}
                  </span>
                  <span className="text-sm text-muted-foreground ml-3 font-mono">
                    {patient.whatsapp_number}
                  </span>
                </div>
                <span className="text-sm text-primary">Edit</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Patients missing DOB */}
      {stats.patients_missing_dob.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="font-semibold">
              Patients Missing Age Data ({stats.missing_dob})
            </h3>
            <p className="text-sm text-muted-foreground">
              No date of birth, birth year, or age estimate — cannot disaggregate by
              age group for HMIS 105 reporting
            </p>
          </div>
          <div className="max-h-72 divide-y divide-border overflow-y-auto">
            {stats.patients_missing_dob.map((patient) => (
              <Link
                key={patient.id}
                href={`/dashboard/patients/${patient.id}`}
                className="flex items-center justify-between p-3 hover:bg-muted transition-colors"
              >
                <div>
                  <span className="font-medium text-sm">
                    {patient.display_name || 'Unknown'}
                  </span>
                  <span className="text-sm text-muted-foreground ml-3 font-mono">
                    {patient.whatsapp_number}
                  </span>
                </div>
                <span className="text-sm text-primary">Edit</span>
              </Link>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* All clear */}
      {stats.uncoded_visit_ids.length === 0 &&
        stats.patients_missing_sex.length === 0 &&
        stats.patients_missing_dob.length === 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-6 text-center">
          <p className="text-accent font-medium">All data quality checks passed</p>
          <p className="text-sm text-accent/80 mt-1">
            All patients have sex and age data recorded, and all finalized visits are coded.
          </p>
        </div>
      )}
    </div>
  )
}
