import { BadRequestException } from '@nestjs/common';
import { SetupFeeType } from '../../common/enums/setup-fee-type.enum';
import { SetupType } from '../../common/enums/setup-type.enum';
import { SetupPackagesRepository } from './setup-packages.repository';
import { SetupPackagesService } from './setup-packages.service';

describe('SetupPackagesService', () => {
  const repository = {
    findByCode: jest.fn(),
    create: jest.fn(),
    findById: jest.fn(),
    updateById: jest.fn(),
  };
  const service = new SetupPackagesService(
    repository as unknown as SetupPackagesRepository,
  );

  beforeEach(() => jest.clearAllMocks());

  it('derives payment and meeting rules for a paid done-for-you package', async () => {
    repository.findByCode.mockResolvedValue(null);
    repository.create.mockResolvedValue({ id: 'package-1' });

    await service.create(
      {
        code: 'enterprise_setup',
        name: 'Enterprise Launch Package',
        setupType: SetupType.DONE_FOR_YOU,
        setupFeeType: SetupFeeType.PAID_ADDON,
        price: 199,
        currency: 'usd',
      },
      'admin-1',
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        code: 'ENTERPRISE_SETUP',
        price: 199,
        currency: 'USD',
        paymentRequired: true,
        meetingRequired: true,
      }),
    );
  });

  it('does not allow a free package to be given a charge', async () => {
    repository.findByCode.mockResolvedValue(null);

    await expect(
      service.create(
        {
          code: 'FREE_CALL',
          name: 'Free Integration Call',
          setupType: SetupType.DONE_FOR_YOU,
          setupFeeType: SetupFeeType.FREE,
          price: 25,
          currency: 'USD',
        },
        'admin-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
