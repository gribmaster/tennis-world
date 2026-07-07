import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

// Global so feature modules (Courts now, Collections/Journal/Consultations later)
// can inject PrismaService without re-importing PrismaModule each time.
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
