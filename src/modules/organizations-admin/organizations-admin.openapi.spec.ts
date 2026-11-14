import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { OrganizationsAdminController } from './organizations-admin.controller';
import { OrganizationsAdminService } from './organizations-admin.service';

describe('Organizations Admin OpenAPI contract', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [OrganizationsAdminController],
      providers: [
        PlatformAdminGuard,
        {
          provide: OrganizationsAdminService,
          useValue: {
            list: jest.fn(),
            getById: jest.fn(),
            getPlanOptions: jest.fn(),
            updateStatus: jest.fn(),
            changePlan: jest.fn(),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();
    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Organizations Admin').build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes the organization-aware plan options route', () => {
    const operation =
      document.paths['/api/v1/organizations-admin/{id}/plan-options']?.get;

    expect(operation).toBeDefined();
    expect(operation?.parameters).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'billingInterval',
          in: 'query',
          required: false,
        }),
      ]),
    );
    expect(operation?.responses).toHaveProperty('200');
    expect(operation?.responses).toHaveProperty('404');
  });

  it('publishes effective status, timezone, search, and pagination filters', () => {
    const operation = document.paths['/api/v1/organizations-admin']?.get;
    const parameters = operation?.parameters ?? [];
    const names = parameters.map((parameter) =>
      '$ref' in parameter ? parameter.$ref : parameter.name,
    );

    expect(names).toEqual(
      expect.arrayContaining([
        'search',
        'status',
        'planType',
        'subscriptionStatus',
        'subscriptionDisplayStatus',
        'billingInterval',
        'timezone',
        'page',
        'limit',
      ]),
    );
  });

  it('publishes the complete organization detail response', () => {
    const operation = document.paths['/api/v1/organizations-admin/{id}']?.get;
    const response = operation?.responses?.['200'];

    expect(operation?.summary).toBe('Get one organization management view');
    expect(response).toBeDefined();
    expect(
      document.components?.schemas?.AdminOrganizationDetailResponse,
    ).toEqual(
      expect.objectContaining({
        properties: expect.objectContaining({
          organization: expect.any(Object),
          subscription: expect.any(Object),
          metrics: expect.any(Object),
          connectedTools: expect.any(Object),
          operation: expect.any(Object),
        }),
      }),
    );
  });

  it('documents status mutation payload, concurrency, and authorization', () => {
    const operation =
      document.paths['/api/v1/organizations-admin/{id}/status']?.patch;

    expect(operation?.requestBody).toBeDefined();
    expect(operation?.responses).toEqual(
      expect.objectContaining({
        200: expect.any(Object),
        403: expect.any(Object),
        404: expect.any(Object),
        409: expect.any(Object),
      }),
    );
    expect(operation?.security).toEqual([{ bearer: [] }]);
  });

  it('documents plan mutation failures and reconciliation response', () => {
    const operation =
      document.paths['/api/v1/organizations-admin/{id}/subscription']?.patch;

    expect(operation?.requestBody).toBeDefined();
    expect(operation?.responses).toEqual(
      expect.objectContaining({
        200: expect.any(Object),
        400: expect.any(Object),
        403: expect.any(Object),
        404: expect.any(Object),
        409: expect.any(Object),
        503: expect.any(Object),
      }),
    );
    expect(operation?.security).toEqual([{ bearer: [] }]);
  });
});
