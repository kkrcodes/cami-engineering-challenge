import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { ClassificationService } from './classification.service';
import { ClassifyRequestDto } from './dto/classify-request.dto';
import { CreateRequestDto } from './dto/create-request.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { HistoryQueryDto } from './dto/history-query.dto';

@Controller('requests')
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly classificationService: ClassificationService,
  ) {}

  @Get()
  list(@Query('limit') limit?: string, @Query('offset') offset?: string) {
    return this.requestsService.list(
      limit !== undefined ? Number(limit) : undefined,
      offset !== undefined ? Number(offset) : undefined,
    );
  }

  @Get('history')
  history(@Query() query: HistoryQueryDto) {
    return this.classificationService.history(
      query.category,
      query.limit,
      query.offset,
    );
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.requestsService.getById(id);
  }

  @Post()
  create(@Body() dto: CreateRequestDto) {
    return this.requestsService.create(dto.message);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.requestsService.updateStatus(id, dto.status);
  }

  @Post('classify')
  classify(@Body() dto: ClassifyRequestDto) {
    return this.classificationService.classify(dto);
  }
}
