import {
  MAX_AI_CHAT_ATTACHMENTS,
  MAX_AI_CHAT_UPLOAD_BYTES,
  validateAiChatUploads,
} from './ai-chat-upload.policy';

function upload(
  originalname: string,
  mimetype: string,
  size = 100,
): Express.Multer.File {
  return {
    path: `C:\\temp\\${originalname}`,
    originalname,
    mimetype,
    size,
  } as Express.Multer.File;
}

describe('AI chat upload policy', () => {
  it.each([
    ['report.pdf', 'application/pdf'],
    [
      'brief.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
    ['photo.png', 'image/png'],
    ['photo.jpg', 'image/jpeg'],
    ['photo.webp', 'image/webp'],
    ['animation.gif', 'image/gif'],
  ])('allows %s', (name, mime) => {
    expect(validateAiChatUploads([upload(name, mime)])).toEqual([
      expect.objectContaining({ originalName: name, mimeType: mime }),
    ]);
  });

  it('rejects file types that the AI attachment contract does not support', () => {
    expect(() =>
      validateAiChatUploads([upload('voice.mp3', 'audio/mpeg')]),
    ).toThrow('AI chat does not support attachment');
  });

  it('enforces the file-count limit', () => {
    const files = Array.from(
      { length: MAX_AI_CHAT_ATTACHMENTS + 1 },
      (_, index) => upload(`file-${index}.pdf`, 'application/pdf'),
    );
    expect(() => validateAiChatUploads(files)).toThrow(
      `at most ${MAX_AI_CHAT_ATTACHMENTS}`,
    );
  });

  it('enforces the aggregate request-size limit', () => {
    expect(() =>
      validateAiChatUploads([
        upload('large.pdf', 'application/pdf', MAX_AI_CHAT_UPLOAD_BYTES + 1),
      ]),
    ).toThrow('20 MB request limit');
  });
});
