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
  SwaggerModule.setup('api/docs', app, document);

  const port = config.get<number>('PORT', 5001);
  await app.listen(port, '0.0.0.0');
  console.log(`Noltra API running on http://localhost:${port}`);
}

bootstrap();
