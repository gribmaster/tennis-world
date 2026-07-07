import { Controller, Get } from '@nestjs/common';

// Minimal health endpoint only (Phase 0). No business endpoints exist yet —
// public/discovery + consultation endpoints are Phase 2 work.
@Controller('health')
export class HealthController {
  @Get()
  check(): { status: 'ok'; service: 'api'; timestamp: string } {
    return { status: 'ok', service: 'api', timestamp: new Date().toISOString() };
  }
}
