import { Controller, Get, Headers, Param, Res } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { CallAudioPlaybackTokenService } from './call-audio-playback-token.service';
import { CallAudioStreamingService } from './call-audio-streaming.service';
import { CallIntelligenceService } from './call-intelligence.service';

@ApiTags('Call Intelligence')
@Controller('call-intelligence/audio')
export class CallIntelligenceAudioPlaybackController {
  constructor(
    private readonly intelligence: CallIntelligenceService,
    private readonly playbackTokens: CallAudioPlaybackTokenService,
    private readonly audioStreaming: CallAudioStreamingService,
  ) {}

  @Get('playback/:token')
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Play call audio using a short-lived signed capability',
    description:
      'Used by browser audio elements. Obtain the temporary URL from POST /call-intelligence/{sourceId}/audio/playback.',
  })
  @ApiProduces(
    'audio/wav',
    'audio/mpeg',
    'audio/mp4',
    'audio/ogg',
    'audio/webm',
  )
  @ApiOkResponse({
    description: 'Complete audio stream',
    schema: { type: 'string', format: 'binary' },
  })
  @ApiResponse({
    status: 206,
    description: 'Partial audio stream for a byte-range request',
    schema: { type: 'string', format: 'binary' },
  })
  async playback(
    @Param('token') token: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res() response: Response,
  ) {
    const capability = this.playbackTokens.verify(token);
    const audio = await this.intelligence.getCallAudio(
      capability.organizationId,
      capability.sourceId,
      capability.sourceType,
    );
    await this.audioStreaming.stream(audio, rangeHeader, response);
  }
}
