import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { CreateRevenueAcquisitionCostDto } from './dto/create-revenue-acquisition-cost.dto';
import { ListRevenueAcquisitionCostsQueryDto } from './dto/list-revenue-acquisition-costs-query.dto';
import { UpdateRevenueAcquisitionCostDto } from './dto/update-revenue-acquisition-cost.dto';
import { RevenueAcquisitionCostService } from './revenue-acquisition-cost.service';
import {
  RevenueAcquisitionCostImportResponse,
  RevenueAcquisitionCostListResponse,
  RevenueAcquisitionCostResponse,
} from './revenue-acquisition-cost.types';
import { REVENUE_ACQUISITION_COST_UPLOAD_OPTIONS } from './revenue-acquisition-cost-upload.config';

@ApiTags('Revenue & Analytics (platform admin)')
@ApiBearerAuth()
@Controller('platform/revenue-analytics/acquisition-costs')
@UseGuards(PlatformAdminGuard)
export class RevenueAcquisitionCostController {
  constructor(private readonly costs: RevenueAcquisitionCostService) {}

  @Post()
  @ApiOperation({ summary: 'Create a monthly acquisition cost entry' })
  @ApiCreatedResponse({ type: RevenueAcquisitionCostResponse })
  create(
    @CurrentUser() user: RequestUser,
    @Body() input: CreateRevenueAcquisitionCostDto,
  ) {
    return this.costs.create(user.id, input);
  }

  @Get()
  @ApiOperation({ summary: 'List monthly acquisition cost entries' })
  @ApiOkResponse({ type: RevenueAcquisitionCostListResponse })
  list(@Query() query: ListRevenueAcquisitionCostsQueryDto) {
    return this.costs.list(query);
  }

  @Post('import')
  @UseInterceptors(
    FileInterceptor('file', REVENUE_ACQUISITION_COST_UPLOAD_OPTIONS),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description:
            'UTF-8 CSV up to 2 MB and 500 rows. Required columns: period, channel, sales_cost_usd, marketing_cost_usd. Optional: notes.',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Import monthly acquisition costs from CSV',
    description:
      'Validates the complete file before idempotently upserting rows by period and channel.',
  })
  @ApiCreatedResponse({ type: RevenueAcquisitionCostImportResponse })
  import(
    @CurrentUser() user: RequestUser,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.costs.import(user.id, file);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one acquisition cost entry' })
  @ApiOkResponse({ type: RevenueAcquisitionCostResponse })
  get(@Param('id') id: string) {
    return this.costs.get(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an acquisition cost entry' })
  @ApiOkResponse({ type: RevenueAcquisitionCostResponse })
  update(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() input: UpdateRevenueAcquisitionCostDto,
  ) {
    return this.costs.update(id, user.id, input);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an acquisition cost entry' })
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.costs.remove(id, user.id);
  }
}
