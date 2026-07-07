import { Module } from '@nestjs/common';
import { HealthController } from './health/health.controller';
import { CourtsModule } from './courts/courts.module';
import { CollectionsModule } from './collections/collections.module';
import { ArticlesModule } from './articles/articles.module';
import { ConsultationsModule } from './consultations/consultations.module';
import { AuthModule } from './auth/auth.module';
import { MeModule } from './me/me.module';
import { BillingModule } from './billing/billing.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    CourtsModule,
    CollectionsModule,
    ArticlesModule,
    ConsultationsModule,
    AuthModule,
    MeModule,
    BillingModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
