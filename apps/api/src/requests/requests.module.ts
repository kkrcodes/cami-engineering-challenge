import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerRequest } from './customer-request.entity';
import { RequestNote } from './request-note.entity';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { KeywordClassifier } from './keyword-classifier';
import { ClassificationService } from './classification.service';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerRequest, RequestNote])],
  controllers: [RequestsController],
  providers: [RequestsService, KeywordClassifier, ClassificationService],
})
export class RequestsModule {}
