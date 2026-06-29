import { Activity, Check, Shield, Wifi } from 'lucide-react'
import { KMark } from './brand'
import { Container, Eyebrow, Reveal } from './ui'
import { DeviceScale, DictationFlow, RecordTimeline } from './visuals'

type FeatureRowProps = {
  flip?: boolean
  eyebrow: string
  title: string
  body: string
  points?: string[]
  visual: React.ReactNode
  accentClassName?: string
}

function FeatureRow({
  flip,
  eyebrow,
  title,
  body,
  points,
  visual,
  accentClassName = 'text-cobalt',
}: FeatureRowProps) {
  return (
    <div className="grid items-center gap-14 max-[920px]:grid-cols-1 min-[921px]:grid-cols-2">
      <Reveal
        className={`max-[920px]:order-1 ${flip ? 'min-[921px]:order-2' : 'min-[921px]:order-1'}`}
      >
        <Eyebrow colorClassName={accentClassName}>{eyebrow}</Eyebrow>
        <h3 className="mt-3.5 text-[clamp(26px,2.6vw,34px)] font-semibold leading-[1.12] tracking-[-0.025em] text-ink">
          {title}
        </h3>
        <p className="mt-4 max-w-[460px] text-[16.5px] leading-relaxed text-body">{body}</p>
        {points && (
          <div className="mt-[22px] flex flex-col gap-3">
            {points.map((p) => (
              <div key={p} className="flex items-start gap-[11px]">
                <span className="mt-px flex size-[22px] shrink-0 items-center justify-center rounded-[7px] bg-cobalt/[0.08] text-cobalt">
                  <Check size={13} aria-hidden />
                </span>
                <span className="text-[14.5px] leading-snug text-body">{p}</span>
              </div>
            ))}
          </div>
        )}
      </Reveal>
      <Reveal
        delay={120}
        className={`flex justify-center max-[920px]:order-2 ${flip ? 'min-[921px]:order-1' : 'min-[921px]:order-2'}`}
      >
        {visual}
      </Reveal>
    </div>
  )
}

export function EHRSection() {
  return (
    <section id="ehr" className="border-t border-line bg-page py-16 sm:py-[92px]">
      <Container>
        <Reveal className="mb-16 max-w-[680px]">
          <div className="mb-[18px] inline-flex items-center gap-2">
            <KMark size={30} />
            <span className="font-mono text-xs font-semibold tracking-[0.1em] text-cobalt">
              KARIBU EHR
            </span>
          </div>
          <h2 className="text-[clamp(32px,3.6vw,46px)] font-semibold leading-[1.06] tracking-[-0.03em] text-ink">
            Documentation that keeps up with your clinic.
          </h2>
          <p className="mt-[18px] text-lg leading-relaxed text-body">
            Built for a clinic where one clinician sees forty patients a day. Karibu EHR fits the
            pace you already work — and gives every patient a record that follows them.
          </p>
        </Reveal>

        <div className="flex flex-col gap-[88px]">
          <FeatureRow
            eyebrow="Dictate, don't type"
            title="A full visit note in minutes — just speak."
            body="After the patient leaves, dictate what happened in plain words. AI can optionally structure a draft note for you to review and sign. The note saves whether or not the AI runs — it never blocks your work."
            points={[
              'Speak in English after the visit; get a draft note back when you want it.',
              'You stay in control — review and sign every note.',
              'Suggests the HMIS diagnosis code for you to confirm.',
            ]}
            visual={<DictationFlow />}
          />
          <FeatureRow
            flip
            eyebrow="Any phone, whole clinic"
            title="Works on any Android. Scales to the whole clinic."
            body="Start on the phone already in your pocket — no new hardware, no computer required. As your clinic grows, the same record opens on tablets at triage and laptops at the front desk."
            points={[
              'No procurement needed to begin.',
              'One patient record across every device.',
              'Designed for low bandwidth and basic data plans.',
            ]}
            visual={
              <div className="flex w-full justify-center py-2">
                <DeviceScale />
              </div>
            }
          />
          <FeatureRow
            eyebrow="One continuous record"
            title="A record that follows the patient — so care does too."
            body="Every visit builds on the last. When a patient returns, their history is already there: past diagnoses, prescriptions, and results in one timeline. Continuity is what turns documentation into better care."
            points={[
              'Past visits, medications and results in one place.',
              'Available even when the network isn’t.',
              'Finalized visits feed HMIS 105 reporting from real clinical data.',
            ]}
            visual={
              <div className="w-full max-w-[420px]">
                <RecordTimeline />
              </div>
            }
          />
        </div>

        <Reveal>
          <div className="mt-16 grid border-t border-line pt-9 max-[920px]:grid-cols-1 max-[920px]:gap-8 min-[921px]:grid-cols-3">
            {[
              [Wifi, 'Offline-first', 'Every visit saves on the device and syncs when the network returns — nothing is lost to a dropped connection.'],
              [Activity, 'Receipts at discharge', 'Each visit prints a thermal receipt: diagnosis, medicines, and what to watch for at home.'],
              [Shield, 'Guideline-aligned', 'Coding and dosing follow the Uganda Clinical Guidelines, so the record holds up to scrutiny.'],
            ].map(([Icon, title, desc], i) => (
              <div
                key={title as string}
                className={
                  i > 0
                    ? 'max-[920px]:border-l-0 max-[920px]:pl-0 min-[921px]:border-l min-[921px]:border-line-soft min-[921px]:pl-8'
                    : 'min-[921px]:pr-6'
                }
              >
                <Icon size={22} className="text-cobalt" aria-hidden />
                <h4 className="mt-3.5 text-[17px] font-semibold tracking-[-0.01em] text-ink">
                  {title as string}
                </h4>
                <p className="mt-1.5 text-sm leading-snug text-body">{desc as string}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  )
}
