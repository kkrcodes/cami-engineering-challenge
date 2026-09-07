import { IsIn } from 'class-validator';
import { RequestStatus } from '../customer-request.entity';

const REQUEST_STATUSES: RequestStatus[] = ['open', 'in_progress', 'resolved'];

export class UpdateStatusDto {
  @IsIn(REQUEST_STATUSES)
  status!: RequestStatus;
}
