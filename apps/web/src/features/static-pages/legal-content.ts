// legal-content.ts — feature-local copy for the Privacy Policy and Terms of
// Service pages, ported verbatim from `files/privacy.html` and `files/terms.html`
// (the prototypes' sectioned `StaticPage`).
//
// This is PAGE CHROME, not domain data (Feature 28 §6): static legal/marketing
// copy carries the same latitude as the Footer / paywall copy already do. It is
// deliberately NOT routed through a repository, a contract, or `@tennis/mock-data`,
// and there is no CMS / markdown parser — the sections are a plain typed array the
// `LegalPage` component `.map`-renders, exactly as the prototype did.
//
// ⚠️ PLACEHOLDER LEGAL TEXT. The prototype is explicit: this is placeholder copy
// for design/development only — it must be replaced with counsel-reviewed language
// before launch. The `disclaimer` and the per-page "replace with counsel-reviewed
// language before launch" wording below carry that warning through to the UI.

/** A legal-page section: a serif heading + one or more body paragraphs. */
export interface LegalSection {
  /** Section heading, e.g. "1. Information We Collect". */
  h: string;
  /** Body paragraphs under the heading. */
  p: string[];
}

/** The full content of a legal page (Privacy / Terms). */
export interface LegalContent {
  /** Uppercase caption above the title, e.g. "Legal". */
  eyebrow: string;
  /** Page title, e.g. "Privacy Policy". */
  title: string;
  /** "Last updated" date string, shown under the title. */
  lastUpdated: string;
  /** Intro / disclaimer paragraph shown before the section list. */
  intro: string;
  /** The ordered list of sections. */
  sections: LegalSection[];
}

// ── Privacy Policy ─────────────────────────────────────────────────────────────
// Ported verbatim from files/privacy.html.
export const privacyContent: LegalContent = {
  eyebrow: 'Legal',
  title: 'Privacy Policy',
  lastUpdated: 'Last updated: June 1, 2026',
  intro:
    'This Privacy Policy describes how Tennis World ("we", "us", "our") collects, uses, and protects information when you use our website and mobile application (together, the "Service"). This is placeholder copy for design and development purposes — replace with counsel-reviewed language before launch.',
  sections: [
    {
      h: '1. Information We Collect',
      p: [
        'Account information: name, email address, and authentication identifiers when you create an account or sign in via Apple, Google, or magic link.',
        'Usage data: courts viewed, saved, and searched; collections created; pages visited; and general interaction patterns within the Service.',
        'Device and technical data: IP address, browser type, device identifiers, and approximate location derived from IP address (used to personalize map defaults and currency, not to track precise location).',
        'Payment information: subscription and one-time purchase records are processed by our payment provider (e.g. RevenueCat/App Store/Play Store); we do not store full card numbers.',
        'Consultation requests: information you submit through our concierge form, including travel preferences, skill level, and contact details.',
      ],
    },
    {
      h: '2. How We Use Information',
      p: [
        'To provide and maintain the Service, including syncing saved courts and collections across devices.',
        'To process subscription purchases and manage entitlements.',
        'To respond to consultation requests and provide concierge recommendations.',
        'To improve the Service through aggregated, anonymized analytics.',
        'To communicate with you about your account, purchases, or material changes to this policy.',
      ],
    },
    {
      h: '3. Information Sharing',
      p: [
        'We do not sell personal information.',
        'We share information with service providers who help us operate the Service (payment processing, analytics, customer support, email delivery) under contractual confidentiality obligations.',
        'We may disclose information if required by law or to protect the rights, property, or safety of Tennis World, our users, or others.',
      ],
    },
    {
      h: '4. Data Retention',
      p: [
        'We retain account information for as long as your account is active. You may request deletion of your account and associated data at any time by contacting us.',
      ],
    },
    {
      h: '5. Your Rights',
      p: [
        'Depending on your jurisdiction, you may have the right to access, correct, export, or delete your personal information, and to object to or restrict certain processing. Contact us to exercise these rights.',
      ],
    },
    {
      h: "6. Children's Privacy",
      p: [
        'The Service is not directed to individuals under 16, and we do not knowingly collect personal information from children.',
      ],
    },
    {
      h: '7. Changes to This Policy',
      p: [
        'We may update this Privacy Policy from time to time. Material changes will be communicated through the Service or by email.',
      ],
    },
    {
      h: '8. Contact',
      p: [
        'Questions about this policy can be directed to privacy@tennisworld.app (placeholder address).',
      ],
    },
  ],
};

// ── Terms of Service ───────────────────────────────────────────────────────────
// Ported verbatim from files/terms.html.
export const termsContent: LegalContent = {
  eyebrow: 'Legal',
  title: 'Terms of Service',
  lastUpdated: 'Last updated: June 1, 2026',
  intro:
    'These Terms of Service ("Terms") govern your use of Tennis World\'s website and mobile application (the "Service"). This is placeholder copy for design and development purposes — replace with counsel-reviewed language before launch.',
  sections: [
    {
      h: '1. Acceptance of Terms',
      p: [
        'By creating an account or using the Service, you agree to be bound by these Terms. If you do not agree, do not use the Service.',
      ],
    },
    {
      h: '2. Description of Service',
      p: [
        'Tennis World is a curated discovery platform for tennis courts worldwide. A free tier provides limited access to courts and content; a paid membership unlocks the full atlas, including exact locations of premium courts.',
        'Tennis World does not own, operate, or manage any tennis court listed in the Service. Court availability, access requirements, and booking are the responsibility of the respective venue.',
        'External booking links, where provided, direct to third-party platforms not operated by Tennis World. We are not responsible for the accuracy, availability, or outcome of third-party bookings.',
      ],
    },
    {
      h: '3. Accounts',
      p: [
        'You are responsible for maintaining the confidentiality of your account credentials and for all activity under your account.',
        'You must provide accurate information when creating an account and keep it up to date.',
      ],
    },
    {
      h: '4. Subscriptions & Payments',
      p: [
        'Membership unlocks are billed as described at the time of purchase (currently a one-time lifetime fee; subject to change with notice).',
        'All purchases are processed through the Apple App Store, Google Play, or our website payment provider and are subject to their respective refund policies.',
      ],
    },
    {
      h: '5. Acceptable Use',
      p: [
        'You agree not to misuse the Service, including scraping content, reverse-engineering the application, or using the Service to harass venues or other users.',
      ],
    },
    {
      h: '6. Intellectual Property',
      p: [
        'All content, design, photography, and editorial material on the Service is owned by Tennis World or its licensors and may not be reproduced without permission.',
      ],
    },
    {
      h: '7. Disclaimers',
      p: [
        'The Service is provided "as is." Court information, including access, surface, and amenities, is provided for inspiration and planning purposes and should be verified directly with the venue before travel.',
      ],
    },
    {
      h: '8. Limitation of Liability',
      p: [
        'To the maximum extent permitted by law, Tennis World is not liable for indirect, incidental, or consequential damages arising from use of the Service, including issues arising from third-party bookings or venue access.',
      ],
    },
    {
      h: '9. Changes to These Terms',
      p: [
        'We may update these Terms from time to time. Continued use of the Service after changes constitutes acceptance of the revised Terms.',
      ],
    },
    {
      h: '10. Contact',
      p: [
        'Questions about these Terms can be directed to legal@tennisworld.app (placeholder address).',
      ],
    },
  ],
};
