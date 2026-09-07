import { Injectable } from '@nestjs/common';
import { ClassifierProvider } from './classifier.provider';
import { ClassificationResult, KeywordClassifier } from './keyword-classifier';

/**
 * Provider adapter around the deterministic KeywordClassifier. Keeps the pure,
 * unit-tested keyword logic synchronous while presenting the async provider
 * contract, so a future LLMClassifierProvider can replace it without touching
 * ClassificationService.
 */
@Injectable()
export class KeywordClassifierProvider implements ClassifierProvider {
  readonly name = 'keyword';

  constructor(private readonly classifier: KeywordClassifier) {}

  classify(message: string): Promise<ClassificationResult> {
    return Promise.resolve(this.classifier.classify(message));
  }
}
