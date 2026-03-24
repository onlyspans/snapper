import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ArtifactNotificationDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MaxLength(255)
  artifactKey!: string;

  @IsString()
  @MaxLength(50)
  version!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  triggeredBy?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  environmentId?: string;
}
