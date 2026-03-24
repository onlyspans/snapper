import { Injectable } from '@nestjs/common';
import { CollectedConfig } from '../interfaces';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

@Injectable()
export class ConfigValidatorService {
  validate(collected: CollectedConfig): ValidationResult {
    const errors: string[] = [];

    if (!collected.releaseStructure?.project_id) {
      errors.push('Projects service returned empty project_id');
    }

    if (collected.variables.conflict_error) {
      errors.push(
        `Variables conflict for key "${collected.variables.conflict_error.key}" (${collected.variables.conflict_error.conflicting_sources.join(', ')})`,
      );
    }

    if (collected.variables.internal_error?.message) {
      errors.push(`Variables internal error: ${collected.variables.internal_error.message}`);
    }

    if (collected.sourceSnapshot.error?.message) {
      errors.push(`Artifact storage error: ${collected.sourceSnapshot.error.message}`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}
