import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateMessageDto } from './create-message.dto';

describe('CreateMessageDto', () => {
  it('treats a blank multipart clientMessageId as omitted', async () => {
    const input = plainToInstance(CreateMessageDto, {
      content: 'hello',
      clientMessageId: '',
      files: '',
    });

    await expect(
      validate(input, { whitelist: true, forbidNonWhitelisted: true }),
    ).resolves.toHaveLength(0);
    expect(input.clientMessageId).toBeUndefined();
  });

  it('continues to reject a non-empty invalid idempotency key', async () => {
    const input = plainToInstance(CreateMessageDto, {
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
});
