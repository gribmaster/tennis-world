// Consultation feature — shared, cross-screen UI (Home / Court Detail / Saved / Profile).
//
// PHASE 1, PRESENTATIONAL ONLY: opens an accessible modal with a small consultation
// request form. Submitting validates a few required fields in client state and shows an
// in-modal confirmation. NO backend, NO app/api, NO email, NO CRM, NO auth, NO payments,
// NO localStorage, NO persistence, NO global state. Real submit is Phase 2
// (`consultationRepository.submit()`); CRM webhook is Phase 5.
//
// Public surface: drop a <ConsultationTrigger> wherever an inert "Request a
// Consultation" / "Contact Concierge" / "Plan a Trip" CTA was. It owns its own
// open/close state and renders the <ConsultationModal>.
export { ConsultationTrigger } from './ConsultationTrigger';
export type { ConsultationTriggerProps } from './ConsultationTrigger';

export { ConsultationModal } from './ConsultationModal';
export type { ConsultationModalProps } from './ConsultationModal';

export { CONSULTATION_COPY } from './consultation-copy';
export type { ConsultationCopy } from './consultation-copy';
