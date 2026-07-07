import {
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { StripeWebhookService } from './stripe-webhook.service';

// ─────────────────────────────────────────────────────────────────────────────
// StripeWebhookController — the PUBLIC, signature-verified fulfillment endpoint
// (Feature 66, intake §5.2/§5.3):
//
//   POST /v1/webhooks/stripe → 200 { received: true }
//
// DELIBERATELY NO `@UseGuards(AuthGuard)` (intake §5.2 — "Public but signature-verified").
// Stripe posts server-to-server with no session cookie / bearer token; the
// `Stripe-Signature` HMAC over the raw body IS the authentication. Adding AuthGuard here
// would break every delivery. The service verifies the signature FIRST — an unsigned /
// bad-signature request is a 400 before any DB work (task 4/6).
//
// RAW BODY (task 2): `req.rawBody` is the exact bytes Stripe signed, populated by
// `rawBody: true` in main.ts (Nest attaches a raw-capturing `verify` to the existing
// json parser — it does NOT disable JSON parsing, so `req.body` is still parsed for every
// other route and the global ValidationPipe is unaffected). The signature check needs the
// bytes, so we read `req.rawBody` here, not the parsed `@Body()`.
//
// `@HttpCode(200)` makes the ack a 200 (Nest defaults POST to 201). Stripe treats any 2xx
// as "delivered"; a non-2xx triggers Stripe's retry schedule — which is exactly what we
// want ONLY for a genuine internal failure (the service throws 500 there), never for a
// duplicate/unsupported event (those return 200 no-op). A bad signature is a 400 (Stripe
// won't retry a request it couldn't sign — correct).
// ─────────────────────────────────────────────────────────────────────────────

@Controller('webhooks')
export class StripeWebhookController {
  constructor(private readonly webhook: StripeWebhookService) {}

  /** POST /v1/webhooks/stripe — verify + fulfil/revoke. Public, signature-authenticated. */
  @Post('stripe')
  @HttpCode(200)
  handleStripe(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true }> {
    return this.webhook.handleEvent(req.rawBody, signature);
  }
}
