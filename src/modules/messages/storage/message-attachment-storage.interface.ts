import { MessageAttachmentCategory } from '../../../common/enums/message-attachment-category.enum';

export const MESSAGE_ATTACHMENT_STORAGE = Symbol('MESSAGE_ATTACHMENT_STORAGE');

export type StoreMessageAttachmentInput = {
  organizationId: string;
  conversationId: string;
  uploadId: string;
  localPath: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  category: MessageAttachmentCategory;
};

export type StoredMessageAttachment = {
  storageProvider: string;
  storageKey: string;
  storageAssetId?: string;
  storageResourceType: string;
  storageDeliveryType: string;
  storageFormat: string;
  sizeBytes: number;
};

export type MessageAttachmentStorageReference = {
  storageKey: string;
  storageAssetId?: string;
  storageResourceType: string;
  storageDeliveryType: string;
  storageFormat: string;
};

export type MessageAttachmentDownload = {
  downloadUrl: string;
  expiresAt: Date;
};

export interface MessageAttachmentStorage {
  store(input: StoreMessageAttachmentInput): Promise<StoredMessageAttachment>;
  getDownload(
    reference: MessageAttachmentStorageReference,
    disposition: 'inline' | 'attachment',
  ): Promise<MessageAttachmentDownload>;
  delete(reference: MessageAttachmentStorageReference): Promise<void>;
}
