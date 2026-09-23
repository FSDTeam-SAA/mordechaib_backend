import { PartialType } from '@nestjs/swagger';
import { CreateAddonProductDto } from './create-addon-product.dto';

export class UpdateAddonProductDto extends PartialType(CreateAddonProductDto) {}
