import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import { MessageAttachmentCategory } from '../../../common/enums/message-attachment-category.enum';
import { CloudinaryMessageAttachmentStorage } from './cloudinary-message-attachment.storage';

jest.mock('cloudinary', () => ({
  v2: {
    config: jest.fn(),
    uploader: {
      upload: jest.fn(),
      upload_large: jest.fn(),
      destroy: jest.fn(),
    },
    utils: { private_download_url: jest.fn() },
  },
}));

describe('CloudinaryMessageAttachmentStorage', () => {
  const configValues: Record<string, unknown> = {
    'cloudinary.cloudName': 'cloud-name',
    'cloudinary.apiKey': 'api-key',
    'cloudinary.apiSecret': 'api-secret',
    'cloudinary.messageFolder': 'noltra/messages',
    'cloudinary.downloadUrlTtlSeconds': 300,
  };
  const config = {
    get: jest.fn((key: string, fallback?: unknown) =>
      key in configValues ? configValues[key] : fallback,
    ),
  } as unknown as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('includes the extension in raw document public IDs', async () => {
    const upload = cloudinary.uploader.upload as jest.Mock;
    upload.mockResolvedValue({
      public_id: 'noltra/messages/org-1/conversation-1/upload-1.docx',
      asset_id: 'asset-1',
      resource_type: 'raw',
      type: 'authenticated',
      bytes: 100,
    });
    const storage = new CloudinaryMessageAttachmentStorage(config);

    await storage.store({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      uploadId: 'upload-1',
      localPath: 'temporary.docx',
      originalName: 'Quarterly Plan.docx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: 100,
      category: MessageAttachmentCategory.DOCUMENT,
    });

    expect(upload).toHaveBeenCalledWith(
      'temporary.docx',
      expect.objectContaining({
        resource_type: 'raw',
        type: 'authenticated',
        public_id: 'upload-1.docx',
      }),
    );
  });

  it('waits for the callback result from chunked large uploads', async () => {
    const uploadLarge = cloudinary.uploader.upload_large as jest.Mock;
    uploadLarge.mockImplementation(
      (
        _path: string,
        _options: unknown,
        callback: (error?: unknown, result?: Record<string, unknown>) => void,
      ) => {
        callback(undefined, {
          public_id: 'noltra/messages/org-1/conversation-1/upload-2',
          asset_id: 'asset-2',
          resource_type: 'video',
          type: 'authenticated',
          format: 'mp4',
          bytes: 150 * 1024 * 1024,
        });
      },
    );
    const storage = new CloudinaryMessageAttachmentStorage(config);

    const result = await storage.store({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      uploadId: 'upload-2',
      localPath: 'temporary.mp4',
      originalName: 'meeting.mp4',
      mimeType: 'video/mp4',
      sizeBytes: 150 * 1024 * 1024,
      category: MessageAttachmentCategory.VIDEO,
    });

    expect(uploadLarge).toHaveBeenCalledWith(
      'temporary.mp4',
      expect.objectContaining({
        resource_type: 'video',
        chunk_size: 20 * 1024 * 1024,
      }),
      expect.any(Function),
    );
    expect(result).toEqual(
      expect.objectContaining({
        storageKey: 'noltra/messages/org-1/conversation-1/upload-2',
        sizeBytes: 150 * 1024 * 1024,
      }),
    );
  });

  it('returns a short-lived authenticated download URL', async () => {
    const privateDownloadUrl = cloudinary.utils
      .private_download_url as jest.Mock;
    privateDownloadUrl.mockReturnValue('https://api.cloudinary.test/download');
    const storage = new CloudinaryMessageAttachmentStorage(config);

    const before = Date.now();
    const result = await storage.getDownload(
      {
        storageKey: 'noltra/messages/org-1/conversation-1/upload-3',
        storageResourceType: 'image',
        storageDeliveryType: 'authenticated',
        storageFormat: 'jpg',
      },
      'attachment',
    );

    expect(privateDownloadUrl).toHaveBeenCalledWith(
      'noltra/messages/org-1/conversation-1/upload-3',
      'jpg',
      expect.objectContaining({
        resource_type: 'image',
        type: 'authenticated',
        attachment: true,
      }),
    );
    expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(before + 300_000);
  });
});
