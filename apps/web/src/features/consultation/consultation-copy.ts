// consultation-copy.ts — the copy/field config shown inside the Phase-1 Consultation
// modal. Ported from `files/Claude_Design_Prompt_Tennis_Mobile.md` §9 ("Consultation
// Form").
//
// DATA SOURCE (important): UI/feature code in `apps/web` must NOT import
// `@tennis/mock-data` directly (forbidden by `apps/web/.eslintrc.json`), and the hard
// rules say not to stand up a repository just for static modal copy. So — exactly like
// `paywall-copy.ts`, `HomePaywallBand`, and `CourtDetailCtaPanel` already do — this is
// an intentional feature-local copy object.
//
// LATER PHASES: a real consultation flow submits via `consultationRepository.submit()`
// (mock now; `POST /v1/consultations` in Phase 2) and a CRM webhook in Phase 5
// (PHASE_1_PLACEHOLDER_CTA_AUDIT §3). When that lands, the field option lists below
// would flow from a sanctioned boundary rather than this static literal. For now the
// modal is PRESENTATIONAL ONLY — submitting does not send, store, or persist anything.

export interface ConsultationCopy {
  /** Gold eyebrow above the headline (matches the paywall band treatment). */
  eyebrow: string;
  headline: string;
  /** One-line value proposition under the headline. */
  subhead: string;
  /** Labels/placeholders for the text fields. */
  fields: {
    nameLabel: string;
    namePlaceholder: string;
    emailLabel: string;
    emailPlaceholder: string;
    destinationLabel: string;
    destinationPlaceholder: string;
    timeframeLabel: string;
    /** Caption clarifying the "Flexible" toggle next to the timeframe field. */
    timeframeFlexibleLabel: string;
    timeframePlaceholder: string;
    messageLabel: string;
    messagePlaceholder: string;
  };
  /** Pill-chip option groups (small, optional — already in the §9 prototype). */
  skillLevelLabel: string;
  skillLevels: string[];
  groupSizeLabel: string;
  groupSizes: string[];
  submitCtaLabel: string;
  /** Secondary "cancel"/close action label. */
  cancelCtaLabel: string;
  /** In-modal confirmation state shown after a valid (mock) submit. */
  success: {
    eyebrow: string;
    headline: string;
    body: string;
    ctaLabel: string;
  };
}

// Copy ported from the design prompt §9. Kept local + presentational.
export const CONSULTATION_COPY: ConsultationCopy = {
  eyebrow: 'Concierge',
  headline: 'A bespoke recommendation.',
  subhead: "Tell us about the trip you're dreaming of. We respond within 24 hours.",
  fields: {
    nameLabel: 'Name',
    namePlaceholder: 'Your name',
    emailLabel: 'Email',
    emailPlaceholder: 'you@example.com',
    destinationLabel: 'Destination interest',
    destinationPlaceholder: 'Where would you love to play?',
    timeframeLabel: 'Travel timeframe',
    timeframeFlexibleLabel: 'Flexible',
    timeframePlaceholder: 'e.g. Spring 2027, or a specific month',
    messageLabel: 'Anything specific?',
    messagePlaceholder: "Anything specific you'd love?",
  },
  skillLevelLabel: 'Skill level',
  skillLevels: ['Beginner', 'Intermediate', 'Advanced', 'Pro'],
  groupSizeLabel: 'Group size',
  groupSizes: ['Solo', 'Couple', 'Family', 'Group'],
  submitCtaLabel: 'Submit Request',
  cancelCtaLabel: 'Cancel',
  success: {
    eyebrow: 'Received',
    headline: "We'll be in touch soon.",
    body: 'A member of our team will reach out within 24 hours.',
    ctaLabel: 'Return to Exploring',
  },
};
