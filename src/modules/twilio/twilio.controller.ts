import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { TwilioService } from './twilio.service';
import { TwilioVoiceWebhookDto } from './dto/twilio-voice-webhook.dto';
import { TwilioSignatureGuard } from './guards/twilio-signature.guard';

type TwilioWebhookRequest = {
  body: Record<string, string | undefined>;
};

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

  /**
   * Twilio fetches this endpoint after the agent (first leg) answers an
   * outbound click-to-call. The returned TwiML dials the client (second
   * leg) and bridges the two parties.
   *
   * - `CallSid` arrives in the request **body** (form field) on real calls;
   *   the query param is only used for our mock test helper.
   * - `clientPhone` is passed as a query param when the call was initiated.
   */
  @Post('outbound-connect')
  @HttpCode(HttpStatus.OK)
  handleOutboundConnect(
    @Req() request: TwilioWebhookRequest,
    @Query('callSid') queryCallSid: string | undefined,
    @Query('clientPhone') clientPhone: string | undefined,
    @Res() response: Response,
  ): Promise<void> {
    const callSid = queryCallSid || request.body.CallSid;

    if (!callSid) {
      throw new BadRequestException('Missing callSid (body field or query)');
    }
    if (!clientPhone) {
      throw new BadRequestException('Missing query param: clientPhone');
    }

    return this.twilioService
      .handleOutboundConnect({
        callSid,
        clientPhone,
        fromNumber: request.body.From || '',
      })
      .then((twiml) => {
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
