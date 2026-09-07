import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestsService } from './requests.service';
import { ClassificationResult } from './keyword-classifier';
import { CLASSIFIER_PROVIDER, ClassifierProvider } from './classifier.provider';
import { Classification } from './classification.entity';
import { ClassifyRequestDto } from './dto/classify-request.dto';

export type ClassifyResult = ClassificationResult & { requestId: string | null };

export type ClassificationHistoryItem = {
  id: string;
  requestId: string | null;
  message: string;
  category: string;
  confidence: number;
  provider: string;
  createdAt: string;
};

/**
 * Orchestrates classification: runs the provider, applies post-classification
 * business policy, persists the outcome (history), and optionally writes it back
 * onto a request. Kept separate from RequestsService (CRUD) and decoupled from
 * any concrete classifier via the CLASSIFIER_PROVIDER token.
 */
@Injectable()
export class ClassificationService {
  static readonly DEFAULT_LIMIT = 25;
  static readonly MAX_LIMIT = 100;

  constructor(
    @Inject(CLASSIFIER_PROVIDER)
    private readonly provider: ClassifierProvider,
    @InjectRepository(Classification)
    private readonly classifications: Repository<Classification>,
    private readonly requestsService: RequestsService,
  ) {}

  async classify(dto: ClassifyRequestDto): Promise<ClassifyResult> {
    const result = this.applyConfidencePolicy(
      await this.provider.classify(dto.message),
      dto.message,
    );

    let requestId: string | null = null;
    if (dto.requestId) {
      const request = await this.requestsService.getById(dto.requestId);
      request.category = result.category;
      request.confidence = result.confidence;
      if (request.status === 'open') {
        request.status = 'in_progress';
      }
      await this.requestsService.save(request);
      requestId = request.id;
    }

    await this.classifications.save(
      this.classifications.create({
        requestId,
        message: dto.message,
        category: result.category,
        confidence: result.confidence,
        provider: this.provider.name,
      }),
    );

    return { ...result, requestId };
  }

  async history(
    category?: string,
    limit: number = ClassificationService.DEFAULT_LIMIT,
    offset = 0,
  ): Promise<ClassificationHistoryItem[]> {
    const take =
      Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), ClassificationService.MAX_LIMIT)
        : ClassificationService.DEFAULT_LIMIT;
    const skip = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;

    const query = this.classifications
      .createQueryBuilder('classification')
      .orderBy('classification.createdAt', 'DESC')
      .limit(take)
      .offset(skip);

    if (category) {
      query.where('classification.category = :category', { category });
    }

    const rows = await query.getMany();
    return rows.map((row) => ({
      id: row.id,
      requestId: row.requestId,
      message: row.message,
      category: row.category,
      confidence: row.confidence,
      provider: row.provider,
      createdAt: row.createdAt.toISOString(),
    }));
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
