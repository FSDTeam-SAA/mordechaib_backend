import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import crypto from 'crypto';

@Injectable()
export class AiServiceSecretGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext) {
    const expected = this.config.get<string>('aiService.sharedSecret');
    if (!expected) {
      throw new ServiceUnavailableException(
        'AI service shared secret is not configured',
      );
    }

    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers['x-ai-actions-secret'];
    const provided = Array.isArray(header) ? header[0] : header;
    if (!provided || !this.matches(provided, expected)) {
      throw new UnauthorizedException('Invalid AI service credentials');
    }
    return true;
  }

  private matches(provided: string, expected: string) {
    const providedBuffer = Buffer.from(provided);
    const expectedBuffer = Buffer.from(expected);
    return (
      providedBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(providedBuffer, expectedBuffer)
    );
  }
}
