import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  DefaultValuePipe,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import {
  RequestOrganization,
  RequestUser,
} from '../../common/types/request-context.type';
import { MetaService } from './meta.service';

@ApiTags('Meta')
@ApiBearerAuth()
@Controller('meta')
export class MetaController {
  constructor(private readonly service: MetaService) {}

  @Get('connect')
  @UseGuards(OrganizationGuard)
  connect(
    @CurrentOrg() organization: RequestOrganization,
    @CurrentUser() user: RequestUser,
  ) {
    return this.service.createAuthorizationUrl(organization.id, user.id);
  }

  @Public()
  @Get('callback')
  callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error?: string,
  ) {
    if (error) return { connected: false, error };
    if (!code || !state)
      throw new BadRequestException('Meta OAuth code and state are required');
    return this.service.completeAuthorization(code, state);
  }

  @Get('connection')
  @UseGuards(OrganizationGuard)
  connection(@CurrentOrg() organization: RequestOrganization) {
    return this.service.getConnection(organization.id);
  }

  @Get('pages/:pageId/posts')
  @UseGuards(OrganizationGuard)
  posts(
    @CurrentOrg() organization: RequestOrganization,
    @Param('pageId') pageId: string,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
  ) {
    return this.service.getPagePosts(organization.id, pageId, limit);
  }

  @Get('pages/:pageId/posts/:postId/comments')
  @UseGuards(OrganizationGuard)
  comments(
    @CurrentOrg() organization: RequestOrganization,
    @Param('pageId') pageId: string,
    @Param('postId') postId: string,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
  ) {
    return this.service.getPostComments(
      organization.id,
      pageId,
      postId,
      limit,
    );
  }

  @Get('pages/:pageId/messages')
  @UseGuards(OrganizationGuard)
  messages(
    @CurrentOrg() organization: RequestOrganization,
    @Param('pageId') pageId: string,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
  ) {
    return this.service.getPageMessages(organization.id, pageId, limit);
  }

  @Get('pages/:pageId/insights')
  @UseGuards(OrganizationGuard)
  insights(
    @CurrentOrg() organization: RequestOrganization,
    @Param('pageId') pageId: string,
    @Query('metrics') metrics?: string,
    @Query('period') period?: string,
  ) {
    return this.service.getPageInsights(
      organization.id,
      pageId,
      metrics,
      period,
    );
  }

  @Get('pages/:pageId/overview')
  @UseGuards(OrganizationGuard)
  overview(
    @CurrentOrg() organization: RequestOrganization,
    @Param('pageId') pageId: string,
    @Query('limit', new DefaultValuePipe(25), ParseIntPipe) limit: number,
    @Query('metrics') metrics?: string,
    @Query('period') period?: string,
  ) {
    return this.service.getPageOverview(
      organization.id,
      pageId,
      limit,
      metrics,
      period,
    );
  }
}
