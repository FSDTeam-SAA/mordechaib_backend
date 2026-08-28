import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
};

type MetaListResponse<T> = {
  data: T[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
};

type MetaTimeRangeOptions = {
  since?: number;
  until?: number;
};

type MetaListOptions = MetaTimeRangeOptions & {
  limit?: number;
};

type MetaInsightsOptions = MetaTimeRangeOptions & {
  metrics?: string[];
  period?: string;
};

export type MetaPagePost = {
  id: string;
  message?: string;
  story?: string;
  created_time?: string;
  updated_time?: string;
  permalink_url?: string;
  attachments?: Record<string, unknown>;
  comments?: MetaListResponse<Record<string, unknown>>;
};

export type MetaPageComment = {
  id: string;
  message?: string;
  created_time?: string;
  like_count?: number;
  from?: Record<string, unknown>;
  parent?: Record<string, unknown>;
};

export type MetaPageConversation = {
  id: string;
  updated_time?: string;
  unread_count?: number;
  can_reply?: boolean;
  message_count?: number;
  participants?: MetaListResponse<Record<string, unknown>>;
  messages?: MetaListResponse<Record<string, unknown>>;
};

export type MetaPageInsight = {
  name: string;
  period?: string;
  values?: Array<{
    value?: number | Record<string, unknown>;
    end_time?: string;
  }>;
  title?: string;
  description?: string;
};

@Injectable()
export class MetaProvider {
  private readonly appId: string | undefined;
  private readonly appSecret: string | undefined;
  private readonly graphBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.appId = config.get<string>('meta.appId');
    this.appSecret = config.get<string>('meta.appSecret');
    this.graphBaseUrl = `https://graph.facebook.com/${config.get<string>('meta.graphApiVersion', 'v23.0')}`;
  }

  getAuthorizationUrl(state: string): string {
    if (!this.appId)
      throw new ServiceUnavailableException('Meta is not configured');
    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.config.getOrThrow<string>('meta.oauthRedirectUri'),
      state,
      response_type: 'code',
      scope: [
        'public_profile',
        'pages_show_list',
        'pages_read_engagement',
        // 'pages_read_user_content',
        'pages_manage_metadata',
        // 'pages_messaging',
        // 'read_insights',
        'business_management',
      ].join(','),
    });
    return `https://www.facebook.com/${this.config.get<string>('meta.graphApiVersion', 'v23.0')}/dialog/oauth?${params}`;
  }

  async exchangeCode(code: string): Promise<MetaTokenResponse> {
    if (!this.appId || !this.appSecret) {
      throw new ServiceUnavailableException(
        'Meta credentials are not configured',
      );
    }
    return this.request<MetaTokenResponse>('/oauth/access_token', {
      client_id: this.appId,
      client_secret: this.appSecret,
      redirect_uri: this.config.getOrThrow<string>('meta.oauthRedirectUri'),
      code,
    });
  }

  async exchangeLongLivedToken(token: string): Promise<MetaTokenResponse> {
    return this.request<MetaTokenResponse>('/oauth/access_token', {
      client_id: this.appId,
      client_secret: this.appSecret,
      grant_type: 'fb_exchange_token',
      fb_exchange_token: token,
    });
  }

  getPages(token: string) {
    return this.request<{ data: Array<Record<string, unknown>> }>(
      '/me/accounts',
      {
        fields:
          'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}',
        access_token: token,
      },
    );
  }

  getPagePosts(
    pageId: string,
    token: string,
    options: MetaListOptions = {},
  ) {
    const { limit = 25, since, until } = options;
    return this.request<MetaListResponse<MetaPagePost>>(
      `/${encodeURIComponent(pageId)}/posts`,
      {
        fields:
          'id,message,story,created_time,updated_time,permalink_url,attachments{media_type,url,title,description,subattachments},comments.limit(25){id,message,created_time,from,like_count}',
        limit,
        since,
        until,
        access_token: token,
      },
    );
  }

  getPostComments(
    postId: string,
    token: string,
    options: MetaListOptions = {},
  ) {
    const { limit = 25, since, until } = options;
    return this.request<MetaListResponse<MetaPageComment>>(
      `/${encodeURIComponent(postId)}/comments`,
      {
        fields: 'id,message,created_time,like_count,from,parent',
        limit,
        since,
        until,
        access_token: token,
      },
    );
  }

  getPageMessages(
    pageId: string,
    token: string,
    options: MetaListOptions = {},
  ) {
    const { limit = 25, since, until } = options;
    const messagesField = this.createTimeFilteredEdge(
      'messages',
      25,
      since,
      until,
      'id,message,created_time,from,attachments',
    );
    return this.request<MetaListResponse<MetaPageConversation>>(
      `/${encodeURIComponent(pageId)}/conversations`,
      {
        fields: `id,updated_time,unread_count,can_reply,message_count,participants.limit(50){id,name,username},${messagesField}`,
        limit,
        access_token: token,
      },
    );
  }

  private createTimeFilteredEdge(
    edge: string,
    limit: number,
    since: number | undefined,
    until: number | undefined,
    fields: string,
  ): string {
    const modifiers = [
      `limit(${limit})`,
      since === undefined ? undefined : `since(${since})`,
      until === undefined ? undefined : `until(${until})`,
    ].filter((modifier): modifier is string => Boolean(modifier));

    return `${edge}.${modifiers.join('.')}{${fields}}`;
  }

  getPageInsights(
    pageId: string,
    token: string,
    options: MetaInsightsOptions = {},
  ) {
    const {
      metrics = [
        'page_impressions',
        'page_impressions_unique',
        'page_post_engagements',
        'page_fans',
        'page_messages_total_count',
      ],
      period = 'day',
      since,
      until,
    } = options;
    return this.request<MetaListResponse<MetaPageInsight>>(
      `/${encodeURIComponent(pageId)}/insights`,
      {
        metric: metrics.join(','),
        period,
        since,
        until,
        access_token: token,
      },
    );
  }

  private async request<T>(
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<T> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(
      ([key, value]) => value !== undefined && query.set(key, String(value)),
    );
    const response = await fetch(`${this.graphBaseUrl}${path}?${query}`);
    const body = (await response.json()) as T & {
      error?: { message?: string };
    };
    if (!response.ok || body.error) {
      throw new ServiceUnavailableException(
        body.error?.message || 'Meta API request failed',
      );
    }
    return body;
  }
}
