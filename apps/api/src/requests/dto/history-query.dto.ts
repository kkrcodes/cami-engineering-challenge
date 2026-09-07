import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CLASSIFICATION_CATEGORIES } from '../keyword-classifier';

export class HistoryQueryDto {
  @IsOptional()
  @IsIn([...CLASSIFICATION_CATEGORIES])
  category?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
