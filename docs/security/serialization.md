# Secure Serialization in SWISS

## Overview
The secure serialization utilities provide safe ways to serialize and deserialize data while protecting against common security vulnerabilities like prototype pollution and injection attacks.

## API Reference

### `SafeSerializer`

#### `safeStringify(value: any, replacer?: (key: string, value: any) => any, space?: string | number): string`

Safely converts a JavaScript value to a JSON string.

**Parameters:**
- `value`: The value to convert to a JSON string
- `replacer`: Optional function that transforms the results
- `space`: Adds indentation, white space, and line break characters

**Returns:** A JSON string representing the given value

**Throws:**
- `SecurityError` if the object contains unsafe properties

**Example:**
```typescript
import { SafeSerializer } from '@swissjs/security/serialization';

const data = { name: 'Test', __proto__: {} };
const json = SafeSerializer.safeStringify(data); // Throws SecurityError
```

#### `safeParse<T = any>(text: string, reviver?: (key: string, value: any) => any): T`

Safely parses a JSON string, constructing the JavaScript value or object described by the string.

**Parameters:**
- `text`: The string to parse as JSON
- `reviver`: Optional function that transforms the results

**Returns:** The object corresponding to the given JSON text

**Throws:**
- `SyntaxError` if the string to parse is not valid JSON
- `SecurityError` if the parsed object contains unsafe properties

**Example:**
```typescript
import { SafeSerializer } from '@swissjs/security/serialization';

const json = '{"__proto__": {"isAdmin": true}}';
const data = SafeSerializer.safeParse(json); // Throws SecurityError
```

#### `safeDeepClone<T>(obj: T): T`

Creates a deep clone of an object while protecting against prototype pollution.

**Parameters:**
- `obj`: The object to clone

**Returns:** A deep-cloned object

**Example:**
```typescript
import { SafeSerializer } from '@swissjs/security/serialization';

const original = { nested: { value: 'test' } };
const cloned = SafeSerializer.safeDeepClone(original);
```

### `ContentSecurity`

#### `sanitizeForCsv(input: string): string`

Sanitizes a string for safe inclusion in CSV output.

**Parameters:**
- `input`: The string to sanitize

**Returns:** A sanitized string safe for CSV output

**Example:**
```typescript
import { ContentSecurity } from '@swissjs/security/content';

const userInput = '=1+1';
const safe = ContentSecurity.sanitizeForCsv(userInput);
// Returns: "'=1+1"
```

#### `escapeHtml(unsafe: string): string`

Escapes a string for safe inclusion in HTML.

**Parameters:**
- `unsafe`: The string to escape

**Returns:** An HTML-escaped string

**Example:**
```typescript
import { ContentSecurity } from '@swissjs/security/content';

const userInput = '<script>alert("XSS")</script>';
const safe = ContentSecurity.escapeHtml(userInput);
// Returns: "&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;"
```

#### `escapeUrl(url: string): string`

Escapes a string for safe inclusion in URLs.

**Parameters:**
- `url`: The URL to escape

**Returns:** A URL-encoded string

**Example:**
```typescript
import { ContentSecurity } from '@swissjs/security/content';

const userInput = 'hello world & test';
const safe = ContentSecurity.escapeUrl(userInput);
// Returns: "hello%20world%20%26%20test"
```

#### `sanitizeForJson(input: string): string`

Sanitizes a string for safe inclusion in JSON output.

**Parameters:**
- `input`: The string to sanitize

**Returns:** A JSON-safe string

**Example:**
```typescript
import { ContentSecurity } from '@swissjs/security/content';

const userInput = 'Hello "World"\nNew Line';
const safe = ContentSecurity.sanitizeForJson(userInput);
// Returns: "Hello \"World\"\nNew Line"
```

## Security Considerations

### Prototype Pollution Protection

The serialization utilities protect against prototype pollution attacks by:

1. **Blocking dangerous properties**: `__proto__`, `constructor`, `prototype`
2. **Validating object structure**: Ensuring objects don't contain nested dangerous properties
3. **Using safe parsing**: Avoiding direct JSON.parse on untrusted input

### Injection Prevention

Content security utilities prevent various injection attacks:

1. **CSV Injection**: Escapes formula characters (=, +, -, @)
2. **XSS**: HTML-escapes dangerous characters
3. **URL Injection**: Properly encodes URL parameters
4. **JSON Injection**: Ensures JSON strings are properly formatted

## Implementation Details

### Unsafe Properties Filter

```typescript
const UNSAFE_PROPS = [
  '__proto__',
  'constructor',
  'prototype',
  'hasOwnProperty',
  'isPrototypeOf',
  'propertyIsEnumerable',
  'toLocaleString',
  'toString',
  'valueOf'
];
```

### CSV Injection Prevention

CSV injection is prevented by:
1. Detecting formula characters at the start of strings
2. Prepending a single quote to neutralize formulas
3. Escaping existing quotes within the string

### HTML Escaping

HTML escaping follows OWASP recommendations:
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`
- `'` → `&#039;`

## Performance Considerations

- The serialization utilities add minimal overhead
- For large datasets, consider streaming serialization
- Cache sanitized content when possible
- Use appropriate sanitization levels (strict vs moderate)

## Best Practices

1. **Always validate input**: Use schema validation before serialization
2. **Choose the right context**: Use the appropriate escape function for the output context
3. **Don't double-escape**: Avoid escaping already sanitized content
4. **Test edge cases**: Test with various malicious inputs
5. **Keep libraries updated**: Stay current with security patches

## Examples

### Complete Example with All Security Features

```typescript
import { SafeSerializer, ContentSecurity } from '@swissjs/security';

class SecureDataHandler {
  // Handle user input securely
  static handleUserInput(rawInput: any) {
    // 1. Validate input structure
    if (!this.validateInput(rawInput)) {
      throw new Error('Invalid input structure');
    }

    // 2. Sanitize for storage
    const sanitized = this.sanitizeForStorage(rawInput);
    
    // 3. Serialize safely
    const serialized = SafeSerializer.safeStringify(sanitized);
    
    return serialized;
  }

  // Export data securely
  static exportToCsv(data: any[]) {
    return data.map(row => 
      Object.values(row).map(value => 
        ContentSecurity.sanitizeForCsv(String(value))
      ).join(',')
    ).join('\n');
  }

  // Generate HTML content safely
  static generateHtml(userContent: string) {
    const escaped = ContentSecurity.escapeHtml(userContent);
    return `<div class="user-content">${escaped}</div>`;
  }

  private static validateInput(input: any): boolean {
    // Implement your validation logic
    return typeof input === 'object' && input !== null;
  }

  private static sanitizeForStorage(input: any): any {
    // Implement your sanitization logic
    return input;
  }
}
```

## Testing Security Features

```typescript
import { SafeSerializer, ContentSecurity } from '@swissjs/security';

// Test prototype pollution protection
const testPrototypePollution = () => {
  const malicious = '{"__proto__": {"isAdmin": true}}';
  
  try {
    SafeSerializer.safeParse(malicious);
    console.error('Security test failed: Prototype pollution not detected');
  } catch (error) {
    console.log('Security test passed: Prototype pollution detected');
  }
};

// Test CSV injection prevention
const testCsvInjection = () => {
  const malicious = '=SUM(1,2)';
  const safe = ContentSecurity.sanitizeForCsv(malicious);
  
  if (safe.startsWith("'")) {
    console.log('Security test passed: CSV injection prevented');
  } else {
    console.error('Security test failed: CSV injection not prevented');
  }
};

// Run all tests
testPrototypePollution();
testCsvInjection();
```

## Migration Guide

### From JSON.parse/stringify

Replace:
```typescript
// Unsafe
const data = JSON.parse(userInput);
const json = JSON.stringify(data);
```

With:
```typescript
// Safe
import { SafeSerializer } from '@swissjs/security/serialization';

const data = SafeSerializer.safeParse(userInput);
const json = SafeSerializer.safeStringify(data);
```

### From Manual Escaping

Replace:
```typescript
// Unsafe
const html = userInput.replace(/</g, '&lt;').replace(/>/g, '&gt;');
```

With:
```typescript
// Safe
import { ContentSecurity } from '@swissjs/security/content';

const html = ContentSecurity.escapeHtml(userInput);
```

## Troubleshooting

### Common Issues

1. **SecurityError thrown unexpectedly**
   - Check for prototype pollution in input
   - Verify input structure matches expectations

2. **Double escaping**
   - Ensure you're not escaping already sanitized content
   - Check middleware chain for duplicate processing

3. **Performance issues**
   - Consider caching sanitized content
   - Use streaming for large datasets
