import { AUDIT_ACTION } from '../../common/constants/audit-action.constants';
import { UserRole } from '../../common/enums/user-role.enum';
import { RoiDashboardController } from './roi-dashboard.controller';

describe('RoiDashboardController report audit', () => {
  const organization = { id: 'organization-1' };
  const user = {
    id: 'user-1',
    email: 'owner@example.com',
    firstName: 'Amina',
    lastName: 'Rahman',
    organizationId: organization.id,
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: false,
  };
  const snapshot = {
    asOf: '2026-11-14T05:00:00.000Z',
    timezone: 'Asia/Dhaka',
    range: {
      start: '2026-11-01T00:00:00.000Z',
      end: '2026-11-15T00:00:00.000Z',
      days: 14,
    },
    configuration: { methodologyVersion: '1.0' },
  };

  it('persists a measured report-generation event before sending the PDF', async () => {
    const report = Buffer.from('%PDF-test');
    const dashboard = { dashboard: jest.fn().mockResolvedValue(snapshot) };
    const reports = { create: jest.fn().mockResolvedValue(report) };
    const audits = { create: jest.fn().mockResolvedValue({}) };
    const response = responseMock();
    const controller = new RoiDashboardController(
      dashboard as never,
      {} as never,
      reports as never,
      audits as never,
    );

    await controller.report(
      organization,
      user,
      {} as never,
      response.value as never,
    );

    expect(audits.create).toHaveBeenCalledWith({
      organizationId: organization.id,
      userId: user.id,
      action: AUDIT_ACTION.ROI_REPORT_GENERATED,
      resourceType: 'ROI_REPORT',
      metadata: {
        format: 'PDF',
        rangeStart: snapshot.range.start,
        rangeEnd: snapshot.range.end,
        rangeDays: snapshot.range.days,
        timezone: snapshot.timezone,
        methodologyVersion: snapshot.configuration.methodologyVersion,
        generatedAt: snapshot.asOf,
        sizeBytes: report.length,
      },
    });
    expect(audits.create.mock.invocationCallOrder[0]).toBeLessThan(
      response.end.mock.invocationCallOrder[0],
    );
    expect(response.end).toHaveBeenCalledWith(report);
  });

  it('does not deliver an untracked report when audit persistence fails', async () => {
    const dashboard = { dashboard: jest.fn().mockResolvedValue(snapshot) };
    const reports = {
      create: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
    };
    const audits = {
      create: jest.fn().mockRejectedValue(new Error('audit unavailable')),
    };
    const response = responseMock();
    const controller = new RoiDashboardController(
      dashboard as never,
      {} as never,
      reports as never,
      audits as never,
    );

    await expect(
      controller.report(
        organization,
        user,
        {} as never,
        response.value as never,
      ),
    ).rejects.toThrow('audit unavailable');
    expect(response.end).not.toHaveBeenCalled();
  });
});

function responseMock() {
  const status = jest.fn();
  const setHeader = jest.fn();
  const end = jest.fn();
  return {
    value: { status, setHeader, end },
    status,
    setHeader,
    end,
  };
}
