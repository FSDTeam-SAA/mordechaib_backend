import { Injectable } from '@nestjs/common';
import { CloudinaryImageStorageService } from '../../common/storage/cloudinary-image-storage.service';

@Injectable()
export class ContactAvatarStorageService {
  constructor(private readonly images: CloudinaryImageStorageService) {}

  upload(organizationId: string, contactId: string, file: Express.Multer.File) {
    return this.images.upload({
      file,
      folder: `noltra/customer-avatars/${organizationId}`,
      publicId: contactId,
      tag: 'noltra-customer-avatar',
      label: 'Customer avatar',
      transformation: [
        { width: 512, height: 512, crop: 'fill', gravity: 'face' },
      ],
    });
  }

  delete(organizationId: string, contactId: string) {
    return this.images.delete({
      folder: `noltra/customer-avatars/${organizationId}`,
      publicId: contactId,
      label: 'Customer avatar',
    });
  }
}
