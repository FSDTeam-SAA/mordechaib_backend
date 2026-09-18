import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/types/request-context.type';
import { AuthService } from './auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

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
  updateProfile(
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.service.updateProfile(user.id, dto);
  }
}
