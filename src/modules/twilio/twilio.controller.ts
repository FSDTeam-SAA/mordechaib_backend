import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { TwilioService } from './twilio.service';
import { TwilioVoiceWebhookDto } from './dto/twilio-voice-webhook.dto';
import { TwilioSignatureGuard } from './guards/twilio-signature.guard';

@Public()
@SkipThrottle()
@Controller('webhooks/twilio')
@UseGuards(TwilioSignatureGuard)
export class TwilioController {
  constructor(private readonly twilioService: TwilioService) {}

  @Post('voice')
  @HttpCode(HttpStatus.OK)
  handleIncomingCall(
    @Body() body: TwilioVoiceWebhookDto,
    @Res() response: Response,
  ): Promise<void> {
    return this.twilioService.handleIncomingCall(body).then((twiml) => {
      response.type('text/xml').send(twiml);
    });
  }

  @Post('recording')
  @HttpCode(HttpStatus.OK)
  handleRecording(
    @Query('callSid') primaryCallSid: string | undefined,
    @Body() body: Record<string, string | undefined>,
  ) {
    return this.twilioService.handleRecordingCallback(primaryCallSid, body);
  }

  @Post('dial-status')
  @HttpCode(HttpStatus.OK)
  handleDialStatus(
    @Query('callSid') primaryCallSid: string | undefined,
    @Body() body: Record<string, string | undefined>,
  ) {
    return this.twilioService.handleDialStatusCallback(primaryCallSid, body);
  }

  @Post('call-status')
  @HttpCode(HttpStatus.OK)
  handleCallStatus(@Body() body: Record<string, string | undefined>) {
    return this.twilioService.handleCallStatusCallback(body);
  }
}
