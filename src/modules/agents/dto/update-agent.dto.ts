import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { AgentStatus } from '../../../common/enums/agent-status.enum';
import { CreateAgentDto } from './create-agent.dto';

export class UpdateAgentDto extends PartialType(CreateAgentDto) {
  @ApiPropertyOptional({ enum: AgentStatus, example: AgentStatus.ACTIVE })
  @IsOptional()
  @IsEnum(AgentStatus)
  status?: AgentStatus;
}
