import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Expand migration: additive new table, backward-compatible with the previous
 * release (nothing reads or writes `classifications` until the code that ships
 * with this migration). Ships alongside task 5.
 */
export class AddClassifications1710000100000 implements MigrationInterface {
  name = 'AddClassifications1710000100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS classifications (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        request_id uuid NULL REFERENCES customer_requests(id) ON DELETE SET NULL,
        message text NOT NULL,
        category varchar(32) NOT NULL,
        confidence double precision NOT NULL,
        provider varchar(64) NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_classifications_category_created_at
      ON classifications(category, created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS classifications;`);
  }
}
