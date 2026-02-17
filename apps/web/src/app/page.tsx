'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Users, ArrowRight, Smartphone, Wifi, BarChart3, Stethoscope } from 'lucide-react'

const benefits = [
  {
    icon: Users,
    title: 'Better Patient Care',
    description:
      'Patients check in via WhatsApp, get discharge instructions on their phone, no paperwork lost.',
  },
  {
    icon: Stethoscope,
    title: 'Empowers Nurses & Clinicians',
    description:
      'Voice recording replaces manual documentation. AI generates SOAP notes and patient summaries.',
  },
  {
    icon: Smartphone,
    title: 'Runs on Any Smartphone',
    description:
      'No computers needed. Works on the phones clinicians already carry.',
  },
  {
    icon: Wifi,
    title: 'Minimal Data Usage',
    description:
      'Designed for low-bandwidth environments. Works on basic mobile data.',
  },
  {
    icon: BarChart3,
    title: 'Simplified Reporting',
    description:
      'Automatically generates HMIS 105 reports and clinic analytics from visit data.',
  },
]

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <img src="/logos/shortname-and-icon.png" alt="Karibu" className="h-8" />
          <Button size="sm" asChild>
            <Link href="/dashboard">Sign In</Link>
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="flex flex-col items-center justify-center px-4 py-20">
        <div className="w-full max-w-4xl text-center space-y-8">
          <div className="flex justify-center">
            <img src="/logos/icon-and-name.png" alt="Karibu.health" className="h-32" />
          </div>

          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold">
              Mobile-First Healthcare
              <br />
              <span className="text-primary">for Uganda</span>
            </h1>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto">
              An AI-native, WhatsApp-integrated EHR built specifically for Ugandan clinics.
              No computers required.
            </p>
          </div>

          <div className="flex justify-center">
            <Button size="lg" className="h-12 text-base px-8" asChild>
              <Link href="/dashboard">
                Clinician Sign In
                <ArrowRight className="w-5 h-5 ml-2" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
            Why Karibu Health
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {benefits.map((benefit) => (
              <div
                key={benefit.title}
                className="bg-card border border-border rounded-lg p-6"
              >
                <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mb-4">
                  <benefit.icon className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold mb-2">{benefit.title}</h3>
                <p className="text-sm text-muted-foreground">{benefit.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-4xl mx-auto text-center text-sm text-muted-foreground space-y-2">
          <div className="flex items-center justify-center gap-2">
            <img src="/logos/shortname-and-icon.png" alt="Karibu" className="h-6" />
          </div>
          <p>Mobile-first healthcare for Uganda</p>
          <p>CappaWork LLC &copy; {new Date().getFullYear()}</p>
          <div className="flex justify-center pt-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">Clinician Sign In</Link>
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
