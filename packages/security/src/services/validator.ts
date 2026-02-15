import type { JSONSchema, ValidationResult } from '../types.js';

export interface ValidationRule {
  name: string;
  validate: (value: unknown) => ValidationResult;
}

export interface CompiledSchema {
  validate: (value: unknown) => ValidationResult;
  rules: ValidationRule[];
}

export class ValidatorService {
  private compiledSchemas = new Map<string, CompiledSchema>();

  compileSchema(schema: JSONSchema, id?: string): CompiledSchema {
    const schemaId = id || JSON.stringify(schema);
    
    if (this.compiledSchemas.has(schemaId)) {
      return this.compiledSchemas.get(schemaId)!;
    }

    const rules: ValidationRule[] = [];
    
    // Type validation
    if (schema.type) {
      rules.push({
        name: 'type',
        validate: (value: unknown) => {
          if (typeof value !== schema.type) {
            return {
              ok: false,
              reasons: [`Type mismatch: expected ${schema.type}, got ${typeof value}`],
            };
          }
          return { ok: true };
        },
      });
    }

    // Required fields validation for objects
    if (schema.required && Array.isArray(schema.required)) {
      rules.push({
        name: 'required',
        validate: (value: unknown) => {
          if (typeof value !== 'object' || value === null) {
            return { ok: true }; // Will be caught by type validation
          }
          
          const obj = value as Record<string, unknown>;
          const reasons: string[] = [];
          
          for (const required of schema.required!) {
            if (!(required in obj)) {
              reasons.push(`Missing required field: ${required}`);
            }
          }
          
          return {
            ok: reasons.length === 0,
            reasons: reasons.length ? reasons : undefined,
          };
        },
      });
    }

    // Enum validation
    if (schema.enum && Array.isArray(schema.enum)) {
      rules.push({
        name: 'enum',
        validate: (value: unknown) => {
          if (!schema.enum!.includes(value as string | number | boolean)) {
            return {
              ok: false,
              reasons: [`Invalid enum value: ${value}`],
            };
          }
          return { ok: true };
        },
      });
    }

    // String validations
    if (schema.minLength !== undefined || schema.maxLength !== undefined || schema.pattern) {
      rules.push({
        name: 'string',
        validate: (value: unknown) => {
          if (typeof value !== 'string') {
            return { ok: true }; // Will be caught by type validation
          }
          
          const reasons: string[] = [];
          
          if (schema.minLength !== undefined && value.length < schema.minLength) {
            reasons.push(`String too short: minimum ${schema.minLength} characters`);
          }
          
          if (schema.maxLength !== undefined && value.length > schema.maxLength) {
            reasons.push(`String too long: maximum ${schema.maxLength} characters`);
          }
          
          if (schema.pattern) {
            const regex = new RegExp(schema.pattern);
            if (!regex.test(value)) {
              reasons.push(`String does not match required pattern`);
            }
          }
          
          return {
            ok: reasons.length === 0,
            reasons: reasons.length ? reasons : undefined,
          };
        },
      });
    }

    // Property validation for objects
    if (schema.properties && typeof schema.properties === 'object') {
      rules.push({
        name: 'properties',
        validate: (value: unknown) => {
          if (typeof value !== 'object' || value === null) {
            return { ok: true }; // Will be caught by type validation
          }
          
          const obj = value as Record<string, unknown>;
          const reasons: string[] = [];
          
          if (schema.properties) {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
              if (propName in obj) {
                const propResult = this.validateValue(obj[propName], propSchema as JSONSchema);
                if (!propResult.ok && propResult.reasons) {
                  reasons.push(...propResult.reasons.map((r: string) => `${propName}.${r}`));
                }
              }
            }
          }
          
          return {
            ok: reasons.length === 0,
            reasons: reasons.length ? reasons : undefined,
          };
        },
      });
    }

    const compiledSchema: CompiledSchema = {
      validate: (value: unknown) => {
        for (const rule of rules) {
          const result = rule.validate(value);
          if (!result.ok) {
            return result;
          }
        }
        return { ok: true };
      },
      rules,
    };

    this.compiledSchemas.set(schemaId, compiledSchema);
    return compiledSchema;
  }

  validateValue(value: unknown, schema: JSONSchema): ValidationResult {
    const compiled = this.compileSchema(schema);
    return compiled.validate(value);
  }

  addCustomRule(_name: string, _rule: ValidationRule): void {
    // This allows extending validation with custom rules
    // Implementation would depend on specific requirements
  }

  clearCache(): void {
    this.compiledSchemas.clear();
  }

  getCacheStats(): { size: number; schemas: string[] } {
    return {
      size: this.compiledSchemas.size,
      schemas: Array.from(this.compiledSchemas.keys()),
    };
  }
}
