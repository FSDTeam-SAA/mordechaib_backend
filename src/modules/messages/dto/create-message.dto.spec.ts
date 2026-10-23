import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMessageDto } from './create-message.dto';

describe('CreateMessageDto', () => {
  it('treats a blank multipart clientMessageId as omitted', async () => {
    const input = plainToInstance(CreateMessageDto, {
      startNewConversation: 'true',
      content: 'hello',
      clientMessageId: '',
      conversationId: '',
      selectedAgentId: '',
      files: '',
    });

    await expect(
      validate(input, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
    expect(input.clientMessageId).toBeUndefined();
    expect(input.conversationId).toBeUndefined();
    expect(input.selectedAgentId).toBeUndefined();
    expect(input.startNewConversation).toBe(true);
  });

  it('continues to reject a non-empty invalid idempotency key', async () => {
    const input = plainToInstance(CreateMessageDto, {
      startNewConversation: false,
      conversationId: '507f1f77bcf86cd799439011',
      content: 'hello',
      clientMessageId: 'user-123',
    });

    const errors = await validate(input, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([
      expect.objectContaining({ property: 'clientMessageId' }),
    ]);
  });

  it('requires an explicit conversation intent', async () => {
    const input = plainToInstance(CreateMessageDto, { content: 'hello' });

    const errors = await validate(input, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    expect(errors).toEqual([
      expect.objectContaining({ property: 'startNewConversation' }),
    ]);
  });
});
