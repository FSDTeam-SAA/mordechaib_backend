import { ConfigService } from '@nestjs/config';
import { MetaProvider } from './meta.provider';

const originalFetch = global.fetch;

describe('MetaProvider date filtering', () => {
  let provider: MetaProvider;
  let fetchMock: jest.MockedFunction<typeof fetch>;

  beforeEach(() => {
    const config = {
      get: jest.fn((key: string, fallback?: string) =>
        key === 'meta.graphApiVersion' ? 'v23.0' : fallback,
      ),
    } as unknown as ConfigService;

    provider = new MetaProvider(config);
    fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ data: [] }),
    } as unknown as Response);
    global.fetch = fetchMock;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it.each([
    {
      call: (subject: MetaProvider) =>
        subject.getPagePosts('page-1', 'token', {
          limit: 10,
          since: 100,
          until: 200,
        }),
      path: '/page-1/posts',
    },
    {
      call: (subject: MetaProvider) =>
        subject.getPostComments('post-1', 'token', {
          limit: 10,
          since: 100,
          until: 200,
        }),
      path: '/post-1/comments',
    },
    {
      call: (subject: MetaProvider) =>
        subject.getPageInsights('page-1', 'token', {
          metrics: ['page_post_engagements'],
          period: 'day',
          since: 100,
          until: 200,
        }),
      path: '/page-1/insights',
    },
  ])('forwards since and until to $path', async ({ call, path }) => {
    await call(provider);

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.pathname).toBe(`/v23.0${path}`);
    expect(requestUrl.searchParams.get('since')).toBe('100');
    expect(requestUrl.searchParams.get('until')).toBe('200');
  });

  it('applies the time range to nested messages as well as conversations', async () => {
    await provider.getPageMessages('page-1', 'token', {
      since: 100,
      until: 200,
    });

    const requestUrl = new URL(fetchMock.mock.calls[0][0] as string);
    expect(requestUrl.searchParams.has('since')).toBe(false);
    expect(requestUrl.searchParams.has('until')).toBe(false);
    expect(requestUrl.searchParams.get('fields')).toContain(
      'messages.limit(25).since(100).until(200)',
    );
  });
});
