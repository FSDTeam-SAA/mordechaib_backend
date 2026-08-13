import { IsIn } from 'class-validator';

export class PauseSubscriptionDto {
  @IsIn([30, 60, 90])
  days!: 30 | 60 | 90;
}