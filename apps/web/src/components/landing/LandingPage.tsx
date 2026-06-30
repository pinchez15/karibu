'use client'

import { AboutSection } from './AboutSection'
import { EHRSection } from './EHRSection'
import { FinalCTA } from './FinalCTA'
import { Footer } from './Footer'
import { Hero, ProductSplit, TrustStrip } from './HeroSections'
import { ImpactBand } from './ImpactBand'
import { LearnSection, MissionBand } from './LearnMission'
import { Nav } from './Nav'
import { RolesShowcase } from './RolesShowcase'

export function LandingPage() {
  return (
    <div className="min-h-screen bg-page text-body">
      <Nav />
      <main>
        <Hero />
        <TrustStrip />
        <ProductSplit />
        <EHRSection />
        <RolesShowcase />
        <ImpactBand />
        <LearnSection />
        <MissionBand />
        <AboutSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}
