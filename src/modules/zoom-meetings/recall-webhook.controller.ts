import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { RecallSignatureGuard } from './guards/recall-signature.guard';
import { RecallWebhookPayload } from './providers/recall-zoom.provider';
import { ZoomMeetingsQueue } from './zoom-meetings.queue';
import { ZoomMeetingsService } from './zoom-meetings.service';

type VerifiedRecallRequest = { recallMessageId: string };

@Public()
@SkipThrottle()
@Controller('webhooks/recall')
@UseGuards(RecallSignatureGuard)
export class RecallWebhookController {
  constructor(
    private readonly queue: ZoomMeetingsQueue,
    private readonly meetings: ZoomMeetingsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  async receive(
    @Req() request: VerifiedRecallRequest,
    @Body() payload: RecallWebhookPayload,
  ) {
    await this.queue.enqueueWebhook(request.recallMessageId, payload);
    return { accepted: true };
  }

  @Get('zoom-zak')
  async zoomZak(@Res() response: Response) {
    const token = await this.meetings.getZakToken();
    response.status(HttpStatus.OK).type('text/plain').send(token);
  }
}
