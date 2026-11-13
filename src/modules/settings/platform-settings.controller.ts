import {
  Body,
  Controller,
  Get,
  Patch,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { UpdatePlatformSettingsDto } from './dto/update-platform-settings.dto';
import { PlatformSettingsService } from './platform-settings.service';
import { UpdatePlatformBrandingDto } from './dto/update-platform-branding.dto';
import { ORGANIZATION_ASSET_UPLOAD_OPTIONS } from '../organizations/organization-logo-upload.config';

@ApiTags('Platform Settings')
@ApiBearerAuth()
@Controller('platform/settings')
@UseGuards(PlatformAdminGuard)
export class PlatformSettingsController {
  constructor(private readonly settings: PlatformSettingsService) {}

  @Get()
  @ApiOperation({
    summary: 'Get global platform information and regional settings',
  })
  get() {
    return this.settings.get();
  }

  @Patch()
  @ApiOperation({
    summary: 'Update global platform information and regional settings',
    description:
      'Send the revision returned by GET /api/v1/platform/settings as expectedRevision to prevent lost updates.',
  })
  update(
    @CurrentUser() actor: RequestUser,
    @Body() input: UpdatePlatformSettingsDto,
  ) {
    return this.settings.update(actor, input);
  }

  @Patch('branding')
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'logo', maxCount: 1 },
        { name: 'favicon', maxCount: 1 },
      ],
      ORGANIZATION_ASSET_UPLOAD_OPTIONS,
    ),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['expectedRevision'],
      properties: {
        expectedRevision: { type: 'integer', minimum: 0 },
        logo: {
          type: 'string',
          format: 'binary',
          description: 'JPEG, PNG, or WebP; maximum 5 MB.',
        },
        favicon: {
          type: 'string',
          format: 'binary',
          description: 'PNG or ICO; maximum 5 MB.',
        },
      },
    },
  })
  @ApiOperation({ summary: 'Upload global platform logo and/or favicon' })
  updateBranding(
    @CurrentUser() actor: RequestUser,
    @Body() input: UpdatePlatformBrandingDto,
    @UploadedFiles()
    files:
      | {
          logo?: Express.Multer.File[];
          favicon?: Express.Multer.File[];
        }
      | undefined,
  ) {
    return this.settings.updateBranding(actor, input, {
      logo: files?.logo?.[0],
      favicon: files?.favicon?.[0],
    });
  }
}
