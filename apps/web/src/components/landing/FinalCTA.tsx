'use client'

import { Check, GraduationCap, Shield, Smartphone } from 'lucide-react'
import { FormEvent, useState } from 'react'
import { APPLY_MAILTO } from './constants'
import { Btn, Container, Eyebrow, Reveal } from './ui'

type FormFields = {
  facility: string
  district: string
  role: string
  email: string
  phone: string
}

const EMPTY_FORM: FormFields = {
  facility: '',
  district: '',
  role: '',
  email: '',
  phone: '',
}

export function FinalCTA() {
  const [fields, setFields] = useState<FormFields>(EMPTY_FORM)
  const [submitted, setSubmitted] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const body = [
      'Karibu Health clinic application',
      '',
      `Facility: ${fields.facility}`,
      `District: ${fields.district}`,
      `Role: ${fields.role}`,
      `Email: ${fields.email}`,
      `Phone: ${fields.phone}`,
    ].join('\n')

    window.location.href = `${APPLY_MAILTO}&body=${encodeURIComponent(body)}`
    setSubmitted(true)
  }

  return (
    <section id="apply" className="py-16 sm:py-[92px]">
      <Container narrow>
        <Reveal>
          <div className="grid overflow-hidden rounded-3xl border border-line bg-white shadow-[0_24px_60px_rgba(11,20,82,0.08)] max-[920px]:grid-cols-1 min-[921px]:grid-cols-[1.1fr_1fr]">
            <div className="p-6 sm:p-10">
              <Eyebrow colorClassName="text-cobalt">Bring Karibu to your clinic</Eyebrow>
              <h2 className="landing-heading mt-3.5 text-[clamp(26px,2.8vw,34px)] font-semibold leading-[1.1] tracking-[-0.025em] text-ink">
                Start documenting in minutes, not hours.
              </h2>
              <p className="mt-3.5 text-[15.5px] leading-relaxed text-body">
                Karibu EHR is provisioned per facility, with onboarding and device support. Tell us
                about your clinic and the team will be in touch within two working days.
              </p>
              <div className="mt-6 flex flex-col gap-2.5">
                {[
                  [Smartphone, 'Works on the Android phones you already have'],
                  [Shield, 'Your data stays in the patient record'],
                  [GraduationCap, 'Free Karibu Learn for your whole team'],
                ].map(([Icon, text]) => (
                  <div key={text as string} className="flex items-center gap-2.5 text-[13.5px] text-body">
                    <Icon size={16} className="text-cobalt" aria-hidden />
                    {text as string}
                  </div>
                ))}
              </div>
            </div>

            <div className="border-t border-line bg-[rgb(var(--kh-bg))] p-6 sm:p-10 min-[921px]:border-l min-[921px]:border-t-0">
              {!submitted ? (
                <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                  {(
                    [
                      ['facility', 'Facility name', 'Susunga HC III', 'text'],
                      ['district', 'District', 'Mityana', 'text'],
                      ['role', 'Your role', 'In-charge / Clinical officer', 'text'],
                      ['phone', 'Phone', '+256 7…', 'tel'],
                      ['email', 'Email', 'you@clinic.ug', 'email'],
                    ] as const
                  ).map(([key, label, placeholder, inputType]) => (
                    <label key={key} className="block">
                      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-wide text-ink/80">
                        {label}
                      </span>
                      <input
                        required
                        type={inputType}
                        value={fields[key]}
                        onChange={(e) => setFields((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder={placeholder}
                        className="mt-1.5 w-full rounded-[10px] border border-line bg-white px-[13px] py-[11px] text-sm text-ink placeholder:text-muted/70 outline-none transition-[border-color,box-shadow] focus:border-cobalt focus:shadow-[0_0_0_4px_rgb(var(--kh-cobalt-soft))]"
                      />
                    </label>
                  ))}
                  <Btn kind="primary" size="lg" accentClassName="bg-cobalt" type="submit" className="mt-[18px] w-full">
                    Send application
                  </Btn>
                </form>
              ) : (
                <div className="flex min-h-[280px] flex-col items-center justify-center text-center">
                  <span className="mb-4 inline-flex size-[58px] items-center justify-center rounded-full bg-green-soft text-green">
                    <Check size={26} aria-hidden />
                  </span>
                  <h3 className="landing-heading text-xl font-semibold text-ink">Application sent</h3>
                  <p className="mt-1.5 max-w-[240px] text-sm leading-snug text-body">
                    The Karibu team replies within two working days.
                  </p>
                </div>
              )}
            </div>
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
