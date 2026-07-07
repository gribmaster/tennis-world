import { Inject, Injectable, Logger } from '@nestjs/common';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';

// ─────────────────────────────────────────────────────────────────────────────
// Mailer abstraction (prompt task 11) — the ONE seam through which the magic link
// reaches the user. No real provider is integrated in this feature (Feature 50 §8 /
// Q8: provider choice is a human decision, like the Phase-2 CDN). The interface is
// deliberately tiny so swapping in nodemailer / Resend / SES later is a one-class
// change with no service edits.
//
// DEV BEHAVIOR (chosen + documented):
//   - MAGIC_LINK_DEV_LOG=true (default): log the full magic-link URL to the server
//     console at WARN level so it stands out, and is the ONLY way to obtain the raw
//     token for testing (the DB stores only the hash, by design). This is what
//     makes `verify` testable end-to-end without an email provider.
//   - MAGIC_LINK_DEV_LOG=false: send is a silent no-op (we don't crash, and we don't
//     log the link). `request-link` still returns `{ ok: true }` — the generic,
//     non-enumerating response — so the flow degrades safely rather than erroring.
//     This is the "no provider configured" path; it never throws.
//
// It NEVER logs the raw token in production-shaped form beyond the dev gate, and it
// is the only place that ever sees the raw token URL (the service hands it the link;
// the DB only ever holds the hash).
// ─────────────────────────────────────────────────────────────────────────────

/** The single capability auth needs from a mailer. Future real providers implement
 *  this same shape (constructor-injected config/keys) so the service is unchanged. */
export interface Mailer {
  sendMagicLink(email: string, url: string): Promise<void>;
}

@Injectable()
export class MailerService implements Mailer {
  private readonly logger = new Logger(MailerService.name);

  constructor(@Inject(AUTH_CONFIG) private readonly config: AuthConfig) {}

  /**
   * "Send" the magic link. In dev (MAGIC_LINK_DEV_LOG=true) this logs the URL so a
   * developer can copy the token and hit `/v1/auth/verify`. With dev-log off it is a
   * safe no-op (no provider wired yet) — it does not throw, so the request-link
   * endpoint always returns its generic success.
   */
  async sendMagicLink(email: string, url: string): Promise<void> {
    if (this.config.magicLinkDevLog) {
      this.logger.warn(
        `[dev magic-link] for <${email}> → ${url}  (MAGIC_LINK_DEV_LOG=true; not a real email)`,
      );
      return;
    }
    // No provider configured and dev-log off → intentional no-op (documented).
    // Swap this branch for a real provider call when one is chosen (Feature 50 §8).
    return;
  }
}
