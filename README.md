# SwissJS Framework

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A modern, capability-based web framework that prioritizes security and performance. SwissJS provides a secure, extensible runtime with compile-time transformations for building modern web applications.

## Quick Start

### Installation

```bash
npm create swissjs@latest my-app
cd my-app
npm install
npm run dev
```

### Your First Component

```typescript
// App.uix
import { component, state } from '@swissjs/core'

@component
@requires('dom')
export default class App {
  @state count = 0

  render() {
    return (
      <div>
        <h1>Welcome to SwissJS</h1>
        <p>Count: {this.count}</p>
        <button onClick={() => this.count++}>
          Increment
        </button>
      </div>
    )
  }
}
```

## Features

- **Capability-Based Security**: Components declare required capabilities for fine-grained access control
- **Compile-Time Optimizations**: Dead code elimination and tree-shaking for minimal bundle sizes
- **Plugin System**: Extensible architecture with isolated plugin contexts
- **TypeScript First**: Full TypeScript support with custom `.ui` and `.uix` file extensions
- **VDOM Rendering**: Efficient virtual DOM with minimal DOM mutations

## File Extensions

- `.ui` - Swiss files with TypeScript (logic, types, utilities)
- `.uix` - Swiss files with TypeScript + JSX (components)

## Documentation

- [Getting Started](./docs/guide/quick-start.md)
- [API Reference](./docs/api/)
- [Components Guide](./docs/guide/components.md)
- [Security Model](./docs/guide/security.md)
- [Plugin Development](./docs/guide/plugins.md)

## Packages

- **@swissjs/core** - Core framework runtime
- **@swissjs/compiler** - Swiss compiler pipeline
- **@swissjs/cli** - Command-line tools
- **@swissjs/plugins** - First-party plugins

## Contributing

We welcome contributions! Please see our [Contributing Guide](./CONTRIBUTING.md) for details.

## Security

For security policies and vulnerability reporting, see [SECURITY.md](./SECURITY.md).

## License

Licensed under the [MIT License](./LICENSE).
