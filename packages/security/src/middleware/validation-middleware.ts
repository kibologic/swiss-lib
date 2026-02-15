import { ValidatorService, type JSONSchema, type ValidationResult } from '../index.js';

export interface ValidationMiddlewareOptions {
  schema: JSONSchema;
  target?: 'body' | 'query' | 'params' | 'headers';
  onValidationError?: (result: ValidationResult) => void;
  strict?: boolean;
}

export function createValidationMiddleware(options: ValidationMiddlewareOptions) {
  const validator = new ValidatorService();
  const compiledSchema = validator.compileSchema(options.schema);
  
  return async (req: any, res: any, next: any) => {
    try {
      const target = options.target || 'body';
      const data = req[target];
      
      const result = compiledSchema.validate(data);
      
      if (!result.ok) {
        if (options.onValidationError) {
          options.onValidationError(result);
        }
        
        return res.status(400).json({
          error: 'Validation Error',
          message: 'Request validation failed',
          details: result.reasons,
        });
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
}
