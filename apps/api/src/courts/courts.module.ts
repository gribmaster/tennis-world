import { Module } from '@nestjs/common';
import { CourtsController } from './courts.controller';
import { CourtsService } from './courts.service';

// PrismaService is provided globally (PrismaModule is @Global), so CourtsService
// can inject it without importing PrismaModule here.
@Module({
  controllers: [CourtsController],
  providers: [CourtsService],
})
export class CourtsModule {}
