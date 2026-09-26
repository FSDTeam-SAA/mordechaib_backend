import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Patch,
  UploadedFiles,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { BusinessIndustry } from '../../common/enums/business-industry.enum';
import { BusinessSize } from '../../common/enums/business-size.enum';
import { UserRole } from '../../common/enums/user-role.enum';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { UpdateOnboardingDto } from './dto/update-onboarding.dto';
import { ORGANIZATION_ASSET_UPLOAD_OPTIONS } from './organization-logo-upload.config';
import { OrganizationsService } from './organizations.service';

@ApiTags('Organizations')
@ApiBearerAuth()
@Controller('organizations')
@UseGuards(OrganizationGuard)
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Get('me')
  findMe(@CurrentOrg() organization: RequestOrganization) {
    return this.service.findCurrent(organization.id);
  }

  @Get(':organizationId')
  findOne(
    @Param('organizationId') organizationId: string,
    @CurrentOrg() organization: RequestOrganization,
  ) {
    this.assertOrganization(organizationId, organization.id);
    return this.service.findCurrent(organization.id);
  }

  @Patch('me')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
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
    required: true,
    description:
      'Copy `updatedAt` from GET /organizations/me into `expectedUpdatedAt`, then send only the company fields to change. This prevents overwriting newer settings. Upload `logo` as JPEG, PNG, or WebP and `favicon` as PNG or ICO (maximum 5 MB each).',
    schema: {
      type: 'object',
      required: ['expectedUpdatedAt'],
      properties: {
        expectedUpdatedAt: {
          type: 'string',
          format: 'date-time',
          description:
            'The updatedAt value returned by the most recent GET /organizations/me.',
          example: '2026-09-19T10:30:00.000Z',
        },
        companyName: { type: 'string', maxLength: 120, example: 'Noltra AI' },
        website: {
          type: 'string',
          format: 'uri',
          example: 'https://noltra.ai',
        },
        phoneNumber: { type: 'string', example: '+8801712345678' },
        emailAddress: {
          type: 'string',
          format: 'email',
          example: 'hello@noltra.ai',
        },
        timezone: { type: 'string', maxLength: 80, example: 'Asia/Dhaka' },
        language: { type: 'string', example: 'en' },
        maintenanceMode: { type: 'boolean', example: false },
        defaultCurrency: { type: 'string', example: 'USD' },
        dateFormat: {
          type: 'string',
          enum: ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'],
          example: 'MM/DD/YYYY',
        },
        timeFormat: {
          type: 'string',
          enum: ['12H', '24H'],
          example: '12H',
        },
        businessHoursStart: { type: 'string', example: '09:00' },
        businessHoursEnd: { type: 'string', example: '17:00' },
        city: { type: 'string', maxLength: 100, example: 'Dhaka' },
        street: { type: 'string', maxLength: 200, example: 'Gulshan Avenue' },
        state: { type: 'string', maxLength: 100, example: 'Dhaka' },
        postalCode: { type: 'string', maxLength: 20, example: '1212' },
        industry: {
          type: 'string',
          enum: Object.values(BusinessIndustry),
          example: BusinessIndustry.TECHNOLOGY,
        },
        businessSize: {
          type: 'string',
          enum: Object.values(BusinessSize),
          example: BusinessSize.TWO_TO_TEN,
        },
        logo: {
          type: 'string',
          format: 'binary',
          description:
            'Company logo file. JPEG, PNG, or WebP; maximum 5 MB. Stored in Cloudinary.',
        },
        favicon: {
          type: 'string',
          format: 'binary',
          description:
            'Favicon file. PNG or ICO; maximum 5 MB. Stored in Cloudinary.',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Update company settings and/or upload branding assets',
  })
  updateMe(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateOnboardingDto,
    @UploadedFiles()
    files:
      | {
          logo?: Express.Multer.File[];
          favicon?: Express.Multer.File[];
        }
      | undefined,
  ) {
    return this.service.updateSettings(organization.id, dto, user.id, {
      logo: files?.logo?.[0],
      favicon: files?.favicon?.[0],
    });
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @Patch('onboarding/:organizationId')
  @ApiParam({ name: 'organizationId', required: true })
  updateOnboarding(
    @Param('organizationId') organizationId: string,
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateOnboardingDto,
  ) {
    this.assertOrganization(organizationId, organization.id);
    return this.service.updateOnboarding(organization.id, dto, user.id);
  }

  private assertOrganization(requestedId: string, currentId: string) {
    if (requestedId !== currentId) {
      throw new ForbiddenException(
        'You do not have access to this organization',
      );
    }
  }
}
