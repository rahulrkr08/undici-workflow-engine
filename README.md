# Undici Workflow Engine

A dependency-aware, declarative service orchestrator for orchestrating HTTP services with variable interpolation and fallback support. Built for Node.js with Undici.

## Features

- **Dependency-based orchestration** - Define service dependencies and execute them in the correct order
- **Conditional execution** - Skip services based on context using condition functions
- **Error strategies** - Control how critical vs. optional service failures affect the workflow
- **Variable interpolation** - Use `{$<contextKey>.path}` syntax to reference values from context
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
          userId: '{$fetchUser.body.id}',
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
  id: string;                              // Unique service identifier
  dependsOn?: string[];                    // Service IDs this depends on
  service: ServiceConfig;                  // Service configuration
  condition?: (context: any) => boolean;   // Skip service if condition is false
  errorStrategy?: 'silent' | 'throw';      // How to handle service errors
}
```

**Properties:**
- `condition` - Optional function to determine if service should execute. Receives the workflow context and should return boolean. If false, service is skipped.
- `errorStrategy` - How to handle errors:
  - `'silent'` (default) - Service errors don't prevent dependent services from executing
  - `'throw'` - Mark service as critical (for logging/monitoring purposes)

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

Reference any value from the orchestration context using `{$<contextKey>.path}` syntax with curly braces.

The context key can be any root-level property in the context object. Supports text before, after, and between tokens.

### Syntax

```typescript
{$<contextKey>.path.to.value}
```

### Examples

```typescript
{
  service: {
    body: {
      userId: '{$service01.body.id}',
      email: '{$request.body.email}',
      apiKey: '{$env.API_KEY}',
      customField: '{$customData.token}',
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
      customField: "{$serviceId.body['custom:field']}",
      anotherField: '{$serviceId.body["field-with-dash"]}',
    },
  },
}
```

### Text Before, After, and Between Tokens

You can combine tokens with text in the same string:

```typescript
{
  service: {
    url: '{$env.HOST}/api/{$request.id}',
    body: {
      fullUrl: 'https://{$env.HOST}:{$env.PORT}/api/{$request.id}',
      prefixedId: 'user_{$request.body.userId}',
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
          authorization: '{$authenticate.body.token}',
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
        query: { userId: '{$getUser.body.id}' },
      },
    },
    {
      id: 'getComments',
      dependsOn: ['getUser'],
      service: {
        url: 'https://api.example.com/comments',
        method: 'GET',
        query: { userId: '{$getUser.body.id}' },
      },
    },
    {
      id: 'aggregate',
      dependsOn: ['getPosts', 'getComments'],
      service: {
        url: 'https://aggregation.example.com/combine',
        method: 'POST',
        body: {
          posts: '{$getPosts.body}',
          comments: '{$getComments.body}',
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

### With Conditional Execution

Skip services based on conditions:

```typescript
const result = await runOrchestration(
  [
    {
      id: 'authenticate',
      service: {
        url: 'https://auth.example.com/login',
        method: 'POST',
        body: {
          email: '{$request.body.email}',
          password: '{$request.body.password}',
        },
      },
    },
    {
      id: 'fetchAdminPanel',
      dependsOn: ['authenticate'],
      condition: (context) => {
        const auth = context.getAll().authenticate;
        return auth?.body?.role === 'admin';
      },
      service: {
        url: 'https://api.example.com/admin',
        method: 'GET',
        headers: {
          authorization: '{$authenticate.body.token}',
        },
      },
    },
    {
      id: 'fetchUserProfile',
      dependsOn: ['authenticate'],
      service: {
        url: 'https://api.example.com/profile',
        method: 'GET',
        headers: {
          authorization: '{$authenticate.body.token}',
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

### With Error Strategies

Handle critical vs. optional failures differently:

```typescript
const result = await runOrchestration(
  [
    {
      id: 'validatePayment',
      errorStrategy: 'throw', // Mark as critical
      service: {
        url: 'https://payment.example.com/validate',
        method: 'POST',
        body: { amount: '{$request.body.amount}' },
      },
    },
    {
      id: 'processPayment',
      dependsOn: ['validatePayment'],
      service: {
        url: 'https://payment.example.com/process',
        method: 'POST',
        body: { token: '{$validatePayment.body.token}' },
      },
    },
    {
      id: 'sendNotification',
      errorStrategy: 'silent', // Optional - don't block workflow
      service: {
        url: 'https://notifications.example.com/send',
        method: 'POST',
        body: { message: 'Payment processed' },
        fallback: { data: { status: 'skipped' } },
      },
    },
  ],
  { request: { body: { amount: 100 } } }
);
```

## Requirements

- **Node.js 18+** - Required for Undici and modern async/await support
- **Undici** - High-performance HTTP client (included as dependency)
- **async-flow-orchestrator** - Dependency orchestration engine
- **undici-oidc-interceptor** - Optional, for OIDC authentication support

## Diagnostics and Monitoring

The engine emits Node.js diagnostic channel events for service lifecycle events, enabling monitoring and debugging without modifying your code.

### Diagnostic Channels

Three diagnostic channels are available for subscription:

- `workflow:service:start` - Emitted when a service execution begins
- `workflow:service:complete` - Emitted when a service execution completes successfully
- `workflow:service:error` - Emitted when a service execution fails

### Example: Monitoring Service Execution

```typescript
import { diagnosticsChannel } from 'node:diagnostics_channel';

// Subscribe to service start events
const startChannel = diagnosticsChannel.channel('workflow:service:start');
startChannel.subscribe((message) => {
  console.log(`Service ${message.serviceId} starting...`);
  console.log(`URL: ${message.request.url}`);
  console.log(`Method: ${message.request.method}`);
});

// Subscribe to service completion events
const completeChannel = diagnosticsChannel.channel('workflow:service:complete');
completeChannel.subscribe((message) => {
  console.log(`Service ${message.serviceId} completed`);
  console.log(`Status: ${message.status}`);
  console.log(`Processing time: ${message.processingTime}ms`);
  if (message.fallbackUsed) {
    console.log('(Fallback was used)');
  }
});

// Subscribe to service error events
const errorChannel = diagnosticsChannel.channel('workflow:service:error');
errorChannel.subscribe((message) => {
  console.log(`Service ${message.serviceId} failed`);
  console.log(`Error: ${message.error.message}`);
  console.log(`Processing time: ${message.processingTime}ms`);
});
```

### Diagnostic Message Format

All diagnostic messages include:
- `serviceId` - The unique service identifier
- `request` - Request details (url, method, headers, body, query)
- `timestamp` - When the event occurred (milliseconds since epoch)
- `processingTime` - How long the service took to execute (for complete/error events)
- `status` - HTTP status code (complete events only, null if fallback used)
- `fallbackUsed` - Whether a fallback response was used (complete events only)
- `error` - Error details including message and code (error events only)

## Running Tests

```bash
npm test
```

Tests use Node.js native test runner (`node --test`).

## License

MIT
