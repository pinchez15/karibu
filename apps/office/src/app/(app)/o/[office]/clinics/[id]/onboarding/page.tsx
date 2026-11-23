import { FORMULATIONS } from '@/lib/ai/extract'
import { Flash, PageHeader, Section, WhatsAppButton } from '@/components/ui'
import { getMe, getOfficeScope } from '@/lib/auth'
import { linkClinicAction } from '@/app/(app)/foundation/actions'
import { relativeDay, shortDate } from '@/lib/dates'
import { rpc } from '@/lib/db'
import { ehrUrl, officeUrl } from '@/lib/share'
import { t } from '@/i18n'
import { extractAction, inviteStaffAction, provisionAction, reviewReadinessAction, saveDraftAction, startOnboardingAction } from './actions'
import { EHR_ROLES, guessRole, type CheckKey, type Draft, type Onboarding } from './types'
import { updateClinicAction } from '../../actions'

type Props = { params: Promise<{ office: string; id: string }>; searchParams: Promise<{ ok?: string; error?: string }> }

const SCORE_NOTICE = { green: 'notice-success', amber: 'notice-warning', red: 'notice-danger' } as const
const STATUS_CHIP = { pass: 'chip-success', warn: 'chip-warning', fail: 'chip-danger' } as const
const DEPARTMENTS = ['opd', 'anc', 'maternity', 'family_planning', 'immunization'] as const
const SERVICE_KINDS = ['consultation', 'lab', 'procedure', 'other'] as const
const BLANK_ROWS = 3

const slugify = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)
const cell = 'input min-h-0 px-2 py-2 text-sm'

function DraftStatus({ draft }: { draft?: Draft }) {
  if (!draft) return null
  if (draft.status === 'applied') return <span className="chip-success">{t('onboarding.applied')}</span>
  if (draft.status === 'approved') return <span className="chip-success">{t('onboarding.approved')}</span>
  if (draft.source === 'ai') return <span className="chip-warning">{t('onboarding.aiDraft')}</span>
  return null
}

export default async function OnboardingPage({ params, searchParams }: Props) {
  const { office: slug, id } = await params
  const flash = await searchParams
  await getOfficeScope(slug)
  const data = await rpc<Onboarding>('office_onboarding_get', { p_account_id: id })
  const { account: c, readiness: r, drafts, training, score, clinic } = data
  const me = await getMe()
  const unlinked = me?.is_central && !clinic
    ? await rpc<{ id: string; name: string; district: string | null }[]>('office_admin_unlinked_clinics').catch(() => [])
    : []
  const back = `/o/${slug}/clinics/${id}`
  const isLive = ['live', 'steady', 'billed'].includes(c.stage)
  const formUrl = r ? officeUrl(`/r/${r.token}`) : null
  const photosOf = (kind: string) => (r?.photos ?? []).filter((p) => p.kind === kind).length
  const status = Object.fromEntries(score.checks.map((ch) => [ch.key, ch.status])) as Record<CheckKey, 'pass' | 'warn' | 'fail'>

  // The go-live checklist is whatever is still open, then the standing items for the chosen mode.
  const open: string[] = []
  if (!score.submitted) open.push(t('onboarding.todo.form'))
  for (const key of ['power', 'devices', 'signal', 'champion', 'catalog'] as const) {
    if (status[key] !== 'pass' && (score.submitted || key === 'champion' || key === 'catalog')) open.push(t(`onboarding.todo.${key}`))
  }
  if (!clinic) open.push(t('onboarding.todo.provision'))
  if (status.training !== 'pass') open.push(t('onboarding.todo.training'))
  const dayOf = [
    c.go_live_mode === 'remote' ? t('onboarding.todo.call') : null,
    r?.devices?.printer ? t('onboarding.todo.printer') : null,
    t('onboarding.todo.paper'),
    t('onboarding.todo.firstPatient'),
  ].filter((x): x is string => Boolean(x))

  const staffRows: Record<string, string>[] = (drafts.staff?.rows ?? []).map((row) => ({ ...row, role: (EHR_ROLES as readonly string[]).includes(row.role) ? row.role : guessRole(row.role ?? '') }))
  const phoneByName = new Map((r?.staff ?? []).map((s) => [s.name.toLowerCase(), s.phone]))

  return (
    <>
      <PageHeader title={`${t('onboarding.title')}: ${c.name}`} back={back} />
      <Flash {...flash} />

      {isLive ? (
        <p className="notice-success font-semibold">{t('onboarding.live')}</p>
      ) : (
        <div className={SCORE_NOTICE[score.score]}>
          <p className="text-base font-semibold">{t(`onboarding.score.${score.score}`)}</p>
          <p>{t('onboarding.rule')}</p>
        </div>
      )}

      <ul className="card divide-y divide-line-soft py-1">
        {score.checks.map((ch) => (
          <li key={ch.key} className="flex items-center justify-between gap-2 py-2.5 text-sm">
            <span className="text-ink">
              {t(`onboarding.check.${ch.key}`)}
              {ch.key === 'training' && training.total > 0 ? ` · ${t('onboarding.trainingCount', { trained: training.trained, total: training.total })}` : ''}
            </span>
            <span className={STATUS_CHIP[ch.status]}>{t(`onboarding.status.${ch.status}`)}</span>
          </li>
        ))}
      </ul>

      {/* 1. Readiness form */}
      <div id="form" className="scroll-mt-20">
        <Section title={t('onboarding.step1')}>
          {!r || r.expired ? (
            <form action={startOnboardingAction.bind(null, slug, id)} className="card space-y-3">
              <p className="text-sm">{r?.expired ? t('onboarding.linkExpired') : t('onboarding.startHint')}</p>
              <label className="field"><span>{t('clinic.championName')}</span><input name="champion_name" defaultValue={c.champion_name ?? c.contact_name ?? ''} className="input" /></label>
              <label className="field"><span>{t('clinic.championPhone')}</span><input name="champion_phone" type="tel" inputMode="tel" defaultValue={c.champion_phone ?? c.contact_phone ?? ''} className="input" /></label>
              <button className="btn-primary w-full">{t('onboarding.start')}</button>
            </form>
          ) : (
            <div className="card space-y-3">
              {r.status === 'sent' ? <p className="text-sm">{t('onboarding.waiting')}</p> : null}
              {r.status !== 'reviewed' ? (
                <>
                  <p className="break-all font-mono text-xs">{formUrl}</p>
                  <p className="text-xs text-muted">{t('onboarding.linkExpires', { date: shortDate(r.expires_at) })}</p>
                  <WhatsAppButton
                    className="btn-whatsapp w-full"
                    phone={c.champion_phone ?? c.contact_phone}
                    label={r.status === 'sent' ? t('common.shareWhatsApp') : t('onboarding.resend')}
                    text={t('onboarding.formMessage', { name: c.champion_name ?? c.contact_name ?? '', clinic: c.name, url: formUrl! })}
                  />
                </>
              ) : null}
              {r.submitted_at ? (
                <dl className="space-y-2 border-t border-line-soft pt-3 text-sm">
                  <p className="meta">{t('onboarding.submitted', { when: relativeDay(r.submitted_at, t) })}</p>
                  <div><dt className="font-medium text-ink">{t('onboarding.answers.power')}</dt>
                    <dd>{r.power?.source ?? '—'} · {r.power?.backup ? t('onboarding.answers.backup') : t('onboarding.answers.noBackup')}</dd></div>
                  <div><dt className="font-medium text-ink">{t('onboarding.answers.devices')}</dt>
                    <dd>{[
                      t('onboarding.answers.phones', { n: r.devices?.android_phones ?? 0 }),
                      t('onboarding.answers.tablets', { n: r.devices?.tablets ?? 0 }),
                      t('onboarding.answers.computers', { n: r.devices?.computers ?? 0 }),
                      r.devices?.printer ? t('onboarding.answers.printer') : null,
                    ].filter(Boolean).join(' · ')}</dd></div>
                  <div><dt className="font-medium text-ink">{t('onboarding.answers.signal')}</dt>
                    <dd>{[r.signal?.network, t('onboarding.answers.bars', { n: r.signal?.bars ?? 0 }), r.signal?.down_kbps ? t('onboarding.answers.speed', { n: r.signal.down_kbps }) : null].filter(Boolean).join(' · ')}</dd></div>
                  {r.services?.length ? <div><dt className="font-medium text-ink">{t('onboarding.answers.services')}</dt><dd>{r.services.join(', ')}</dd></div> : null}
                  <div><dt className="font-medium text-ink">{t('onboarding.answers.photos')}</dt>
                    <dd>{(['price_list', 'drug_list', 'staff_roster', 'signal'] as const).map((k) => `${t(`onboarding.photoKind.${k}`)}: ${photosOf(k)}`).join(' · ')}</dd></div>
                </dl>
              ) : null}
              {r.status === 'submitted' ? (
                <form action={reviewReadinessAction.bind(null, slug, id)}><button className="btn-secondary w-full">{t('onboarding.markReviewed')}</button></form>
              ) : r.status === 'reviewed' ? <p className="text-sm text-muted">{t('onboarding.reviewed')}</p> : null}
            </div>
          )}
        </Section>
      </div>

      {/* 2. Catalogs */}
      <Section title={t('onboarding.step2')}>
        <p className="text-sm">{t('onboarding.extractHint')}</p>

        {(['drugs', 'services'] as const).map((kind) => {
          const draft = drafts[kind]
          const locked = draft?.status === 'applied'
          const rows = [...(draft?.rows ?? []), ...(locked ? [] : Array.from({ length: BLANK_ROWS }, () => ({} as Record<string, string>)))]
          const photoKind = kind === 'drugs' ? 'drug_list' : 'price_list'
          return (
            <div key={kind} id={kind} className="card scroll-mt-20 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3>{t(`onboarding.${kind}`)}</h3>
                <DraftStatus draft={draft} />
              </div>

              {!locked ? (
                photosOf(photoKind) > 0 ? (
                  <form action={extractAction.bind(null, slug, id, kind)}>
                    <button className="btn-secondary w-full">{t('onboarding.extract')} ({photosOf(photoKind)})</button>
                  </form>
                ) : <p className="text-sm text-muted">{t('onboarding.noPhotos')}</p>
              ) : null}

              {draft?.status === 'applied' && kind === 'drugs' && draft.apply_result ? (
                <p className="text-sm">{t('onboarding.appliedDrugs', { created: draft.apply_result.created ?? 0, updated: draft.apply_result.updated ?? 0 })}</p>
              ) : null}
              {draft?.status === 'applied' && kind === 'services' && (draft.apply_result?.not_applied ?? 0) > 0 ? (
                <p className="text-sm">{t('onboarding.notApplied', { n: draft.apply_result!.not_applied! })}</p>
              ) : null}

              <form action={saveDraftAction.bind(null, slug, id, kind)} className="space-y-3">
                <input type="hidden" name="source" value={draft?.source ?? 'manual'} />
                <fieldset disabled={locked} className="space-y-2">
                  {rows.map((row, i) => kind === 'drugs' ? (
                    <div key={i} className="grid grid-cols-6 gap-1.5 border-b border-line-soft pb-2">
                      <input name="name[]" defaultValue={row.name ?? ''} placeholder={t('onboarding.col.name')} aria-label={t('onboarding.col.name')} className={`${cell} col-span-4`} />
                      <input name="strength[]" defaultValue={row.strength ?? ''} placeholder={t('onboarding.col.strength')} aria-label={t('onboarding.col.strength')} className={`${cell} col-span-2`} />
                      <select name="formulation[]" defaultValue={row.formulation || 'tablet'} aria-label={t('onboarding.col.form')} className={`${cell} col-span-2`}>
                        {FORMULATIONS.map((f) => <option key={f}>{f}</option>)}
                      </select>
                      <input name="unit_price[]" defaultValue={row.unit_price ?? ''} placeholder={t('onboarding.col.price')} aria-label={t('onboarding.col.price')} inputMode="numeric" className={`${cell} col-span-2`} />
                      <input name="quantity[]" defaultValue={row.quantity ?? ''} placeholder={t('onboarding.col.qty')} aria-label={t('onboarding.col.qty')} inputMode="numeric" className={`${cell} col-span-2`} />
                    </div>
                  ) : (
                    <div key={i} className="grid grid-cols-6 gap-1.5 border-b border-line-soft pb-2">
                      <input name="name[]" defaultValue={row.name ?? ''} placeholder={t('onboarding.col.name')} aria-label={t('onboarding.col.name')} className={`${cell} col-span-6`} />
                      <select name="kind[]" defaultValue={row.kind || 'other'} aria-label={t('onboarding.col.kind')} className={`${cell} col-span-4`}>
                        {SERVICE_KINDS.map((k) => <option key={k} value={k}>{t(`onboarding.serviceKind.${k}`)}</option>)}
                      </select>
                      <input name="price[]" defaultValue={row.price ?? ''} placeholder={t('onboarding.col.price')} aria-label={t('onboarding.col.price')} inputMode="numeric" className={`${cell} col-span-2`} />
                    </div>
                  ))}
                </fieldset>
                {!locked ? (
                  <>
                    <p className="text-xs text-muted">{t('onboarding.addRows')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button name="intent" value="save" className="btn-secondary">{t('onboarding.saveDraft')}</button>
                      <button name="intent" value="approve" className="btn-primary">{t('onboarding.approve')}</button>
                    </div>
                  </>
                ) : null}
              </form>
            </div>
          )
        })}
      </Section>

      {/* 3. Provision */}
      <div id="provision" className="scroll-mt-20">
        <Section title={t('onboarding.step3')}>
          {clinic ? (
            <p className="card text-sm"><span className="font-semibold text-green">{t('onboarding.provisioned')}</span> · {clinic.departments.map((d) => t(`onboarding.dept.${d as 'opd'}`)).join(', ')}</p>
          ) : !data.can_provision ? (
            <p className="notice-warning">{t('onboarding.cannotProvision')} {t('errors.PARTNER_FEE_LAPSED')}</p>
          ) : (
            <form action={provisionAction.bind(null, slug, id)} className="card space-y-3">
              <p className="text-sm">{t('onboarding.provisionHint')}</p>
              <input type="hidden" name="name" value={c.name} />
              <label className="field"><span>{t('onboarding.slug')}</span>
                <input name="slug" required pattern="[a-z0-9-]{3,60}" defaultValue={slugify(c.name)} className="input font-mono" /></label>
              <fieldset className="space-y-1">
                <legend className="mb-1 text-sm font-medium">{t('onboarding.departments')}</legend>
                {DEPARTMENTS.map((d) => (
                  <label key={d} className="flex min-h-touch items-center gap-3 text-ink">
                    <input type="checkbox" name="departments" value={d} defaultChecked={d === 'opd' || (r?.departments ?? []).includes(d)} className="h-5 w-5" />
                    {t(`onboarding.dept.${d}`)}
                  </label>
                ))}
              </fieldset>
              <button className="btn-primary w-full">{t('onboarding.provision')}</button>
            </form>
          )}
          {unlinked.length > 0 ? (
            <form action={linkClinicAction.bind(null, slug, id)} className="card space-y-3">
              <h3>{t('grants.linkClinic')}</h3>
              <p className="text-sm">{t('grants.linkHint')}</p>
              <select name="clinic_id" required className="input" defaultValue="">
                <option value="" disabled>—</option>
                {unlinked.map((u) => <option key={u.id} value={u.id}>{u.name}{u.district ? ` (${u.district})` : ''}</option>)}
              </select>
              <button className="btn-secondary w-full">{t('grants.link')}</button>
            </form>
          ) : null}
        </Section>
      </div>

      {/* 4. Staff and training */}
      <div id="staff" className="scroll-mt-20">
        <Section title={t('onboarding.step4')}>
          {training.staff.length + training.invited.length > 0 ? (
            <ul className="card divide-y divide-line-soft py-1">
              {training.staff.map((s) => {
                const phone = phoneByName.get(s.name.toLowerCase())
                return (
                  <li key={s.staff_id} className="flex items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-ink">{s.name}</span>
                      <span className="block text-xs text-muted">{s.role.replace(/_/g, ' ')} · {s.trained ? t('onboarding.trained') : t('onboarding.modules', { done: s.modules_done, total: s.modules_total })}</span>
                    </span>
                    {s.trained ? <span className="chip-success">{t('onboarding.trained')}</span> : (
                      <WhatsAppButton className="btn-secondary min-h-0 shrink-0 px-3 py-2 text-sm" phone={phone} label={t('onboarding.nudge')}
                        text={t('onboarding.nudgeMessage', { name: s.name, done: s.modules_done, total: s.modules_total, url: ehrUrl('/onboarding') })} />
                    )}
                  </li>
                )
              })}
              {training.invited.map((i) => (
                <li key={i.invitation_id} className="flex items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink">{i.name}</span>
                    <span className="block truncate text-xs text-muted">{i.email} · {t('onboarding.invited')}</span>
                  </span>
                  <WhatsAppButton className="btn-secondary min-h-0 shrink-0 px-3 py-2 text-sm" phone={phoneByName.get(i.name.toLowerCase())} label={t('onboarding.nudge')}
                    text={t('onboarding.nudgeInvite', { name: i.name, clinic: c.name, url: ehrUrl('/') })} />
                </li>
              ))}
            </ul>
          ) : null}

          <form action={clinic ? inviteStaffAction.bind(null, slug, id) : saveDraftAction.bind(null, slug, id, 'staff')} className="card space-y-3">
            <p className="text-sm">{t('onboarding.staffHint')} {t('onboarding.staffNeedsEmail')}</p>
            {[...staffRows, ...Array.from({ length: BLANK_ROWS }, () => ({} as Record<string, string>))].map((row, i) => (
              <div key={i} className="grid grid-cols-2 gap-1.5 border-b border-line-soft pb-2">
                <input name="name[]" defaultValue={row.name ?? ''} placeholder={t('onboarding.col.name')} aria-label={t('onboarding.col.name')} className={cell} />
                <select name="role[]" defaultValue={row.role || 'nurse'} aria-label={t('onboarding.col.role')} className={cell}>
                  {EHR_ROLES.map((role) => <option key={role} value={role}>{role.replace(/_/g, ' ')}</option>)}
                </select>
                <input name="email[]" type="email" defaultValue={row.email ?? ''} placeholder={t('onboarding.col.email')} aria-label={t('onboarding.col.email')} className={cell} />
                <input name="phone[]" type="tel" defaultValue={row.phone ?? ''} placeholder={t('onboarding.col.phone')} aria-label={t('onboarding.col.phone')} className={cell} />
              </div>
            ))}
            {clinic ? <button className="btn-primary w-full">{t('onboarding.sendInvites')}</button> : (
              <>
                <p className="text-sm text-muted">{t('onboarding.needProvision')}</p>
                <button name="intent" value="save" className="btn-secondary w-full">{t('onboarding.saveDraft')}</button>
              </>
            )}
          </form>
        </Section>
      </div>

      {/* 5. Go live */}
      {!isLive ? (
        <Section title={t('onboarding.step5')}>
          <form action={updateClinicAction.bind(null, slug, id)} className="card space-y-3">
            <label className="field"><span>{t('onboarding.goLiveMode')}</span>
              <select name="go_live_mode" defaultValue={c.go_live_mode ?? 'site_visit'} className="input">
                <option value="site_visit">{t('onboarding.site_visit')}</option>
                <option value="remote">{t('onboarding.remote')}</option>
              </select></label>
            <button className="btn-secondary w-full">{t('common.save')}</button>
          </form>
          <div className="card space-y-2">
            <h3>{t('onboarding.checklist')}</h3>
            {open.length === 0 ? <p className="text-sm text-green">{t('onboarding.checklistDone')}</p> : null}
            <ul className="space-y-1.5 text-sm text-ink">
              {open.map((item) => <li key={item} className="flex gap-2"><span aria-hidden className="text-red">○</span>{item}</li>)}
              {dayOf.map((item) => <li key={item} className="flex gap-2"><span aria-hidden className="text-muted">○</span>{item}</li>)}
            </ul>
          </div>
        </Section>
      ) : null}
    </>
  )
}
