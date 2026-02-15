'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Activity, Users, Clock, FileText, TrendingDown, Globe, Phone, MessageCircle, CheckCircle, ArrowRight } from 'lucide-react'

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
}

export default function Home() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section with Login */}
      <section className="min-h-screen flex flex-col">
        {/* Floating Navigation */}
        <nav className="sticky top-0 z-50 bg-background/95 backdrop-blur border-b border-border">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <Activity className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-semibold">Karibu.Health</span>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => scrollToSection('story')}
                className="hidden sm:inline-flex"
              >
                Our Story
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => scrollToSection('donate')}
              >
                Support Us
              </Button>
              <Button size="sm" asChild>
                <Link href="/dashboard">Sign In</Link>
              </Button>
            </div>
          </div>
        </nav>

        {/* Hero Content */}
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12">
          <div className="w-full max-w-4xl text-center space-y-8">
            {/* Logo */}
            <div className="flex justify-center">
              <div className="w-20 h-20 bg-primary rounded-2xl flex items-center justify-center">
                <Activity className="w-12 h-12 text-primary-foreground" />
              </div>
            </div>

            {/* Headline */}
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

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <Button size="lg" className="w-full sm:w-auto h-12 text-base px-8" asChild>
                <Link href="/dashboard">
                  Clinician Sign In
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Link>
              </Button>
              <Button
                onClick={() => scrollToSection('donate')}
                variant="outline"
                size="lg"
                className="w-full sm:w-auto h-12 text-base px-8"
              >
                Support This Project
              </Button>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-8">
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-2xl font-bold text-primary">60+</div>
                <div className="text-xs text-muted-foreground">Clinicians Interviewed</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-2xl font-bold text-primary">4</div>
                <div className="text-xs text-muted-foreground">Core Problems Solved</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-2xl font-bold text-primary">100%</div>
                <div className="text-xs text-muted-foreground">Free for Clinics</div>
              </div>
              <div className="bg-card border border-border rounded-lg p-4">
                <div className="text-2xl font-bold text-primary">0</div>
                <div className="text-xs text-muted-foreground">Computers Needed</div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="pb-8 text-center">
          <button
            onClick={() => scrollToSection('crisis')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <div className="text-sm mb-2">Learn More</div>
            <div className="animate-bounce">↓</div>
          </button>
        </div>
      </section>

      {/* The Crisis - Visual Statistics */}
      <section id="crisis" className="py-16 px-4 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
            The Healthcare Crisis in Uganda
          </h2>

          {/* Doctor-Patient Ratio Comparison - Dot Matrix */}
          <div className="bg-card border border-border rounded-lg p-6 sm:p-8 mb-8">
            <h3 className="text-xl font-semibold mb-6 text-center">Doctor-Patient Ratio Visualization</h3>
            <p className="text-sm text-muted-foreground text-center mb-8">
              Each dot = 100 people • <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-blue-500 rounded-full inline-block"></span> Doctor</span> • <span className="inline-flex items-center gap-1"><span className="w-3 h-3 bg-gray-400 rounded-full inline-block"></span> Patients</span>
            </p>

            {/* USA - 1:340 */}
            <div className="mb-12">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">USA</span>
                <span className="text-sm font-bold">1 doctor : 340 patients</span>
              </div>
              <div className="bg-muted/50 rounded-lg p-6 flex items-center justify-center gap-3">
                <div className="w-5 h-5 bg-blue-500 rounded-full border-2 border-blue-600" title="1 Doctor"></div>
                <span className="text-2xl text-muted-foreground">:</span>
                <div className="flex gap-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="w-5 h-5 bg-gray-400 rounded-full" title="100 Patients"></div>
                  ))}
                  <div className="w-2 h-5 bg-gray-400 rounded-r-full" title="40 Patients"></div>
                </div>
              </div>
            </div>

            {/* Uganda - 1:25,000 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">Uganda</span>
                <span className="text-sm font-bold text-red-600">1 doctor : 25,000 patients</span>
              </div>
              <div className="bg-muted/50 rounded-lg p-6">
                <div className="flex flex-col sm:flex-row items-start gap-4">
                  <div className="flex flex-col items-center gap-2 flex-shrink-0">
                    <div className="w-5 h-5 bg-blue-500 rounded-full border-2 border-blue-600" title="1 Doctor"></div>
                    <span className="text-xs text-muted-foreground">1 doctor</span>
                  </div>

                  <span className="text-2xl text-muted-foreground self-start sm:self-center">:</span>

                  <div className="flex-1">
                    <div className="flex flex-wrap gap-1 max-w-full">
                      {[...Array(250)].map((_, i) => (
                        <div
                          key={i}
                          className="w-3 h-3 bg-gray-400 rounded-full"
                          title="100 Patients"
                        ></div>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-3 text-center">
                      25,000 patients (250 dots)
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-border">
              <p className="text-sm text-muted-foreground text-center">
                Uganda has <strong className="text-red-600">73x fewer doctors</strong> per capita than the USA
              </p>
            </div>
          </div>

          {/* Technology Opportunity Grid */}
          <div className="grid sm:grid-cols-2 gap-6 mb-8">
            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <TrendingDown className="w-6 h-6 text-primary" />
              </div>
              <div className="text-3xl font-bold mb-2">50x</div>
              <div className="text-sm text-muted-foreground">
                Cheaper to develop software with AI
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Phone className="w-6 h-6 text-primary" />
              </div>
              <div className="text-3xl font-bold mb-2">40M</div>
              <div className="text-sm text-muted-foreground">
                Mobile phones in Uganda (50M population)
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Globe className="w-6 h-6 text-primary" />
              </div>
              <div className="text-3xl font-bold mb-2">90+</div>
              <div className="text-sm text-muted-foreground">
                Languages supported by AI transcription
              </div>
            </div>

            <div className="bg-card border border-border rounded-lg p-6 text-center">
              <div className="w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <MessageCircle className="w-6 h-6 text-primary" />
              </div>
              <div className="text-3xl font-bold mb-2">20%</div>
              <div className="text-sm text-muted-foreground">
                Of Ugandans use WhatsApp (~10M people)
              </div>
            </div>
          </div>

          {/* Conclusion */}
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-6 text-center">
            <p className="text-lg font-medium mb-2">
              The time for a mobile-first, WhatsApp-integrated, AI-native EHR is <strong>now</strong>.
            </p>
            <p className="text-primary font-semibold text-xl">
              We built it.
            </p>
          </div>
        </div>
      </section>

      {/* Our Story */}
      <section id="story" className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
            Built from Real Clinic Needs
          </h2>

          <div className="space-y-8">
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">October 2025: Market Research</h3>
                  <p className="text-muted-foreground mb-4">
                    Our clinical lead in Uganda talked to <strong>over 60 clinicians</strong> in two months of in-clinic research.
                    We asked: What problems do clinics actually have?
                  </p>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 mt-6">
                <div>
                  <h4 className="font-semibold text-green-600 mb-3 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    What We Listened To
                  </h4>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <span>Communicate with patients</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <span>Manage queues</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <span>Keep patient records</span>
                    </li>
                  </ul>
                </div>

                <div>
                  <h4 className="font-semibold text-muted-foreground mb-3 flex items-center gap-2">
                    <span className="text-xl">✗</span>
                    What We Chose Not To Build
                  </h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5">✗</span>
                      <span>AI that diagnoses patients</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="mt-0.5">✗</span>
                      <span>AI loaded with medical knowledge</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4 Problems We Solve */}
      <section className="py-16 px-4 bg-muted/30">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            4 Problems We Solve
          </h2>
          <p className="text-center text-muted-foreground mb-12">
            Phone-only solution. No computers required.
          </p>

          <div className="space-y-6">
            {/* Problem 1: Long Queues */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center flex-shrink-0 text-primary-foreground font-bold text-xl">
                  1
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                    <Clock className="w-5 h-5" />
                    Long Queues
                  </h3>
                  <p className="text-muted-foreground mb-3">
                    Patients scan a QR code and get taken to a WhatsApp chat. They send a message to check in.
                    The clinic responds with a link to enter their reason for visit. (No PHI transferred via WhatsApp)
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>Patient&apos;s WhatsApp number acts as their first patient ID</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>Nurse or clinic assistant can triage based on urgency</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>Patient gets WhatsApp message when it&apos;s their turn</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Problem 2: Discharge Instructions */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center flex-shrink-0 text-primary-foreground font-bold text-xl">
                  2
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    Clear Discharge Instructions
                  </h3>
                  <p className="text-muted-foreground mb-3">
                    Hand-written discharge instructions are often lost. Patients can&apos;t follow them.
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>Doctor records visit on their phone with patient consent</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>AI transcribes and creates two notes: SOAP note + patient discharge note</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>Patient gets link via WhatsApp to their discharge instructions (magic link, no password)</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>Patient documented without additional clinician work</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Problem 3: Research & NGO Documentation */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center flex-shrink-0 text-primary-foreground font-bold text-xl">
                  3
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                    <TrendingDown className="w-5 h-5" />
                    Research &amp; NGO Documentation
                  </h3>
                  <p className="text-muted-foreground mb-3">
                    Documentation is deidentified and extracted via AI workflow. This is where the software is paid for.
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>Free for clinics, funded by a percentage of recouped NGO funds</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>AI gathers data with high fidelity in auditable fashion</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>Reports generated in final format for submission</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Problem 4: No Computers */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center flex-shrink-0 text-primary-foreground font-bold text-xl">
                  4
                </div>
                <div className="flex-1">
                  <h3 className="text-xl font-semibold mb-2 flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    No Computers
                  </h3>
                  <p className="text-muted-foreground mb-3">
                    In 60 clinic visits, only 1 computer was seen. No WiFi reported. Traditional EHRs need computers.
                  </p>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>Near-ubiquitous cell phones with microphones</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>AI-first design: voice transcription instead of clicks</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>AI data entry rather than discrete database fields</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Where We Are */}
      <section className="py-16 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
            Where We Are: MVP Complete
          </h2>

          {/* Current Status */}
          <div className="bg-card border border-border rounded-lg p-6 mb-8">
            <h3 className="text-xl font-semibold mb-4 text-green-600">✓ Built &amp; Ready to Deploy</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Web app and Android app complete</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>WhatsApp integration established (some bugs to fix)</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>AI transcription working</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span>Industry-leading vendors for auth, hosting, and database</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                <span><strong>Compliant with Uganda&apos;s DPPA</strong> (Data Protection and Privacy Act)</span>
              </li>
            </ul>
          </div>

          {/* Roadmap */}
          <div className="space-y-6">
            <h3 className="text-2xl font-semibold text-center mb-6">Roadmap</h3>

            {/* Phase 1: Pilot Location */}
            <div className="relative pl-8 pb-8 border-l-2 border-primary">
              <div className="absolute left-0 top-0 w-4 h-4 bg-primary rounded-full -translate-x-[9px]"></div>
              <div className="bg-card border border-border rounded-lg p-6">
                <div className="flex items-center gap-2 mb-2">
                  <h4 className="text-lg font-semibold">Phase 1: Pilot Location</h4>
                  <Badge variant="default">Seeking Funding</Badge>
                </div>
                <p className="text-sm text-muted-foreground mb-4">2 months • 1 pilot clinic • ~200 development hours</p>
                <p className="text-sm mb-4">
                  Led by Javis Bombokka (nurse, Uganda) who conducted the market research.
                  Test if it works, if clinicians want to use it, identify missing features.
                </p>
                <div className="text-sm text-muted-foreground">
                  <strong>Cost:</strong> $16,667 (development work at 60% discounted rate + infrastructure)
                </div>
              </div>
            </div>

            {/* Phase 2: Beta Pilot Sites */}
            <div className="relative pl-8 pb-8 border-l-2 border-muted">
              <div className="absolute left-0 top-0 w-4 h-4 bg-muted rounded-full -translate-x-[9px]"></div>
              <div className="bg-card border border-border rounded-lg p-6">
                <h4 className="text-lg font-semibold mb-2">Phase 2: Beta Pilot Sites</h4>
                <p className="text-sm text-muted-foreground mb-4">4 months • 4 beta clinics • ~100 development hours</p>
                <p className="text-sm mb-4">
                  Fix bugs, build critical features. Expand to 4 beta pilot sites for broader testing.
                </p>
                <div className="text-sm text-muted-foreground">
                  <strong>Cost:</strong> $8,333 (development work at 60% discounted rate + infrastructure)
                </div>
              </div>
            </div>

            {/* Phase 3: Public Launch */}
            <div className="relative pl-8 border-l-2 border-muted">
              <div className="absolute left-0 top-0 w-4 h-4 bg-muted rounded-full -translate-x-[9px]"></div>
              <div className="bg-card border border-border rounded-lg p-6">
                <h4 className="text-lg font-semibold mb-2">Phase 3: Public Launch</h4>
                <p className="text-sm text-muted-foreground mb-4">Self-sign up for any clinic in Uganda</p>
                <p className="text-sm mb-4">
                  Free for clinicians. &quot;Bottoms up SaaS&quot; strategy: individuals pull it into their network.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Funding Ask */}
      <section id="donate" className="py-16 px-4 bg-primary text-primary-foreground">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">
            Support Karibu Health
          </h2>
          <p className="text-center text-primary-foreground/80 mb-12 max-w-2xl mx-auto">
            Since October 2025, this project has been self-funded. We&apos;re seeking support to complete testing and launch.
          </p>

          {/* Funding Breakdown */}
          <div className="bg-primary-foreground/10 backdrop-blur rounded-lg p-6 sm:p-8 mb-8">
            <h3 className="text-2xl font-semibold mb-6 text-center">Total Funding Sought: $25,000</h3>

            <div className="space-y-6">
              {/* Pro-bono work completed */}
              <div className="bg-primary-foreground/5 rounded-lg p-4 border border-primary-foreground/20">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5" />
                  <h4 className="font-semibold">Already Completed (Pro-Bono)</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Development work completed</span>
                    <span className="font-medium">~200 hours</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Value (if billed at full rate)</span>
                    <span className="font-medium line-through">$41,667</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-primary-foreground/20">
                    <span className="font-semibold">Your cost</span>
                    <span className="font-semibold text-green-400">$0 (donated)</span>
                  </div>
                </div>
              </div>

              {/* Pilot Site */}
              <div>
                <h4 className="font-semibold mb-3">Phase 1: Pilot Location (2 months)</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Development work (~200 hours at 60% discount)</span>
                    <span className="font-medium">$16,667</span>
                  </div>
                  <div className="text-xs text-primary-foreground/60 pl-4">
                    Full rate value: $41,667 • You save: $25,000
                  </div>
                </div>
              </div>

              {/* Beta Test */}
              <div>
                <h4 className="font-semibold mb-3">Phase 2: Beta Pilot Sites (4 months)</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Development work (~100 hours at 60% discount)</span>
                    <span className="font-medium">$8,333</span>
                  </div>
                  <div className="text-xs text-primary-foreground/60 pl-4">
                    Full rate value: $20,833 • You save: $12,500
                  </div>
                </div>
              </div>

              {/* Total */}
              <div className="pt-4 border-t-2 border-primary-foreground/30">
                <div className="flex justify-between text-lg">
                  <span className="font-bold">Total Funding Needed</span>
                  <span className="font-bold">$25,000</span>
                </div>
                <p className="text-xs text-primary-foreground/70 mt-2">
                  Includes infrastructure costs (hosting, storage, AI services)
                </p>
              </div>

              {/* Value Breakdown */}
              <div className="bg-primary-foreground/5 rounded-lg p-4 border border-primary-foreground/20 mt-4">
                <h5 className="font-semibold text-sm mb-3">Total Project Value</h5>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Completed work (pro-bono)</span>
                    <span className="font-medium">$41,667</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Remaining work (discounted 60%)</span>
                    <span className="font-medium">$25,000</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t border-primary-foreground/20 font-semibold">
                    <span>Full value if billed at standard rates</span>
                    <span>$104,167</span>
                  </div>
                  <div className="flex justify-between text-green-400">
                    <span>Total savings to project</span>
                    <span className="font-bold">$79,167 (76%)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-8">
              <div className="flex justify-between text-sm mb-2">
                <span>Funding Progress</span>
                <span className="font-semibold">$0 / $25,000</span>
              </div>
              <div className="h-3 bg-primary-foreground/20 rounded-full overflow-hidden">
                <div className="h-full bg-primary-foreground" style={{ width: '0%' }}></div>
              </div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center space-y-4">
            <Button
              size="lg"
              variant="secondary"
              className="h-12 px-8 text-base"
            >
              Donate Now
            </Button>
            <p className="text-sm text-primary-foreground/80">
              Your donation directly supports healthcare innovation in Uganda
            </p>
          </div>

          {/* Additional Info */}
          <div className="mt-12 pt-8 border-t border-primary-foreground/20">
            <div className="grid sm:grid-cols-2 gap-6 text-sm">
              <div>
                <h4 className="font-semibold mb-2">Project Leadership</h4>
                <p className="text-primary-foreground/80">
                  Owned and operated by <strong>CappaWork LLC</strong> (Nate Pinches, MBA).
                  15 years healthcare experience, 20+ year connection to Uganda.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Development</h4>
                <p className="text-primary-foreground/80">
                  All software development done <strong>pro-bono</strong>.
                  Could be spun off as independent entity after beta test completion.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-4xl mx-auto text-center text-sm text-muted-foreground space-y-2">
          <div className="flex items-center justify-center gap-2">
            <div className="w-6 h-6 bg-primary rounded-lg flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-foreground">Karibu.Health</span>
          </div>
          <p>Mobile-first healthcare for Uganda</p>
          <p>CappaWork LLC © {new Date().getFullYear()}</p>
          <div className="flex justify-center gap-4 pt-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">Clinician Sign In</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={() => scrollToSection('donate')}>
              Donate
            </Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
