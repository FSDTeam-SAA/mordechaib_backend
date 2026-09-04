import { MessageAttachmentCategory } from '../../common/enums/message-attachment-category.enum';
import {
  MESSAGE_ATTACHMENT_SIZE_LIMITS,
  resolveAttachmentCategory,
} from './message-upload.config';

describe('message upload configuration', () => {
  it.each([
    ['photo.jpg', 'image/jpeg', MessageAttachmentCategory.IMAGE],
    ['voice.webm', 'audio/webm', MessageAttachmentCategory.AUDIO],
    ['clip.webm', 'video/webm', MessageAttachmentCategory.VIDEO],
    ['report.pdf', 'application/pdf', MessageAttachmentCategory.PDF],
    [
      'forecast.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      MessageAttachmentCategory.DOCUMENT,
    ],
  ])(
    'classifies %s using both extension and MIME type',
    (name, mime, expected) => {
      expect(resolveAttachmentCategory(name, mime)).toBe(expected);
    },
  );

  it('rejects an allowed extension when the MIME type does not match', () => {
    expect(
      resolveAttachmentCategory('payload.jpg', 'application/pdf'),
    ).toBeUndefined();
  });

  it('applies the agreed category-specific size limits', () => {
    expect(
      MESSAGE_ATTACHMENT_SIZE_LIMITS[MessageAttachmentCategory.IMAGE],
    ).toBe(20 * 1024 * 1024);
    expect(
      MESSAGE_ATTACHMENT_SIZE_LIMITS[MessageAttachmentCategory.DOCUMENT],
    ).toBe(20 * 1024 * 1024);
    expect(
      MESSAGE_ATTACHMENT_SIZE_LIMITS[MessageAttachmentCategory.AUDIO],
    ).toBe(50 * 1024 * 1024);
    expect(
      MESSAGE_ATTACHMENT_SIZE_LIMITS[MessageAttachmentCategory.VIDEO],
    ).toBe(200 * 1024 * 1024);
  });
});
