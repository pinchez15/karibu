import { redirect } from 'next/navigation'
import { Lockup } from '@/components/brand'
import { PhotoUpload, SpeedTest } from '@/components/ReadinessWidgets'
import { rpcPublic } from '@/lib/db'
import { errorMessage, text } from '@/lib/form'
import { t } from '@/i18n'

// The clinic champion opens this from WhatsApp. No login: the token in the URL
// is the key, it expires, and it exposes nothing but this clinic's own answers.
// Not indexed, not cached.
export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' as const }

type Form = {
  check_id: string
  clinic_name: string
  office_name: string
  status: 'sent' | 'submitted' | 'reviewed'
  locked: boolean
  answers: {
    power: { source?: string; backup?: boolean } | null
    devices: { android_phones?: number; tablets?: number; computers?: number; printer?: boolean } | null
    signal: { network?: string; bars?: number; down_kbps?: number } | null
    staff: { name: string; role: string; phone: string; email: string }[]
    services: string[] | null
    departments: string[] | null
    champion: { name?: string; phone?: string } | null
  }
  photos: { kind: string }[]
}

type Props = { params: Promise<{ token: string }>; searchParams: Promise<{ sent?: string; error?: string }> }

const SERVICES = ['OPD', 'Laboratory', 'Pharmacy', 'Antenatal', 'Maternity', 'Immunisation', 'Family planning', 'Inpatient', 'HIV care', 'TB care']
const DEPARTMENTS = ['opd', 'anc', 'maternity', 'family_planning', 'immunization'] as const
const STAFF_ROWS = 4

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto min-h-screen max-w-xl space-y-5 px-4 pb-16 pt-5">{<Lockup />}{children}</main>
}

export default async function ReadinessFormPage({ params, searchParams }: Props) {
  const { token } = await params
  const { sent, error } = await searchParams

  let form: Form
  try {
    form = await rpcPublic<Form>('office_readiness_form', { p_token: token })
  } catch {
    return <Shell><p className="notice-warning">{t('readinessForm.invalid')}</p></Shell>
  }
  const a = form.answers

  async function submit(data: FormData) {
    'use server'
    const num = (k: string) => Math.max(0, Math.min(999, Number(text(data, k)) || 0))
    const names = data.getAll('staff_name[]').map(String)
    const staff = names.map((name, i) => ({
      name: name.trim(),
      role: String(data.getAll('staff_role[]')[i] ?? '').trim(),
      phone: String(data.getAll('staff_phone[]')[i] ?? '').trim(),
      email: String(data.getAll('staff_email[]')[i] ?? '').trim(),
    })).filter((s) => s.name)

    let failure: string | null = null
    try {
      await rpcPublic('office_readiness_submit', {
        p_token: token,
        p_answers: {
          power: { source: text(data, 'power_source') || 'none', backup: data.get('power_backup') === 'on' },
          devices: { android_phones: num('android_phones'), tablets: num('tablets'), computers: num('computers'), printer: data.get('printer') === 'on' },
          signal: { network: text(data, 'network'), bars: Math.min(5, num('bars')), down_kbps: num('down_kbps') || null },
          champion: { name: text(data, 'champion_name'), phone: text(data, 'champion_phone') },
          staff,
          services: data.getAll('services').map(String),
          departments: data.getAll('departments').map(String),
        },
      })
    } catch (e) {
      failure = errorMessage(e, t)
    }
    redirect(`/r/${token}?${failure ? `error=${encodeURIComponent(failure)}` : 'sent=1'}`)
  }

  if (form.locked) {
    return <Shell><p className="notice-info">{t('readinessForm.locked', { office: form.office_name })}</p></Shell>
  }

  const photoCount = (kind: string) => form.photos.filter((p) => p.kind === kind).length
  const photoLabels = { add: t('readinessForm.addPhoto'), uploading: t('readinessForm.uploading'), uploaded: t('readinessForm.uploaded', { n: '{n}' }), failed: t('readinessForm.uploadFailed') }
  const staffRows = [...a.staff, ...Array.from({ length: STAFF_ROWS }, () => ({ name: '', role: '', phone: '', email: '' }))]

  return (
    <Shell>
      <div>
        <h1>{t('readinessForm.title')}</h1>
        <p className="mt-1 text-[15px]">{t('readinessForm.intro', { office: form.office_name, clinic: form.clinic_name })}</p>
      </div>
      {sent ? (
        <div className="notice-success"><p className="font-semibold">{t('readinessForm.thanks', { office: form.office_name })}</p><p>{t('readinessForm.thanksHint')}</p></div>
      ) : null}
      {error ? <p role="alert" className="notice-danger">{error}</p> : null}

      <form action={submit} className="space-y-5">
        <fieldset className="card space-y-3">
          <legend className="sr-only">{t('readinessForm.power')}</legend>
          <h2>{t('readinessForm.power')}</h2>
          <label className="field"><span>{t('readinessForm.powerSource')}</span>
            <select name="power_source" defaultValue={a.power?.source ?? 'grid'} className="input">
              {(['grid', 'solar', 'generator', 'none'] as const).map((s) => <option key={s} value={s}>{t(`readinessForm.${s}`)}</option>)}
            </select></label>
          <label className="flex min-h-touch items-center gap-3 text-ink">
            <input type="checkbox" name="power_backup" defaultChecked={a.power?.backup ?? false} className="h-5 w-5" />{t('readinessForm.backup')}
          </label>
        </fieldset>

        <fieldset className="card space-y-3">
          <h2>{t('readinessForm.devices')}</h2>
          <div className="grid grid-cols-3 gap-2">
            {([['android_phones', 'phones'], ['tablets', 'tablets'], ['computers', 'computers']] as const).map(([name, label]) => (
              <label key={name} className="field"><span>{t(`readinessForm.${label}`)}</span>
                <input name={name} type="number" inputMode="numeric" min={0} max={99} defaultValue={a.devices?.[name] ?? 0} className="input" /></label>
            ))}
          </div>
          <label className="flex min-h-touch items-center gap-3 text-ink">
            <input type="checkbox" name="printer" defaultChecked={a.devices?.printer ?? false} className="h-5 w-5" />{t('readinessForm.printer')}
          </label>
        </fieldset>

        <fieldset className="card space-y-3">
          <h2>{t('readinessForm.signal')}</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="field"><span>{t('readinessForm.network')}</span>
              <select name="network" defaultValue={a.signal?.network ?? 'MTN'} className="input">
                {['MTN', 'Airtel', 'Lycamobile', 'UTL', 'Other', 'None'].map((n) => <option key={n}>{n}</option>)}
              </select></label>
            <label className="field"><span>{t('readinessForm.bars')}</span>
              <input name="bars" type="number" inputMode="numeric" min={0} max={5} defaultValue={a.signal?.bars ?? 0} className="input" /></label>
          </div>
          <SpeedTest initial={a.signal?.down_kbps ?? null} labels={{ run: t('readinessForm.speedTest'), result: t('readinessForm.speedResult', { n: '{n}' }), failed: t('readinessForm.speedFailed') }} />
          <PhotoUpload token={token} kind="signal" initial={photoCount('signal')} labels={{ ...photoLabels, add: `${t('readinessForm.addPhoto')}: ${t('onboarding.photoKind.signal')}` }} />
        </fieldset>

        <fieldset className="card space-y-3">
          <h2>{t('readinessForm.champion')}</h2>
          <p className="text-sm">{t('readinessForm.championHint')}</p>
          <div className="grid grid-cols-2 gap-2">
            <label className="field"><span>{t('readinessForm.name')}</span><input name="champion_name" defaultValue={a.champion?.name ?? ''} className="input" /></label>
            <label className="field"><span>{t('readinessForm.phone')}</span><input name="champion_phone" type="tel" inputMode="tel" defaultValue={a.champion?.phone ?? ''} className="input" /></label>
          </div>
        </fieldset>

        <fieldset className="card space-y-3">
          <h2>{t('readinessForm.staff')}</h2>
          <p className="text-sm">{t('readinessForm.staffHint')}</p>
          {staffRows.map((s, i) => (
            <div key={i} className="grid grid-cols-2 gap-1.5 border-b border-line-soft pb-2">
              <input name="staff_name[]" defaultValue={s.name} placeholder={t('readinessForm.name')} aria-label={t('readinessForm.name')} className="input" />
              <input name="staff_role[]" defaultValue={s.role} placeholder={t('readinessForm.role')} aria-label={t('readinessForm.role')} className="input" />
              <input name="staff_phone[]" type="tel" defaultValue={s.phone} placeholder={t('readinessForm.phone')} aria-label={t('readinessForm.phone')} className="input" />
              <input name="staff_email[]" type="email" defaultValue={s.email} placeholder={t('readinessForm.email')} aria-label={t('readinessForm.email')} className="input" />
            </div>
          ))}
          <PhotoUpload token={token} kind="staff_roster" initial={photoCount('staff_roster')} labels={{ ...photoLabels, add: `${t('readinessForm.addPhoto')}: ${t('onboarding.photoKind.staff_roster')}` }} />
        </fieldset>

        <fieldset className="card space-y-2">
          <h2>{t('readinessForm.services')}</h2>
          <div className="grid grid-cols-2 gap-x-3">
            {SERVICES.map((s) => (
              <label key={s} className="flex min-h-touch items-center gap-3 text-ink">
                <input type="checkbox" name="services" value={s} defaultChecked={(a.services ?? []).includes(s)} className="h-5 w-5" />{s}
              </label>
            ))}
          </div>
          <h3 className="pt-2">{t('readinessForm.departments')}</h3>
          <div className="grid grid-cols-2 gap-x-3">
            {DEPARTMENTS.map((d) => (
              <label key={d} className="flex min-h-touch items-center gap-3 text-ink">
                <input type="checkbox" name="departments" value={d} defaultChecked={(a.departments ?? ['opd']).includes(d)} className="h-5 w-5" />{t(`onboarding.dept.${d}`)}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="card space-y-3">
          <h2>{t('readinessForm.photos')}</h2>
          <p className="text-sm">{t('readinessForm.photosHint')}</p>
          <p className="notice-warning">{t('readinessForm.noPatients')}</p>
          {(['price_list', 'drug_list'] as const).map((kind) => (
            <PhotoUpload key={kind} token={token} kind={kind} initial={photoCount(kind)} labels={{ ...photoLabels, add: `${t('readinessForm.addPhoto')}: ${t(`onboarding.photoKind.${kind}`)}` }} />
          ))}
        </fieldset>

        <button className="btn-primary w-full">{t('readinessForm.submit', { office: form.office_name })}</button>
      </form>
    </Shell>
  )
}
