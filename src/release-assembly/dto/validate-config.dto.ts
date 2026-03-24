import { IsString, IsUUID, MaxLength } from 'class-validator';

export class ValidateConfigDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MaxLength(255)
  artifactKey!: string;
}
