export type SchemaName =
  | 'LearningPack'
  | 'Case'
  | 'DecisionNode'
  | 'Question'
  | 'Answer'
  | 'Explanation'
  | 'ProgressRecord';

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface ContentValidator {
  validate(schemaName: SchemaName, value: unknown): ValidationResult;
}

