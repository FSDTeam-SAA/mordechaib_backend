import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryImageStorageService } from '../../common/storage/cloudinary-image-storage.service';

@Injectable()
export class AgentImageStorageService {
  constructor(
    private readonly images: CloudinaryImageStorageService,
    private readonly config: ConfigService,
  ) {}

  upload(agentId: string, file: Express.Multer.File) {
    return this.images.upload({
      file,
      folder: this.folder,
      publicId: agentId,
      tag: 'noltra-agent-image',
      label: 'Agent image',
      transformation: [{ width: 512, height: 512, crop: 'limit' }],
    });
  }

  delete(agentId: string) {
    return this.images.delete({
      folder: this.folder,
      publicId: agentId,
      label: 'Agent image',
    });
  }

  private get folder() {
    return this.config.get<string>(
      'cloudinary.agentImageFolder',
      'noltra/agents',
    );
  }
}
