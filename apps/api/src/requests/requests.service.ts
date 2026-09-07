import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CustomerRequest, RequestStatus } from './customer-request.entity';
import { RequestNote } from './request-note.entity';

export type RequestListItem = {
  id: string;
  message: string;
  status: RequestStatus;
  category: string | null;
  confidence: number | null;
  noteCount: number;
  latestNotePreview: string | null;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class RequestsService {
  static readonly DEFAULT_LIMIT = 25;
  static readonly MAX_LIMIT = 100;

  constructor(
    @InjectRepository(CustomerRequest)
    private readonly requests: Repository<CustomerRequest>,
  ) {}

  /**
   * List requests with per-row note aggregates in a single query.
   *
   * Replaces an N+1 (one notes query per request) with one aggregate query:
   * a grouped COUNT for `noteCount` and a LIMIT 1 correlated subquery for the
   * latest note preview. Query count is now constant in the number of rows.
   * Paginated (the client only renders a page), so the response stays an array
   * of the same shape.
   */
  async list(
    limit: number = RequestsService.DEFAULT_LIMIT,
    offset = 0,
  ): Promise<RequestListItem[]> {
    const take =
      Number.isFinite(limit) && limit > 0
        ? Math.min(Math.floor(limit), RequestsService.MAX_LIMIT)
        : RequestsService.DEFAULT_LIMIT;
    const skip = Number.isFinite(offset) && offset > 0 ? Math.floor(offset) : 0;

    const rows = await this.requests
      .createQueryBuilder('request')
      .leftJoin('request.notes', 'note')
      .select('request.id', 'id')
      .addSelect('request.message', 'message')
      .addSelect('request.status', 'status')
      .addSelect('request.category', 'category')
      .addSelect('request.confidence', 'confidence')
      .addSelect('request.createdAt', 'createdAt')
      .addSelect('request.updatedAt', 'updatedAt')
      .addSelect('COUNT(note.id)', 'noteCount')
      .addSelect(
        (sub) =>
          sub
            .select('latest.body')
            .from(RequestNote, 'latest')
            .where('latest.requestId = request.id')
            .orderBy('latest.createdAt', 'DESC')
            .limit(1),
        'latestNotePreview',
      )
      .groupBy('request.id')
      .orderBy('request.createdAt', 'DESC')
      .limit(take)
      .offset(skip)
      .getRawMany<{
        id: string;
        message: string;
        status: RequestStatus;
        category: string | null;
        confidence: number | null;
        createdAt: Date;
        updatedAt: Date;
        noteCount: string;
        latestNotePreview: string | null;
      }>();

    return rows.map((row) => ({
      id: row.id,
      message: row.message,
      status: row.status,
      category: row.category,
      confidence: row.confidence,
      noteCount: Number(row.noteCount),
      latestNotePreview: row.latestNotePreview ?? null,
      createdAt: new Date(row.createdAt).toISOString(),
      updatedAt: new Date(row.updatedAt).toISOString(),
    }));
  }

  async getById(id: string): Promise<CustomerRequest> {
    const row = await this.requests.findOne({
      where: { id },
      relations: { notes: true },
    });
    if (!row) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    return row;
  }

  /**
   * Fetch a request WITHOUT its notes — for write paths (status update,
   * classify) that only touch scalar columns and would otherwise eager-load
   * every note just to save one field.
   */
  async requireById(id: string): Promise<CustomerRequest> {
    const row = await this.requests.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Request ${id} not found`);
    }
    return row;
  }

  async updateStatus(id: string, status: RequestStatus): Promise<CustomerRequest> {
    const row = await this.requireById(id);
    row.status = status;
    return this.requests.save(row);
  }

  async create(message: string): Promise<CustomerRequest> {
    const row = this.requests.create({
      message,
      status: 'open',
      category: null,
      confidence: null,
    });
    return this.requests.save(row);
  }

  async save(request: CustomerRequest): Promise<CustomerRequest> {
    return this.requests.save(request);
  }
}
