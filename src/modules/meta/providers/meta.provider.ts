import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type MetaTokenResponse = {
  access_token: string;
  token_type?: string;
  expires_in?: number;
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
      scope: 'public_profile,pages_show_list,business_management',
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

  private async request<T>(
    path: string,
    params: Record<string, string | undefined>,
  ): Promise<T> {
    const query = new URLSearchParams();
    Object.entries(params).forEach(
      ([key, value]) => value && query.set(key, value),
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
