import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { unlink } from 'fs/promises';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';

@Injectable()
export class TemporaryUploadCleanupInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      files?: Express.Multer.File[];
    }>();
    return next.handle().pipe(
      finalize(() => {
        void Promise.allSettled(
          (request.files ?? [])
            .filter((file) => Boolean(file.path))
            .map((file) => unlink(file.path)),
        );
      }),
    );
  }
}
