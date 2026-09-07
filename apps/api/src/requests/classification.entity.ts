import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * An immutable record of one classification run. Persisted on every classify
 * call (with or without a linked request) so `/requests/history` can list and
 * filter past classifications.
 */
@Entity({ name: 'classifications' })
@Index('idx_classifications_category_created_at', ['category', 'createdAt'])
export class Classification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  // Nullable: a message can be classified without being attached to a request.
  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'varchar', length: 32 })
  category!: string;

  @Column({ type: 'float' })
  confidence!: number;

  // Which provider produced this result, e.g. 'keyword' (or a future LLM).
  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
