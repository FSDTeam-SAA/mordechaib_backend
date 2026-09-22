import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { AddonProductsService } from './addon-products.service';
import { CreateAddonProductDto } from './dto/create-addon-product.dto';
import { UpdateAddonProductDto } from './dto/update-addon-product.dto';

@ApiTags('Add-on products')
@Controller('addon-products')
export class AddonProductsController {
  constructor(private readonly service: AddonProductsService) {}

  // Public — pricing/checkout pages need this without auth.
  @Public()
  @Get()
  findAllPublic() {
    return this.service.findAll(false);
  }

  // Admin — includes inactive
  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  @Get('admin')
  findAllForAdmin(
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.service.findAll(includeInactive === 'true');
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Post()
  create(@Body() dto: CreateAddonProductDto) {
    return this.service.create(dto);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAddonProductDto) {
    return this.service.update(id, dto);
  }

  @ApiBearerAuth()
  @UseGuards(PlatformAdminGuard)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.delete(id);
  }
}
