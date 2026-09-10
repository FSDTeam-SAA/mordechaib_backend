import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { readFile } from 'fs/promises';
import { isValidObjectId, Model } from 'mongoose';
import path from 'path';
import { CallRecording } from '../../database/schemas/call-recording.schema';

@Injectable()
export class CallTranscriptionService {
  constructor(
    @InjectModel(CallRecording.name)
    private readonly recordings: Model<CallRecording>,
    private readonly config: ConfigService,
  ) {}

  get enabled() {
    return this.config.get<boolean>(
      'aiService.callTranscription.enabled',
      false,
    );
  }

  async transcribe(recordingId: string) {
    if (!isValidObjectId(recordingId)) {
      throw new BadRequestException('Invalid call recording id');
    }
    const recording = await this.recordings.findById(recordingId).lean().exec();
    if (!recording) throw new NotFoundException('Call recording not found');
    if (recording.aiStatus === 'COMPLETED' && recording.transcriptText) {
      return { organizationId: recording.organizationId, duplicate: true };
    }
    if (!recording.localFilePath) {
      await this.markFailed(
        recordingId,
        'Local recording audio is unavailable',
      );
      throw new ServiceUnavailableException(
        'Local recording audio is unavailable',
      );
    }

    const claimed = await this.recordings
      .findOneAndUpdate(
        { _id: recordingId, aiStatus: { $in: ['PENDING', 'FAILED'] } },
        { $set: { aiStatus: 'PROCESSING', summary: undefined } },
        { new: true },
      )
      .lean()
      .exec();
    if (!claimed) {
      return { organizationId: recording.organizationId, duplicate: true };
    }

    try {
      const transcriptText = await this.requestTranscript(
        claimed.localFilePath as string,
      );
      if (!transcriptText) {
        throw new BadRequestException(
          'The transcription provider returned no text',
        );
      }
      await this.recordings.updateOne(
        { _id: recordingId },
        {
          $set: {
            aiStatus: 'COMPLETED',
            transcriptText,
            summary: undefined,
          },
        },
      );
      return { organizationId: claimed.organizationId, duplicate: false };
    } catch (error) {
      await this.markFailed(
        recordingId,
        error instanceof Error ? error.message : 'Call transcription failed',
      );
      throw error;
    }
  }

  private async requestTranscript(filePath: string) {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException(
        'OpenAI transcription is not configured',
      );
    }
    const audio = await readFile(filePath);
    const maxBytes = this.config.get<number>(
      'aiService.callTranscription.maxBytes',
      25 * 1024 * 1024,
    );
    if (audio.byteLength > maxBytes) {
      throw new BadRequestException(
        `Recording exceeds the ${maxBytes}-byte transcription limit`,
      );
    }

    const form = new FormData();
    form.append(
      'file',
      new Blob([audio], { type: this.mimeType(filePath) }),
      path.basename(filePath),
    );
    form.append(
      'model',
      this.config.get<string>('aiService.callTranscription.model', 'whisper-1'),
    );
    form.append('response_format', 'json');
    const response = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(
          this.config.get<number>('aiService.timeoutMs', 30_000),
        ),
      },
    );
    const body = await response.text();
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Transcription provider failed with ${response.status}: ${body.slice(0, 1000)}`,
      );
    }
    try {
      const parsed = JSON.parse(body) as { text?: unknown };
      return typeof parsed.text === 'string' ? parsed.text.trim() : '';
    } catch {
      throw new ServiceUnavailableException(
        'Transcription provider returned invalid JSON',
      );
    }
  }

  private markFailed(recordingId: string, reason: string) {
    return this.recordings.updateOne(
      { _id: recordingId },
      {
        $set: {
          aiStatus: 'FAILED',
          summary: reason.slice(0, 2000),
        },
      },
    );
  }

  private mimeType(filePath: string) {
    switch (path.extname(filePath).toLowerCase()) {
      case '.mp3':
        return 'audio/mpeg';
      case '.m4a':
        return 'audio/mp4';
      case '.ogg':
        return 'audio/ogg';
      default:
        return 'audio/wav';
    }
  }
}
