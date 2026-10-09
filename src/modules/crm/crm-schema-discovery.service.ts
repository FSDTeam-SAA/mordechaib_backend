import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  CrmProviderHttpError,
  CrmProviderType,
} from '../../common/types/crm-provider.interface';
import { CrmConnectionsService } from './crm-connections.service';
import { CrmProviderRegistry } from './crm-provider.registry';

const OBJECT_TYPE_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;

@Injectable()
export class CrmSchemaDiscoveryService {
  constructor(
    private readonly connections: CrmConnectionsService,
    private readonly providers: CrmProviderRegistry,
  ) {}

  async listObjects(organizationId: string, provider: CrmProviderType) {
    const objects = await this.providerRequest(
      organizationId,
      provider,
      ({ client, accessToken, instanceUrl, scopes }) =>
        client.listObjects(accessToken, { instanceUrl, scopes }),
    );

    return { provider, objects };
  }

  async describeObject(
    organizationId: string,
    provider: CrmProviderType,
    objectType: string,
  ) {
    const normalizedObjectType = this.objectType(objectType);
    const schema = await this.providerRequest(
      organizationId,
      provider,
      ({ client, accessToken, instanceUrl, scopes }) =>
        client.describeObject(accessToken, normalizedObjectType, {
          instanceUrl,
          scopes,
        }),
    );

    return { provider, ...schema };
  }

  private providerRequest<T>(
    organizationId: string,
    provider: CrmProviderType,
    operation: (input: {
      client: ReturnType<CrmProviderRegistry['get']>;
      accessToken: string;
      instanceUrl?: string;
      scopes?: string[];
    }) => Promise<T>,
  ) {
    return this.connections
      .execute(organizationId, provider, ({ accessToken, metadata }) =>
        operation({
          client: this.providers.get(provider),
          accessToken,
          instanceUrl: metadata.instanceUrl,
          scopes: metadata.scopes,
        }),
      )
      .catch((error: unknown) => this.providerError(error));
  }

  private objectType(value: string) {
    const objectType = value.trim();
    if (!OBJECT_TYPE_PATTERN.test(objectType)) {
      throw new BadRequestException('objectType is invalid');
    }
    return objectType;
  }

  private providerError(error: unknown): never {
    if (!(error instanceof CrmProviderHttpError)) throw error;
    if (error.statusCode === 400) {
      throw new BadRequestException(error.message);
    }
    if (error.statusCode === 403) {
      throw new ForbiddenException(error.message);
    }
    if (error.statusCode === 404) {
      throw new NotFoundException(error.message);
    }
    if (error.statusCode === 429 || error.statusCode >= 500) {
      throw new ServiceUnavailableException(error.message);
    }
    throw new BadGatewayException(error.message);
  }
}
