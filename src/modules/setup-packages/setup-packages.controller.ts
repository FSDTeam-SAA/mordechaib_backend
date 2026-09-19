import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { RequestUser } from '../../common/types/request-context.type';
import { CreateSetupPackageDto } from './dto/create-setup-package.dto';
import { UpdateSetupPackageDto } from './dto/update-setup-package.dto';
import { SetupPackagesService } from './setup-packages.service';

@ApiTags('Setup Packages')
@Controller('setup-packages')
export class SetupPackagesController {
  constructor(private readonly service: SetupPackagesService) {}

  // The onboarding UI consumes this active catalog. It cannot ask the client
  // to set a package price because the server owns the commercial rules.
  @Public()
  @Get()
  findAllPublic() {
    return this.service.findPublicCatalog();
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Get('admin')
  findAllForAdmin() {
    return this.service.findAll(true);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Get('admin/:id')
  findOneForAdmin(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Post()
  create(@Body() dto: CreateSetupPackageDto, @CurrentUser() user: RequestUser) {
    return this.service.create(dto, user.id);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSetupPackageDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.update(id, dto, user.id);
  }
}
