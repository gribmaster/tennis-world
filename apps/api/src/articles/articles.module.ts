import { Module } from '@nestjs/common';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';

// PrismaService is provided globally (PrismaModule is @Global), so ArticlesService
// can inject it without importing PrismaModule here.
@Module({
  controllers: [ArticlesController],
  providers: [ArticlesService],
})
export class ArticlesModule {}
