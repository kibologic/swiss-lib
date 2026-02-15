/*
 * Copyright (c) 2024 Themba Mzumara
 * This file is part of SwissJS Framework. All rights reserved.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

export interface ExpressionContext {
  [key: string]: unknown;
}

export interface ExpressionOptions {
  safe?: boolean;
  strict?: boolean;
  filters?: Record<string, (value: unknown) => unknown>;
}

/**
 * Expression evaluator for template expressions and data binding
 */
export class ExpressionEvaluator {
  private options: ExpressionOptions;
  
  constructor(options: ExpressionOptions = {}) {
    this.options = {
      safe: true,
      strict: false,
      filters: {},
      ...options,
    };
  }

  evaluate(expression: string, context: ExpressionContext = {}): unknown {
    try {
      // Handle simple property access
      if (isValidIdentifier(expression)) {
        return this.getProperty(context, expression);
      }

      // Handle complex expressions
      return this.evaluateComplex(expression, context);
    } catch (error) {
      if (this.options.strict) {
        throw error;
      }
      return undefined;
    }
  }

  private evaluateComplex(expression: string, context: ExpressionContext): unknown {
    // Remove surrounding braces if present
    expression = expression.trim().replace(/^\{|\}$/g, '');

    // Handle filters
    const filterMatch = expression.match(/^(.+)\s*\|\s*(.+)$/);
    if (filterMatch) {
      const [, expr, filterName] = filterMatch;
      const value = this.evaluate(expr.trim(), context);
      return this.applyFilter(filterName.trim(), value);
    }

    // Handle ternary expressions
    const ternaryMatch = expression.match(/^(.+?)\s*\?\s*(.+?)\s*:\s*(.+)$/);
    if (ternaryMatch) {
      const [, condition, trueExpr, falseExpr] = ternaryMatch;
      const conditionResult = this.evaluate(condition.trim(), context);
      return conditionResult 
        ? this.evaluate(trueExpr.trim(), context)
        : this.evaluate(falseExpr.trim(), context);
    }

    // Handle binary operations
    const operators = ['===', '!==', '==', '!=', '>=', '<=', '>', '<', '&&', '||', '+', '-', '*', '/', '%'];
    for (const op of operators) {
      const regex = new RegExp(`^(.+?)\\s*${op.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(.+)$`);
      const match = expression.match(regex);
      if (match) {
        const [, left, right] = match;
        const leftValue = this.evaluate(left.trim(), context);
        const rightValue = this.evaluate(right.trim(), context);
        return this.applyOperator(op, leftValue, rightValue);
      }
    }

    // Default to property access
    return this.getProperty(context, expression);
  }

  private getProperty(obj: unknown, path: string): unknown {
    if (!obj || typeof obj !== 'object') {
      return undefined;
    }

    const parts = path.split('.');
    let current: unknown = obj;

    for (const part of parts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        return undefined;
      }
    }

    return current;
  }

  private applyOperator(operator: string, left: unknown, right: unknown): unknown {
    switch (operator) {
      case '===': return left === right;
      case '!==': return left !== right;
      case '==': return left == right;
      case '!=': return left != right;
      case '>=': return (left as any) >= (right as any);
      case '<=': return (left as any) <= (right as any);
      case '>': return (left as any) > (right as any);
      case '<': return (left as any) < (right as any);
      case '&&': return !!(left && right);
      case '||': return !!(left || right);
      case '+': return (left as any) + (right as any);
      case '-': return (left as any) - (right as any);
      case '*': return (left as any) * (right as any);
      case '/': return (left as any) / (right as any);
      case '%': return (left as any) % (right as any);
      default: return undefined;
    }
  }

  private applyFilter(filterName: string, value: unknown): unknown {
    const filter = this.options.filters?.[filterName];
    if (filter) {
      return filter(value);
    }
    
    // Built-in filters
    switch (filterName) {
      case 'uppercase': return typeof value === 'string' ? value.toUpperCase() : value;
      case 'lowercase': return typeof value === 'string' ? value.toLowerCase() : value;
      case 'json': return JSON.stringify(value);
      case 'number': return Number(value);
      case 'string': return String(value);
      default: return value;
    }
  }
}

function isValidIdentifier(str: string): boolean {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
}
