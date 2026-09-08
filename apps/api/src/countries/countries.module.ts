import { Module } from '@nestjs/common';
import { CountriesController } from './countries.controller';
import { CountriesService } from './countries.service';

// PrismaService is provided globally (PrismaModule is @Global), so
// CountriesService can inject it without importing PrismaModule here.
@Module({
  controllers: [CountriesController],
  providers: [CountriesService],
})
export class CountriesModule {}
