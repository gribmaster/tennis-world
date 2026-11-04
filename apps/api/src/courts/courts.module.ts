import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { CourtsController } from './courts.controller';
import { CourtsService } from './courts.service';

// PrismaService is provided globally (PrismaModule is @Global), so CourtsService
// can inject it without importing PrismaModule here.
//
// TASK_72: imports AuthModule (for OptionalAuthGuard + its AuthService/AUTH_CONFIG
// dependencies) and EntitlementsModule (for the controller's EntitlementsService —
// the single "is this viewer entitled?" gate) so the public endpoints can redact
// `approxLat`/`approxLng` for a locked court by real per-viewer entitlement.
@Module({
  imports: [AuthModule, EntitlementsModule],
  controllers: [CourtsController],
  providers: [CourtsService],
})
export class CourtsModule {}
