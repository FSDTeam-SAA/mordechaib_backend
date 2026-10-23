import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { REDIRECT_METADATA } from '@nestjs/common/constants';
import { map, Observable } from 'rxjs';
import { RAW_RESPONSE_METADATA } from '../decorators/raw-response.decorator';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const redirectMetadata = Reflect.getMetadata(
      REDIRECT_METADATA,
      context.getHandler(),
    ) as unknown;
    if (redirectMetadata !== undefined) {
      return next.handle();
    }
    const rawResponse = Reflect.getMetadata(
      RAW_RESPONSE_METADATA,
      context.getHandler(),
    ) as boolean | undefined;
    if (rawResponse) return next.handle();

    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
      })),
    );
  }
}
