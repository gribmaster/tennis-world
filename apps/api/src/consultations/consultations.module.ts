import { Module } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';

// PrismaService is provided globally (PrismaModule is @Global), so
// ConsultationsService can inject it without importing PrismaModule here — same
// pattern as Courts/Collections/Articles.
@Module({
  controllers: [ConsultationsController],
  providers: [ConsultationsService],
})
export class ConsultationsModule {}
