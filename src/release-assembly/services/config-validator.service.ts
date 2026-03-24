import { Injectable } from '@nestjs/common';
import { isResolvedVariablesConflict, isResolvedVariablesInternalError } from '@integrations/variables';
import { CollectedConfig } from '../interfaces';

export interface ValidationFatalError {
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  fatalErrors: ValidationFatalError[];
}

@Injectable()
export class ConfigValidatorService {
  validate(collected: CollectedConfig): ValidationResult {
    const errors: string[] = [];
    const fatalErrors: ValidationFatalError[] = [];

    if (!collected.releaseStructure?.project_id) {
      errors.push('Projects service returned empty project_id');
    }

    if (isResolvedVariablesConflict(collected.variables)) {
      errors.push(
        `Variables conflict for key "${collected.variables.conflict_error.key}" (${collected.variables.conflict_error.conflicting_sources.join(', ')})`,
      );
    }

    if (isResolvedVariablesInternalError(collected.variables)) {
      fatalErrors.push({
        code: 'VARIABLES_INTERNAL',
        message: collected.variables.internal_error.message,
      });
    }

    if (collected.sourceSnapshot.error?.message) {
      fatalErrors.push({
        code: 'ARTIFACT_STORAGE',
        message: collected.sourceSnapshot.error.message,
      });
    }

    return {
      valid: errors.length === 0 && fatalErrors.length === 0,
      errors,
      fatalErrors,
    };
  }
}
