import {
  Body,
  Controller,
  Get,
  Patch,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-context.type';
import { AuthService } from './auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { PROFILE_AVATAR_UPLOAD_OPTIONS } from './profile-avatar-upload.config';

@ApiTags('Users')
@ApiBearerAuth()
@Controller('auth')
export class AuthProfileController {
  constructor(private readonly service: AuthService) {}

  @Get('me')
  getMe(@CurrentUser() user: RequestUser) {
    return this.service.getMe(user.id);
  }

  @Patch('me')
  @UseInterceptors(FileInterceptor('avatar', PROFILE_AVATAR_UPLOAD_OPTIONS))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    required: true,
    description:
      'Copy `updatedAt` from GET /auth/me into `expectedUpdatedAt`, then send only the fields to change. This prevents overwriting a newer profile update. Upload `avatar` as a file (JPEG, PNG, or WebP; maximum 5 MB).',
    schema: {
      type: 'object',
      required: ['expectedUpdatedAt'],
      properties: {
        expectedUpdatedAt: {
          type: 'string',
          format: 'date-time',
          description:
            'The updatedAt value returned by the most recent GET /auth/me.',
          example: '2026-09-19T10:30:00.000Z',
        },
        firstName: {
          type: 'string',
          minLength: 1,
          maxLength: 80,
          example: 'Rifat',
        },
        lastName: {
          type: 'string',
          minLength: 1,
          maxLength: 80,
          example: 'Hossain',
        },
        phoneNumber: {
          type: 'string',
          example: '+8801712345678',
        },
        timezone: {
          type: 'string',
          maxLength: 80,
          example: 'Asia/Dhaka',
        },
        language: {
          type: 'string',
          example: 'en',
        },
        avatar: {
          type: 'string',
          format: 'binary',
          description:
            'Profile image file. JPEG, PNG, or WebP; maximum 5 MB. Stored in Cloudinary.',
        },
      },
    },
  })
  @ApiOperation({
    summary: 'Update profile fields and/or upload a profile avatar',
  })
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
    @UploadedFile() avatar: Express.Multer.File | undefined,
  ) {
    return this.service.updateProfile(user.id, dto, avatar);
  }
}
