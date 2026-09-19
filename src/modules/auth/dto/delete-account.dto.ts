import { Equals, IsString, MinLength } from 'class-validator';

export class DeleteAccountDto {
  @IsString()
  @MinLength(8)
  password!: string;

  // A deliberate second confirmation prevents a destructive request caused by
  // an accidental frontend action or an unintended form submission.
  @Equals('DELETE', {
    message: 'confirmation must be exactly DELETE',
  })
  confirmation!: 'DELETE';
}
