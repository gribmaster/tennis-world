import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// PrismaService — the single, DI-managed PrismaClient for the API (intake §11.2).
//
// Extends PrismaClient so every model accessor (`prisma.court`, …) is available
// directly on the injected service. Connects on module init; for clean shutdown
// the bootstrap enables Nest's `enableShutdownHooks()` (see main.ts), which calls
// PrismaClient's own `$on('beforeExit')`/process-signal handling — no extra
// lifecycle plumbing needed here (intentionally not overbuilt).
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }
}
