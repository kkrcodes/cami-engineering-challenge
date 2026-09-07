import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsModule } from './requests/requests.module';
import { CustomerRequest } from './requests/customer-request.entity';
import { RequestNote } from './requests/request-note.entity';
import { Classification } from './requests/classification.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL ?? 'postgres://cami:cami@localhost:5432/cami',
      entities: [CustomerRequest, RequestNote, Classification],
      synchronize: false,
      // Query logging is opt-in (noisy in production); errors always logged.
      logging: process.env.DB_LOGGING === 'true' ? ['query'] : ['error'],
    }),
    RequestsModule,
  ],
})
export class AppModule {}
