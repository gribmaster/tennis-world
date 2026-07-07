import 'reflect-metadata';
// Load apps/api/.env into process.env BEFORE anything reads config. Nest's
// `nest start`/`node dist/main.js` do not load .env on their own (verified — only
// PORT was working because 3001 is also the hardcoded fallback). The auth foundation
// (Feature 52) reads JWT_SECRET / cookie / CORS / TTL env, so we must populate it.
// dotenv is a direct dep; it no-ops gracefully if the file is absent (CI/prod set
// real env vars another way).
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { loadAuthConfig } from './auth/auth.config';

async function bootstrap(): Promise<void> {
  // `rawBody: true` (Feature 66) makes Nest capture the UNPARSED request body as a
  // Buffer on `req.rawBody`, IN ADDITION to the normal parsed `req.body`. Stripe
  // signature verification (`stripe.webhooks.constructEvent`) must run over the exact
  // bytes Stripe signed — a re-serialized JSON object would not match the signature.
  //
  // HOW IT STAYS SAFE (prompt task 2 hard rules): Nest implements this by attaching a
  // `verify` callback to the SAME express json/urlencoded body parsers it already
  // registers — it does NOT replace or disable them. So every existing route keeps its
  // parsed `req.body` and the global ValidationPipe behaves EXACTLY as before; the only
  // addition is that `req.rawBody` is now also populated for all routes. The webhook
  // controller is the only place that reads it. This is the documented Nest mechanism,
  // not a route-specific parser hack (verified against @nestjs/platform-express 10.4.x:
  // `getBodyParserOptions` adds the raw-capturing `verify` when `rawBody === true`).
  const app = await NestFactory.create(AppModule, { rawBody: true });

  // Versioned base path — /health plus the Phase-2 /courts endpoints respond.
  app.setGlobalPrefix('v1');

  // Global request-body validation (Feature 45). `class-validator`/
  // `class-transformer` are now installed; this pipe drives the decorators on the
  // first body DTO — `ConsultationSubmitRequestDTO` for POST /v1/consultations, and
  // now the auth request DTOs (Feature 52).
  //   - whitelist            : strip properties with no validation decorator.
  //   - forbidNonWhitelisted : 400 if the body carries an unknown property
  //                            (rejects typos / unexpected fields, not silently drop).
  //   - transform            : instantiate the DTO class (so decorators run) and
  //                            coerce primitives to their declared types.
  //
  // SAFE FOR THE EXISTING GETs: the courts/collections/articles list endpoints
  // bind their query with `@Query() query: Record<string, unknown>` (no DTO class)
  // and parse it manually in their `.dto.ts`. The pipe only validates parameters
  // that have a metatype with validation metadata; a plain `Record`/`string` param
  // has none, so it is passed through untouched. The `:slug` string params and the
  // `ParseIntPipe`-handled `related?limit=` are likewise unaffected. Verified by the
  // live GET smoke checks.
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Parse Cookie headers into `req.cookies` (Feature 52). The AuthGuard reads the
  // httpOnly session cookie from here (cookie-first, then `Authorization: Bearer`).
  app.use(cookieParser());

  // CORS for the web app (different origin in dev/staging). Feature 52 tightens the
  // previously-permissive `enableCors()` into a CREDENTIALED, env-allowlisted policy:
  // credentialed requests (the web sends the session cookie with
  // `credentials: 'include'`) cannot use `origin: '*'`, so we echo back only origins
  // on the allowlist. `API_CORS_ORIGINS` drives it; empty/missing → a safe localhost
  // dev fallback (:3000/:3001) — production origins are NEVER hardcoded here.
  const { corsOrigins } = loadAuthConfig();
  app.enableCors({
    // Function form: allow same-origin/non-browser requests (no Origin header) and
    // any origin on the allowlist; reject everything else (no CORS headers emitted →
    // the browser blocks it). This keeps the existing public GETs working for tools
    // (curl, the parity harness) that send no Origin.
    origin(origin, callback) {
      if (!origin || corsOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
  });

  // Lets PrismaClient close cleanly on SIGINT/SIGTERM (PrismaService extends it).
  app.enableShutdownHooks();

  const port = process.env.PORT ?? 3001;
  const host = process.env.HOST ?? '0.0.0.0';
  await app.listen(port, host);
  console.log(`[api] listening on http://${host}:${port}/v1/health`);
}

void bootstrap();
