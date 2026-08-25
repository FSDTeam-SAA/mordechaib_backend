import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { RecallSignatureService } from '../recall-signature.service';

type RecallRequest = {
  method: string;
  rawBody?: Buffer;
  headers: Record<string, string | string[] | undefined>;
  recallMessageId?: string;
};

@Injectable()
export class RecallSignatureGuard implements CanActivate {
  constructor(private readonly signatures: RecallSignatureService) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RecallRequest>();
    const verified = this.signatures.verify(
      request.headers,
      request.method === 'GET' ? null : request.rawBody || null,
    );
    request.recallMessageId = verified.messageId;
    return true;
  }
}
