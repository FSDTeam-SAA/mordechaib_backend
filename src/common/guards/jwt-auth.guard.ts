import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) return true;

    // Swagger and some clients may serialize the token with surrounding
    // quotes. Normalize only those boundary quotes; Passport still performs
    // the complete JWT signature, expiration, and session validation.
    const request = context.switchToHttp().getRequest<{
      headers: { authorization?: string };
    }>();
    const authorization = request.headers.authorization;
    if (authorization) {
      const match = authorization.match(/^Bearer\s+(.+)$/i);
      if (match) {
        const token = match[1].replace(/^["']|["']$/g, '');
        request.headers.authorization = `Bearer ${token}`;
      }
    }

    return super.canActivate(context);
  }
}
