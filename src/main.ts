import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { urlencoded } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

type SwaggerResponse = {
  url?: string;
  status?: number;
  body?: unknown;
  data?: unknown;
  obj?: unknown;
};

async function bootstrap() {
  // rawBody is required by StripeSignatureGuard — Stripe signs the exact
  // request bytes, so the parsed/re-serialized JSON body can't be used.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });
  app.enableShutdownHooks();
  const config = app.get(ConfigService);

  app.use(helmet());
  app.enableCors({
    origin: config.getOrThrow<string[]>('cors.origins'),
    credentials: true,
  });

  // Twilio webhooks send `application/x-www-form-urlencoded` — parse it so
  // TwilioSignatureGuard can rebuild the exact signature and TwilioService
  // receives the form fields in @Body(). This must be registered before the
  // global prefix is set so the path matches /api/v1/webhooks/twilio/*.
  app.use(
    '/api/v1/webhooks/twilio',
    urlencoded({ extended: false, limit: '1mb' }),
  );

  app.setGlobalPrefix(config.get<string>('API_PREFIX', 'api/v1'));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Noltra API')
    .setDescription('Noltra AI backend API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      responseInterceptor: (response: SwaggerResponse) => {
        const toRecord = (
          value: unknown,
        ): Record<string, unknown> | undefined => {
          if (typeof value === 'string') {
            try {
              value = JSON.parse(value) as unknown;
            } catch {
              return undefined;
            }
          }

          return value !== null && typeof value === 'object'
            ? (value as Record<string, unknown>)
            : undefined;
        };
        const swaggerUi = (
          globalThis as unknown as {
            ui?: {
              preauthorizeApiKey: (scheme: string, token: string) => void;
              authActions: { logout: (schemes: string[]) => void };
            };
          }
        ).ui;
        const status = response.status ?? 0;
        const pathname = response.url
          ? new URL(response.url, globalThis.location.origin).pathname
          : '';

        if (status >= 200 && status < 300) {
          if (
            pathname.endsWith('/auth/login') ||
            pathname.endsWith('/auth/refresh')
          ) {
            const payload =
              toRecord(response.obj) ??
              toRecord(response.body) ??
              toRecord(response.data);
            const data = toRecord(payload?.data) ?? payload;
            const accessToken = data?.accessToken;

            if (typeof accessToken === 'string') {
              swaggerUi?.preauthorizeApiKey('bearer', accessToken);
            }
          } else if (
            pathname.endsWith('/auth/logout') ||
            pathname.endsWith('/auth/logout-all')
          ) {
            swaggerUi?.authActions.logout(['bearer']);
            globalThis.localStorage.removeItem('authorized');
          }
        }

        return response;
      },
    },
  });

  const port = config.get<number>('PORT', 5001);
  await app.listen(port, '0.0.0.0');
  console.log(`Noltra API running on http://localhost:${port}`);
}

bootstrap();
