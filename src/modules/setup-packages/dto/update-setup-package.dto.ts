import { PartialType } from '@nestjs/swagger';
import { CreateSetupPackageDto } from './create-setup-package.dto';

export class UpdateSetupPackageDto extends PartialType(CreateSetupPackageDto) {}
