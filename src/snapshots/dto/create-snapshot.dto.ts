import { IsDateString, IsObject, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateSnapshotDto {
  @IsUUID()
  projectId!: string;

  @IsString()
  @MaxLength(50)
  version!: string;

  @IsObject()
  payload!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  artifactKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  createdBy?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
