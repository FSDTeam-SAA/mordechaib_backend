import { AUDIT_ACTION } from '../../common/constants/audit-action.constants';
import { UserRole } from '../../common/enums/user-role.enum';
import { RevenueAnalyticsController } from './revenue-analytics.controller';

describe('RevenueAnalyticsController', () => {
  const user = {
    id: 'platform-admin-1',
    email: 'admin@noltra.ai',
    firstName: 'Platform',
    lastName: 'Admin',
    organizationId: 'platform-organization-1',
    role: UserRole.OWNER,
    sessionId: 'session-1',
    isPlatformAdmin: true,
  };
  const query = {
    from: new Date('2026-11-01T00:00:00.000Z'),
    to: new Date('2026-12-01T00:00:00.000Z'),
    timezone: 'Asia/Dhaka',
  };
  const retention = {
    from: '2026-11-01T00:00:00.000Z',
    to: '2026-12-01T00:00:00.000Z',
    timezone: query.timezone,
    methodologyVersion: '1.0',
  };
  const unitEconomics = { generatedAt: '2026-12-01T00:00:01.000Z' };
  const generatedReport = {
    buffer: Buffer.from('%PDF-test'),
    filename: 'noltra-revenue-analytics-2026-11-01-to-2026-12-01.pdf',
    generatedAt: '2026-12-01T00:00:02.000Z',
    hasEstimatedData: true,
  };

  it('uses the shared analytics services and audits before delivering the PDF', async () => {
    const retentionService = {
      getRetention: jest.fn().mockResolvedValue(retention),
    };
    const unitEconomicsService = {
      getUnitEconomics: jest.fn().mockResolvedValue(unitEconomics),
    };
    const reports = { create: jest.fn().mockResolvedValue(generatedReport) };
    const audits = { create: jest.fn().mockResolvedValue({}) };
    const response = responseMock();
    const controller = new RevenueAnalyticsController(
      {} as never,
      retentionService as never,
      unitEconomicsService as never,
      reports as never,
      audits as never,
    );

    await controller.report(user, query, response.value as never);

    expect(retentionService.getRetention).toHaveBeenCalledWith(query);
    expect(unitEconomicsService.getUnitEconomics).toHaveBeenCalledWith(query);
    expect(reports.create).toHaveBeenCalledWith(retention, unitEconomics);
    expect(audits.create).toHaveBeenCalledWith({
      organizationId: user.organizationId,
      userId: user.id,
      action: AUDIT_ACTION.REVENUE_ANALYTICS_REPORT_GENERATED,
      resourceType: 'REVENUE_ANALYTICS_REPORT',
      metadata: {
        format: 'PDF',
        from: retention.from,
        to: retention.to,
        timezone: retention.timezone,
        methodologyVersion: retention.methodologyVersion,
        hasEstimatedData: generatedReport.hasEstimatedData,
        generatedAt: generatedReport.generatedAt,
        sizeBytes: generatedReport.buffer.length,
      },
    });
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/pdf',
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      `attachment; filename="${generatedReport.filename}"`,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
    expect(audits.create.mock.invocationCallOrder[0]).toBeLessThan(
      response.end.mock.invocationCallOrder[0],
    );
    expect(response.end).toHaveBeenCalledWith(generatedReport.buffer);
  });

  it('does not send the report if audit persistence fails', async () => {
    const reports = { create: jest.fn().mockResolvedValue(generatedReport) };
    const audits = {
      create: jest.fn().mockRejectedValue(new Error('audit unavailable')),
    };
    const response = responseMock();
    const controller = new RevenueAnalyticsController(
      {} as never,
      { getRetention: jest.fn().mockResolvedValue(retention) } as never,
      {
        getUnitEconomics: jest.fn().mockResolvedValue(unitEconomics),
      } as never,
      reports as never,
      audits as never,
    );

    await expect(
      controller.report(user, query, response.value as never),
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
