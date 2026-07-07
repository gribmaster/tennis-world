import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';

// PrismaService is provided globally (PrismaModule is @Global), so
// CollectionsService can inject it without importing PrismaModule here.
@Module({
  controllers: [CollectionsController],
  providers: [CollectionsService],
})
export class CollectionsModule {}
