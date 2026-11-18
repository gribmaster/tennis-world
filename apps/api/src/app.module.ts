import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { CourtsModule } from './courts/courts.module';
import { CollectionsModule } from './collections/collections.module';
import { CountriesModule } from './countries/countries.module';
import { ArticlesModule } from './articles/articles.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { ReviewsModule } from './reviews/reviews.module';
import { AuthModule } from './auth/auth.module';
import { MeModule } from './me/me.module';
import { BillingModule } from './billing/billing.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PrismaModule } from './prisma/prisma.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    PrismaModule,
    CourtsModule,
    CollectionsModule,
    CountriesModule,
    ArticlesModule,
    ConsultationsModule,
    ReviewsModule,
    AuthModule,
    MeModule,
    BillingModule,
    WebhooksModule,
    // TASK_73 — a DynamicModule (not the bare class): registers NO routes at
    // all in production with no ADMIN_JWT_SECRET set. See admin.module.ts.
    AdminModule.register(),
  ],
  controllers: [HealthController],
})
export class AppModule {}
