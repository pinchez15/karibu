'use client'

import { useState } from 'react'
import { Activity, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'

export function CheckInClient() {
  const [step, setStep] = useState<'form' | 'confirmation'>('form')
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    reasonForVisit: '',
    isNewPatient: false,
  })
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    // In production, this would call an API to create a queue entry
    // For now, simulate a check-in
    await new Promise(resolve => setTimeout(resolve, 1000))

    setSubmitting(false)
    setStep('confirmation')
  }

  if (step === 'confirmation') {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto">
            <Check className="w-10 h-10 text-green-600" />
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">You&apos;re Checked In!</h1>
            <p className="text-muted-foreground">
              {formData.name}, you are in the queue to be seen.
            </p>
          </div>

          <div className="bg-card border border-border rounded-lg p-4 space-y-2 text-left">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status:</span>
              <span className="font-medium">In Queue</span>
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Please have a seat in the waiting area. You will be called when it&apos;s your turn.
            </p>

            {formData.phone && (
              <p className="text-sm text-muted-foreground">
                We&apos;ll send you a WhatsApp message when you&apos;re next in line.
              </p>
            )}
          </div>

          <Button
            variant="outline"
            onClick={() => {
              setStep('form')
              setFormData({ name: '', phone: '', reasonForVisit: '', isNewPatient: false })
            }}
            className="w-full h-12"
          >
            Check In Another Patient
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-card border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-6 text-center">
          <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center mx-auto mb-3">
            <Activity className="w-7 h-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-medium">Karibu Health</h1>
          <p className="text-muted-foreground mt-1">Patient Check-In</p>
        </div>
      </header>

      {/* Form */}
      <main className="max-w-2xl mx-auto px-4 py-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Instructions */}
          <div className="bg-secondary/30 border border-secondary rounded-lg p-4">
            <p className="text-sm">
              Please fill in your information to check in for your appointment today.
              If you don&apos;t have a phone, ask a clinic assistant for help.
            </p>
          </div>

          {/* Name */}
          <div className="space-y-2">
            <Label htmlFor="name">Your Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="Full name"
              required
              className="h-12 text-base"
              autoComplete="name"
            />
            <p className="text-xs text-muted-foreground">
              If you&apos;ve been here before, use the same name as last time
            </p>
          </div>

          {/* Phone */}
          <div className="space-y-2">
            <Label htmlFor="phone">WhatsApp Number (Optional)</Label>
            <Input
              id="phone"
              type="tel"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              placeholder="+256 700 000 000"
              className="h-12 text-base"
              autoComplete="tel"
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll send you a message when it&apos;s almost your turn
            </p>
          </div>

          {/* Reason for visit */}
          <div className="space-y-2">
            <Label htmlFor="reason">Why are you visiting today? *</Label>
            <Textarea
              id="reason"
              value={formData.reasonForVisit}
              onChange={(e) => setFormData({ ...formData, reasonForVisit: e.target.value })}
              placeholder="e.g., Cough and fever, Follow-up appointment, Vaccination..."
              required
              className="min-h-[100px] text-base"
            />
          </div>

          {/* New patient checkbox */}
          <div className="flex items-start space-x-3">
            <Checkbox
              id="newPatient"
              checked={formData.isNewPatient}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, isNewPatient: checked as boolean })
              }
            />
            <div className="space-y-1">
              <Label
                htmlFor="newPatient"
                className="text-base font-normal cursor-pointer"
              >
                This is my first visit to this clinic
              </Label>
              <p className="text-xs text-muted-foreground">
                Check this if you are a new patient
              </p>
            </div>
          </div>

          {/* Submit */}
          <Button
            type="submit"
            className="w-full h-12"
            size="lg"
            disabled={submitting}
          >
            {submitting ? 'Checking In...' : 'Check In'}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Walk-ins only &middot; No appointment needed
          </p>
        </form>
      </main>
    </div>
  )
}
