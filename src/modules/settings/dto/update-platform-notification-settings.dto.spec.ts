import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePlatformNotificationSettingsDto } from './update-platform-notification-settings.dto';

describe('UpdatePlatformNotificationSettingsDto', () => {
  it('normalizes and validates recipient emails', async () => {
    const dto = plainToInstance(UpdatePlatformNotificationSettingsDto, {
      expectedRevision: 0,
      emailRecipients: [' ADMIN@NOLTRA.AI ', 'ops@noltra.ai'],
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto.emailRecipients).toEqual(['admin@noltra.ai', 'ops@noltra.ai']);
  });

  it('rejects duplicate normalized recipients', async () => {
    const dto = plainToInstance(UpdatePlatformNotificationSettingsDto, {
      expectedRevision: 0,
      emailRecipients: ['admin@noltra.ai', 'ADMIN@NOLTRA.AI'],
    });

    const errors = await validate(dto);
    expect(errors.some((error) => error.property === 'emailRecipients')).toBe(
      true,
    );
  });
});
