# Undici Workflow Engine

A dependency-aware, declarative service orchestrator for orchestrating HTTP services with variable interpolation and fallback support. Built for Node.js with Undici.

## Features

- **Dependency-based orchestration** - Define service dependencies and execute them in the correct order
- **Variable interpolation** - Use `$<contextKey>.path` syntax to reference values from context
- **Fallback responses** - Define fallback data for services that fail
- **OIDC authentication** - Built-in OIDC client credentials flow support
- **Cookie handling** - Automatic Set-Cookie extraction and cookie management
- **Response header extraction** - Full header and status code capture
- **Undici-powered** - High-performance HTTP client built on modern Node.js APIs
- **Type-safe** - Full TypeScript support with comprehensive type definitions

## Installation

```bash
npm install undici-workflow-engine
```

## Quick Start

```typescript
import { runOrchestration } from 'undici-workflow-engine';

const result = await runOrchestration(
  [
    {
      id: 'fetchUser',
      service: {
        url: 'https://api.example.com/users/123',
        method: 'GET',
      },
    },
    {
      id: 'fetchPosts',
      dependsOn: ['fetchUser'],
      service: {
        url: 'https://api.example.com/posts',
        method: 'GET',
        query: {
          userId: '$fetchUser.body.id',
        },
      },
    },
  ],
  {
    request: {
      headers: { 'authorization': 'Bearer token' },
    },
  }
);

console.log(result.success); // true/false
console.log(result.results); // { fetchUser: {...}, fetchPosts: {...} }
```

## API Reference

### `runOrchestration(services, context)`

Executes a workflow of orchestrated services.

**Parameters:**
- `services: ServiceBlock[]` - Array of service definitions with dependencies
- `context: OrchestrationContext` - Initial execution context

**Returns:** `Promise<OrchestrationResult>`

### ServiceBlock

```typescript
interface ServiceBlock {
  id: string;              // Unique service identifier
  dependsOn?: string[];    // Service IDs this depends on
  service: ServiceConfig;  // Service configuration
}
```

### ServiceConfig

```typescript
interface ServiceConfig {
  url: string;
  method: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  query?: Record<string, string>;
  body?: any;
  timeout?: number;        // milliseconds (default: 30000)
  fallback?: { data: any };
  oidc?: {                 // Node.js only
    clientId: string;
    clientSecret: string;
    scope?: string;
    tokenUrl?: string;
  };
}
```

### OrchestrationContext

```typescript
interface OrchestrationContext {
  request: {
    body?: any;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    query?: Record<string, string>;
  };
  env?: Record<string, string>;
}
```

### ServiceResult

```typescript
interface ServiceResult {
  status: number | null;
  body: any;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  error?: any;
  fallbackUsed?: boolean;
}
```

### OrchestrationResult

```typescript
interface OrchestrationResult {
  success: boolean;
  results: Record<string, ServiceResult>;
}
```

## Variable Interpolation

Reference any value from the orchestration context using `$<contextKey>.path` syntax.

The context key can be any root-level property in the context object.

### Syntax

```typescript
$<contextKey>.path.to.value
```

### Examples

```typescript
{
  service: {
    body: {
      userId: '$service01.body.id',
      email: '$request.body.email',
      apiKey: '$env.API_KEY',
      customField: '$customData.token',
    },
  },
}
```

### Bracket Notation

For keys with special characters (dots, colons, dashes):

```typescript
{
  service: {
    body: {
      customField: "$serviceId.body['custom:field']",
      anotherField: '$serviceId.body["field-with-dash"]',
    },
  },
}
```

## Examples

### Authentication Flow

```typescript
const result = await runOrchestration(
  [
    {
      id: 'authenticate',
      service: {
        url: 'https://auth.example.com/login',
        method: 'POST',
        body: {
          email: '$request.body.email',
          password: '$request.body.password',
        },
      },
    },
    {
      id: 'fetchProfile',
      dependsOn: ['authenticate'],
      service: {
        url: 'https://api.example.com/profile',
        method: 'GET',
        headers: {
          authorization: '$authenticate.body.token',
        },
      },
    },
  ],
  {
    request: {
      body: {
        email: 'user@example.com',
        password: 'secret123',
      },
    },
  }
);
```

### Multi-branch Orchestration

```typescript
const result = await runOrchestration(
  [
    {
      id: 'getUser',
      service: {
        url: 'https://api.example.com/users/123',
        method: 'GET',
      },
    },
    {
      id: 'getPosts',
      dependsOn: ['getUser'],
      service: {
        url: 'https://api.example.com/posts',
        method: 'GET',
        query: { userId: '$getUser.body.id' },
      },
    },
    {
      id: 'getComments',
      dependsOn: ['getUser'],
      service: {
        url: 'https://api.example.com/comments',
        method: 'GET',
        query: { userId: '$getUser.body.id' },
      },
    },
    {
      id: 'aggregate',
      dependsOn: ['getPosts', 'getComments'],
      service: {
        url: 'https://aggregation.example.com/combine',
        method: 'POST',
        body: {
          posts: '$getPosts.body',
          comments: '$getComments.body',
        },
      },
    },
  ],
  { request: {} }
);
```

### With Fallbacks

```typescript
const result = await runOrchestration(
  [
    {
      id: 'criticalService',
      service: {
        url: 'https://api.example.com/data',
        method: 'GET',
        fallback: {
          data: { status: 'unavailable', items: [] },
        },
      },
    },
  ],
  { request: {} }
);
```

## Requirements

- **Node.js 18+** - Required for Undici and modern async/await support
- **Undici** - High-performance HTTP client (included as dependency)
- **async-flow-orchestrator** - Dependency orchestration engine
- **undici-oidc-interceptor** - Optional, for OIDC authentication support

## Running Tests

```bash
npm test
```

Tests use Node.js native test runner (`node --test`).

## License

MIT
