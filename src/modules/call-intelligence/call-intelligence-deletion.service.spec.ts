import { ConflictException } from '@nestjs/common';
import { MeetingBotStatus } from '../../common/enums/meeting-bot-status.enum';
import { AiProposalSourceType } from '../../database/schemas/ai-action-proposal.schema';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { RecordingStorageService } from '../twilio/providers/recording-storage.service';
import { CallIntelligenceDeletionService } from './call-intelligence-deletion.service';

const queryResult = (value: unknown) => ({
  select: jest.fn().mockReturnThis(),
  lean: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue(value),
});

const execResult = (value: unknown) => ({
  exec: jest.fn().mockResolvedValue(value),
});

describe('CallIntelligenceDeletionService', () => {
  const organizationId = '66cc9bdfa847ea856c7b41d1';
  const sourceId = '66cc9bdfa847ea856c7b41d2';
  const actorUserId = '66cc9bdfa847ea856c7b41d3';

  it('deletes a completed call and its intelligence artifacts', async () => {
    const callRecordings = {
      findOne: jest.fn().mockReturnValue(
        queryResult({
          _id: sourceId,
          callSid: 'CA123',
          aiStatus: 'COMPLETED',
          localFilePath: 'storage/recordings/CA123/RE123.wav',
        }),
      ),
      deleteOne: jest.fn().mockReturnValue(execResult({ deletedCount: 1 })),
      countDocuments: jest.fn().mockReturnValue(execResult(0)),
    };
    const callLogs = {
      deleteOne: jest.fn().mockReturnValue(execResult({ deletedCount: 1 })),
    };
    const proposals = {
      exists: jest.fn().mockReturnValue(execResult(null)),
      find: jest.fn().mockReturnValue(queryResult([])),
      deleteMany: jest.fn().mockReturnValue(execResult({ deletedCount: 2 })),
    };
    const analyses = {
      deleteMany: jest.fn().mockReturnValue(execResult({ deletedCount: 1 })),
    };
    const storage = { deleteRecording: jest.fn().mockResolvedValue(undefined) };
    const auditLogs = { create: jest.fn().mockResolvedValue(undefined) };
    const service = new CallIntelligenceDeletionService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      callRecordings as never,
      callLogs as never,
      {} as never,
      {} as never,
      proposals as never,
      analyses as never,
      storage as unknown as RecordingStorageService,
      auditLogs as unknown as AuditLogsService,
    );

    const result = await service.delete(
      organizationId,
      actorUserId,
      sourceId,
      AiProposalSourceType.CALL_TRANSCRIPT,
    );

    expect(storage.deleteRecording).toHaveBeenCalledWith(
      'storage/recordings/CA123/RE123.wav',
    );
    expect(result).toEqual({
      source: { type: AiProposalSourceType.CALL_TRANSCRIPT, id: sourceId },
      deleted: true,
      deletedResources: {
        sourceRecords: 1,
        callLogs: 1,
        transcripts: 0,
        proposals: 2,
        analyses: 1,
      },
      retainedBusinessResources: { tasks: 0, meetings: 0 },
    });
    expect(auditLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId,
        userId: actorUserId,
        resourceId: sourceId,
      }),
    );
  });

  it('does not delete an active meeting bot', async () => {
    const meetingBots = {
      findOne: jest.fn().mockReturnValue(
        queryResult({
          _id: sourceId,
          status: MeetingBotStatus.IN_CALL,
          platform: 'GOOGLE_MEET',
        }),
      ),
    };
    const service = new CallIntelligenceDeletionService(
      meetingBots as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(
      service.delete(
        organizationId,
        actorUserId,
        sourceId,
        AiProposalSourceType.GOOGLE_MEET,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
