import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { TwilioService } from './twilio.service';
import { TwilioVoiceWebhookDto } from './dto/twilio-voice-webhook.dto';

@Public()
@SkipThrottle()
@Controller('webhooks/twilio')
export class TwilioController {
  constructor(private readonly twilioService: TwilioService) {}

  @Post('voice')
  @HttpCode(HttpStatus.OK)
  handleIncomingCall(
    @Body() body: TwilioVoiceWebhookDto,
    @Res() response: Response,
  ): void {
    response.type('text/xml').send(this.twilioService.handleIncomingCall(body));
  }

  @Post('recording')
  handleRecording(@Body() body: Record<string, unknown>) {
    return this.twilioService.handleRecordingCallback(body);
  }

  @Post('call-status')
  handleCallStatus(@Body() body: Record<string, unknown>) {
    return this.twilioService.handleCallStatusCallback(body);
  }
}
