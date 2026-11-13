import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePlatformSettingsDto } from './update-platform-settings.dto';

describe('UpdatePlatformSettingsDto', () => {
  it('normalizes editable platform fields', async () => {
    const dto = plainToInstance(UpdatePlatformSettingsDto, {
      expectedRevision: '0',
      supportEmail: ' SUPPORT@NOLTRA.AI ',
      supportPhone: '+1 (555) 123-4567',
      defaultCurrency: 'bdt',
      maintenanceMode: true,
    });

    await expect(validate(dto)).resolves.toHaveLength(0);
    expect(dto).toEqual(
      expect.objectContaining({
        expectedRevision: 0,
        supportEmail: 'support@noltra.ai',
        supportPhone: '+15551234567',
        defaultCurrency: 'BDT',
        maintenanceMode: true,
      }),
    );
  });

  it('rejects non-http platform URLs', async () => {
    const dto = plainToInstance(UpdatePlatformSettingsDto, {
      expectedRevision: 0,
      platformUrl: 'ftp://example.com',
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'platformUrl' }),
      ]),
    );
  });

  it('rejects a non-boolean maintenance flag', async () => {
    const dto = plainToInstance(UpdatePlatformSettingsDto, {
      expectedRevision: 0,
      maintenanceMode: 'true',
    });

    await expect(validate(dto)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: 'maintenanceMode' }),
      ]),
    );
  });
});
