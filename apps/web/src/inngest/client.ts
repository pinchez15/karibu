import { Inngest, EventSchemas } from 'inngest'

// Events the app can send to Inngest. Adding a new event = adding it to this
// type, then `inngest.send({name, data})` is type-checked from any caller.
type Events = {
  // Fired when a clinician finishes dictating a visit summary. The Inngest
  // structure-dictation function fans out from here: SOAP formatting, diagnosis
  // suggestions with citations, patient summary, then flips visit.status to
  // 'review'. Each step is independently retried by Inngest.
  'note.dictated': {
    data: {
      visit_id: string
      clinic_id: string
      phase?: 'pre_sign' | 'post_sign'
    }
  }
  // Fired when rpc_request_draft_ai_assist records draft-stage assist intent.
  // Same review pipeline as note.dictated, but suggestions persist with phase='draft'.
  'note.draft-ai-assist': {
    data: {
      visit_id: string
      clinic_id: string
      phase?: 'draft'
    }
  }
}

export const inngest = new Inngest({
  id: 'karibu-health',
  schemas: new EventSchemas().fromRecord<Events>(),
})
