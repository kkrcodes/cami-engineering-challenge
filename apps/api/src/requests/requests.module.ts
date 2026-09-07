import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerRequest } from './customer-request.entity';
import { RequestNote } from './request-note.entity';
import { Classification } from './classification.entity';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { KeywordClassifier } from './keyword-classifier';
import { KeywordClassifierProvider } from './keyword-classifier.provider';
import { CLASSIFIER_PROVIDER } from './classifier.provider';
import { ClassificationService } from './classification.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CustomerRequest, RequestNote, Classification]),
  ],
  controllers: [RequestsController],
  providers: [
    RequestsService,
    KeywordClassifier,
    ClassificationService,
    { provide: CLASSIFIER_PROVIDER, useClass: KeywordClassifierProvider },
  ],
})
export class RequestsModule {}
