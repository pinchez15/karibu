import { Flash, PageHeader } from '@/components/ui'
import { getOfficeScope } from '@/lib/auth'
import { t } from '@/i18n'
import { importClinicsAction } from '../actions'

type Props = { params: Promise<{ office: string }>; searchParams: Promise<{ error?: string; results?: string }> }

const STATUS = ['created', 'duplicate', 'conflict', 'error'] as const
const CHIP = { created: 'chip-success', duplicate: 'chip-neutral', conflict: 'chip-warning', error: 'chip-danger' } as const

export default async function ImportPage({ params, searchParams }: Props) {
  const { office: slug } = await params
  const { error, results } = await searchParams
  await getOfficeScope(slug)

  // The action passes one "status:name" pair per row in the URL.
  const rows = (results ?? '').split('|').filter(Boolean).map((r) => {
    const [code, ...name] = r.split(':')
    return { code, name: name.join(':') }
  })

  return (
    <>
      <PageHeader title={t('clinics.importTitle')} back={`/o/${slug}/clinics`} />
      <Flash error={error} />

      {rows.length > 0 ? (
        <div className="card space-y-3">
          <p className="font-semibold text-ink">
            {t('clinics.importSummary', {
              created: rows.filter((r) => r.code === 'created').length,
              skipped: rows.filter((r) => r.code !== 'created').length,
            })}
          </p>
          <ul className="divide-y divide-line-soft">
            {rows.map((r, i) => {
              const status = (STATUS as readonly string[]).includes(r.code) ? (r.code as keyof typeof CHIP) : 'error'
              return (
                <li key={i} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate text-ink">{r.name || '—'}</span>
                  <span className={`shrink-0 ${CHIP[status]}`}>{t(`clinics.importResult.${status}`)}</span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <form action={importClinicsAction.bind(null, slug)} className="space-y-4">
        <p className="text-sm">{t('clinics.importHint')}</p>
        <input type="file" name="file" accept=".csv,text/csv,text/plain" className="input" />
        <label className="field">
          <span>{t('clinics.importPaste')}</span>
          <textarea name="pasted" rows={5} className="input font-mono text-sm" placeholder={'name,district,contact_phone\nKitanda HC III,Masaka,0700123456'} />
        </label>
        <button className="btn-primary w-full">{t('clinics.importRun')}</button>
      </form>
    </>
  )
}
