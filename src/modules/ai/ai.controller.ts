import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { CurrentOrg } from '../../common/decorators/current-org.decorator';
import { OrganizationGuard } from '../../common/guards/organization.guard';
import { AnalyzeTextDto } from './dto/analyze-text.dto';
import { AiService } from './ai.service';

@Controller('ai')
@UseGuards(OrganizationGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('analyze')
  analyze(@CurrentOrg() org: { id: string }, @Body() dto: AnalyzeTextDto) {
    return this.aiService.analyzeText(org.id, dto.text);
  }
}
