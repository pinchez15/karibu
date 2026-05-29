/**
 * Draft-stage AI assist entrypoint.
 *
 * Handled by reviewClinicianNote listening for `note.draft-ai-assist` with
 * phase='draft' on ai_review_suggestions inserts. Dispatch this event after
 * rpc_request_draft_ai_assist records intent server-side.
 */
export { reviewClinicianNote as draftAiAssist } from './review-clinician-note'
