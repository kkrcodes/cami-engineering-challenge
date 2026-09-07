import { Injectable } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { ClassificationResult, KeywordClassifier } from './keyword-classifier';
import { ClassifyRequestDto } from './dto/classify-request.dto';

export type ClassifyResult = ClassificationResult & { requestId: string | null };

/**
 * Orchestrates classification: runs the classifier, applies post-classification
 * business policy, and optionally persists the outcome onto a request. Kept
 * separate from RequestsService (CRUD) so the classifier can later become a
 * swappable provider (see task 5) without touching request storage.
 */
@Injectable()
export class ClassificationService {
  constructor(
    private readonly classifier: KeywordClassifier,
    private readonly requestsService: RequestsService,
  ) {}

  async classify(dto: ClassifyRequestDto): Promise<ClassifyResult> {
    const result = this.applyConfidencePolicy(
      this.classifier.classify(dto.message),
      dto.message,
    );

    if (!dto.requestId) {
      return { ...result, requestId: null };
    }

    const request = await this.requestsService.getById(dto.requestId);
    request.category = result.category;
    request.confidence = result.confidence;
    if (request.status === 'open') {
      request.status = 'in_progress';
    }
    await this.requestsService.save(request);
    return { ...result, requestId: request.id };
  }

  /**
   * Post-classification policy, independent of the classifier implementation:
   * soften confidence for very short messages, and fall back to "unknown" when
   * confidence is weak. Behaviour preserved from the original controller.
   */
  private applyConfidencePolicy(
    result: ClassificationResult,
    message: string,
  ): ClassificationResult {
    let adjusted = result;
    if (message.split(/\s+/).length < 3 && adjusted.category !== 'unknown') {
      adjusted = {
        category: adjusted.category,
        confidence: Math.max(0.5, adjusted.confidence - 0.15),
      };
    }
    if (adjusted.confidence < 0.55) {
      adjusted = { category: 'unknown', confidence: adjusted.confidence };
    }
    return adjusted;
  }
}
