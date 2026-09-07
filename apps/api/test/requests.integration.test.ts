import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource, Repository } from 'typeorm';
import { CustomerRequest } from '../src/requests/customer-request.entity';
import { RequestNote } from '../src/requests/request-note.entity';
import { Classification } from '../src/requests/classification.entity';
import { RequestsService } from '../src/requests/requests.service';
import { ClassificationService } from '../src/requests/classification.service';
import { KeywordClassifier } from '../src/requests/keyword-classifier';
import { KeywordClassifierProvider } from '../src/requests/keyword-classifier.provider';

// Isolated schema so these tests never touch a developer's seeded `public` data,
// and so they work on the empty CI database (the Test step runs before migrate).
const TEST_SCHEMA = 'cami_test';

// Counts every SQL statement TypeORM runs — the basis of the N+1 regression guard.
let queryCount = 0;
const countingLogger = {
  logQuery: () => {
    queryCount++;
  },
  logQueryError: () => {},
  logQuerySlow: () => {},
  logSchemaBuild: () => {},
  logMigration: () => {},
  log: () => {},
};

let dataSource: DataSource;
let requests: Repository<CustomerRequest>;
let classifications: Repository<Classification>;
let requestsService: RequestsService;
let classificationService: ClassificationService;

async function seedRequest(message: string, noteBodies: string[] = []): Promise<CustomerRequest> {
  const request = await requests.save(
    requests.create({ message, status: 'open', category: null, confidence: null }),
  );
  // Explicit, increasing created_at so "latest note" is deterministic.
  const base = Date.now();
  for (let index = 0; index < noteBodies.length; index++) {
    await dataSource.query(
      `INSERT INTO ${TEST_SCHEMA}.request_notes (body, author_name, request_id, created_at) VALUES ($1, $2, $3, $4)`,
      [noteBodies[index], 'seed', request.id, new Date(base + index * 1000)],
    );
  }
  return request;
}

beforeAll(async () => {
  dataSource = new DataSource({
    type: 'postgres',
    url: process.env.DATABASE_URL ?? 'postgres://cami:cami@localhost:5432/cami',
    entities: [CustomerRequest, RequestNote, Classification],
    schema: TEST_SCHEMA,
    synchronize: false,
    logging: true,
    logger: countingLogger,
  });
  await dataSource.initialize();
  await dataSource.query(`CREATE SCHEMA IF NOT EXISTS ${TEST_SCHEMA}`);
  await dataSource.synchronize(true);

  requests = dataSource.getRepository(CustomerRequest);
  classifications = dataSource.getRepository(Classification);
  requestsService = new RequestsService(requests);
  classificationService = new ClassificationService(
    new KeywordClassifierProvider(new KeywordClassifier()),
    classifications,
    requestsService,
  );
}, 30000);

afterAll(async () => {
  if (dataSource?.isInitialized) {
    await dataSource.query(`DROP SCHEMA IF EXISTS ${TEST_SCHEMA} CASCADE`);
    await dataSource.destroy();
  }
});

beforeEach(async () => {
  await dataSource.query(
    `TRUNCATE TABLE ${TEST_SCHEMA}.classifications, ${TEST_SCHEMA}.request_notes, ${TEST_SCHEMA}.customer_requests CASCADE`,
  );
  queryCount = 0;
});

describe('RequestsService.list (aggregation)', () => {
  it('returns correct noteCount and latestNotePreview', async () => {
    const withNotes = await seedRequest('help please', ['first note', 'latest note']);
    await seedRequest('no notes here', []);

    const items = await requestsService.list(50, 0);

    const withNotesItem = items.find((item) => item.id === withNotes.id)!;
    expect(withNotesItem.noteCount).toBe(2);
    expect(withNotesItem.latestNotePreview).toBe('latest note');

    const emptyItem = items.find((item) => item.message === 'no notes here')!;
    expect(emptyItem.noteCount).toBe(0);
    expect(emptyItem.latestNotePreview).toBeNull();
  });

  it('issues a constant, small number of queries regardless of row count (N+1 guard)', async () => {
    for (let i = 0; i < 3; i++) {
      await seedRequest(`small ${i}`, ['a', 'b']);
    }
    queryCount = 0;
    await requestsService.list(100, 0);
    const forFewRows = queryCount;

    for (let i = 0; i < 30; i++) {
      await seedRequest(`large ${i}`, ['a', 'b', 'c']);
    }
    queryCount = 0;
    await requestsService.list(100, 0);
    const forManyRows = queryCount;

    // The whole point of the fix: query count does not grow with row count.
    expect(forManyRows).toBe(forFewRows);
    expect(forManyRows).toBeLessThanOrEqual(2);
  });

  it('paginates: respects limit and offset', async () => {
    for (let i = 0; i < 5; i++) {
      await seedRequest(`row ${i}`);
    }
    const page1 = await requestsService.list(2, 0);
    const page2 = await requestsService.list(2, 2);
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    expect(page1.map((r) => r.id)).not.toEqual(page2.map((r) => r.id));
  });
});

describe('ClassificationService', () => {
  it('persists a Classification row with the provider name', async () => {
    const result = await classificationService.classify({ message: 'please refund my invoice charge' });

    expect(result.category).toBe('billing');
    const rows = await classifications.find();
    expect(rows).toHaveLength(1);
    expect(rows[0].provider).toBe('keyword');
    expect(rows[0].category).toBe('billing');
    expect(rows[0].requestId).toBeNull();
  });

  it('links the classification and updates the request when a requestId is given', async () => {
    const request = await seedRequest('the app is broken, need help with this bug');

    const result = await classificationService.classify({
      message: 'the app is broken, need help with this bug',
      requestId: request.id,
    });

    expect(result.requestId).toBe(request.id);
    const updated = await requests.findOneByOrFail({ id: request.id });
    expect(updated.category).toBe('support');
    expect(updated.status).toBe('in_progress'); // open -> in_progress on classify
  });

  it('softens confidence for very short messages (business policy preserved)', async () => {
    // 'invoice refund' -> billing 0.86, but < 3 words -> soften by 0.15
    const result = await classificationService.classify({ message: 'invoice refund' });
    expect(result.category).toBe('billing');
    expect(result.confidence).toBeCloseTo(0.71, 5);
  });

  it('history filters server-side by category, newest first', async () => {
    await classificationService.classify({ message: 'please refund my invoice' }); // billing
    await classificationService.classify({ message: 'pricing and a demo to upgrade' }); // sales

    const billing = await classificationService.history('billing');
    expect(billing).toHaveLength(1);
    expect(billing[0].category).toBe('billing');

    const all = await classificationService.history();
    expect(all).toHaveLength(2);
  });
});
