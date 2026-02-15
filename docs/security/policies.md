# SWISS Security Policies

## Overview
Security policies in SWISS define the rules and constraints for accessing resources and performing actions within the framework. Each policy is associated with a target and can include validation rules, rate limiting, and custom predicates.

## Policy Structure

```typescript
interface SecurityPolicy {
  // Unique identifier for the policy
  id: string;
  
  // Human-readable description
  description?: string;
  
  // The resource or action this policy protects
  // Format: "resource:action" (e.g., "data:export", "user:delete")
  target: string;
  
  // Optional role-based access control
  roles?: string[];
  
  // Optional permission-based access control
  permissions?: string[];
  
  // Rate limiting (requests per minute)
  rateLimitPerMinute?: number;
  
  // Input validation rules
  inputValidation?: {
    // JSON Schema for request validation
    schema?: JSONSchema;
    
    // Sanitization level
    sanitization?: 'strict' | 'moderate' | 'none';
    
    // Allowed content types for file uploads
    allowedContentTypes?: string[];
    
    // Maximum input size in bytes
    maxSize?: number;
  };
  
  // Output encoding rules
  outputEncoding?: {
    // Context for encoding (html, attribute, css, url, javascript)
    context: 'html' | 'attribute' | 'css' | 'url' | 'javascript';
    
    // Specific encoding rules to apply
    rules: Array<{
      // Pattern to match
      match: string | RegExp;
      
      // Replacement string or function
      replace: string | ((match: string, ...groups: string[]) => string);
    }>;
  };
  
  // Custom validation function
  predicate?: (ctx: SecurityContext) => boolean | Promise<boolean>;
}
```

## Example Policies

### 1. Data Export Policy
```typescript
{
  id: 'data:export',
  description: 'Controls access to data export functionality',
  target: 'data:export',
  roles: ['admin', 'reporter'],
  rateLimitPerMinute: 10,
  inputValidation: {
    schema: {
      type: 'object',
      properties: {
        format: { 
          type: 'string',
          enum: ['csv', 'json', 'xlsx']
        },
        filters: { 
          type: 'object',
          additionalProperties: true
        }
      },
      required: ['format']
    }
  }
}
```

### 2. File Upload Policy
```typescript
{
  id: 'files:upload',
  description: 'Controls file uploads',
  target: 'files:upload',
  roles: ['user'],
  inputValidation: {
    allowedContentTypes: [
      'image/jpeg',
      'image/png',
      'application/pdf'
    ],
    maxSize: 5 * 1024 * 1024, // 5MB
    sanitization: 'strict'
  }
}
```

## Best Practices

1. **Least Privilege**: Always assign the minimum required permissions
2. **Input Validation**: Validate all inputs using JSON Schema
3. **Output Encoding**: Always encode outputs based on context
4. **Rate Limiting**: Protect against brute force and DoS attacks
5. **Audit Logging**: Log all security-relevant events

## Implementation Notes

- Policies are evaluated in the order they are registered
- The first policy that matches a target is used
- Custom predicates can implement complex authorization logic
- Input validation happens before the request handler is called
- Output encoding is applied automatically based on context

## Security Considerations

- Never trust user input
- Always validate and sanitize data
- Use HTTPS in production
- Keep dependencies up to date
- Regularly review and update security policies
