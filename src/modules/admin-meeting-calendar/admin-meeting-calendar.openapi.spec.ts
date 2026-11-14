import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import { AdminMeetingCalendarActionsService } from './admin-meeting-calendar-actions.service';
import { AdminMeetingCalendarQuickActionsService } from './admin-meeting-calendar-quick-actions.service';
import { AdminMeetingCalendarController } from './admin-meeting-calendar.controller';
import { AdminMeetingCalendarService } from './admin-meeting-calendar.service';

describe('Admin Meeting Calendar OpenAPI contract', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminMeetingCalendarController],
      providers: [
        PlatformAdminGuard,
        {
          provide: AdminMeetingCalendarService,
          useValue: { dashboard: jest.fn() },
        },
        {
          provide: AdminMeetingCalendarActionsService,
          useValue: {
            complete: jest.fn(),
            cancel: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: AdminMeetingCalendarQuickActionsService,
          useValue: { schedule: jest.fn(), sync: jest.fn() },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    await app.init();

    document = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle('Admin Meeting Calendar').build(),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  it('publishes every Phase 1-5 route under the platform-admin base path', () => {
    expect(document.paths).toEqual(
      expect.objectContaining({
        '/api/v1/platform/meeting-calendar': expect.objectContaining({
          get: expect.any(Object),
        }),
        '/api/v1/platform/meeting-calendar/meetings': expect.objectContaining({
          post: expect.any(Object),
        }),
        '/api/v1/platform/meeting-calendar/sync': expect.objectContaining({
          post: expect.any(Object),
        }),
        '/api/v1/platform/meeting-calendar/{sourceType}/{id}/complete':
          expect.objectContaining({ post: expect.any(Object) }),
        '/api/v1/platform/meeting-calendar/{sourceType}/{id}/cancel':
          expect.objectContaining({ post: expect.any(Object) }),
        '/api/v1/platform/meeting-calendar/{sourceType}/{id}':
          expect.objectContaining({ delete: expect.any(Object) }),
      }),
    );
  });

  it('documents stable success status codes for commands', () => {
    expect(
      document.paths['/api/v1/platform/meeting-calendar/meetings']?.post
        ?.responses,
    ).toHaveProperty('201');
    expect(
      document.paths['/api/v1/platform/meeting-calendar/sync']?.post?.responses,
    ).toHaveProperty('200');
    expect(
      document.paths[
        '/api/v1/platform/meeting-calendar/{sourceType}/{id}/complete'
      ]?.post?.responses,
    ).toHaveProperty('200');
    expect(
      document.paths[
        '/api/v1/platform/meeting-calendar/{sourceType}/{id}/cancel'
      ]?.post?.responses,
    ).toHaveProperty('200');
    expect(
      document.paths['/api/v1/platform/meeting-calendar/{sourceType}/{id}']
        ?.delete?.responses,
    ).toHaveProperty('200');
  });

  it('documents authentication failures and operation conflicts', () => {
    const schedule =
      document.paths['/api/v1/platform/meeting-calendar/meetings']?.post;
    const cancel =
      document.paths[
        '/api/v1/platform/meeting-calendar/{sourceType}/{id}/cancel'
      ]?.post;

    expect(schedule?.responses).toEqual(
      expect.objectContaining({
        '400': expect.any(Object),
        '401': expect.any(Object),
        '403': expect.any(Object),
        '404': expect.any(Object),
        '409': expect.any(Object),
        '503': expect.any(Object),
      }),
    );
    expect(cancel?.responses).toEqual(
      expect.objectContaining({
        '401': expect.any(Object),
        '403': expect.any(Object),
        '404': expect.any(Object),
        '409': expect.any(Object),
        '503': expect.any(Object),
      }),
    );
  });
});
