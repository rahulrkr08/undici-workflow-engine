# Service Configuration

Complete guide to configuring services in undici-workflow-engine.

## Service Block

```typescript
interface ServiceBlock {
  id: string;              // Unique identifier for this service
  dependsOn?: string[];    // Array of service IDs this service depends on
  service: ServiceConfig;  // Service configuration
}
```

### Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | `string` | Yes | Unique identifier used in dependencies and variable interpolation |
| `dependsOn` | `string[]` | No | Service IDs that must complete before this service runs |
| `service` | `ServiceConfig` | Yes | HTTP service configuration |

### Example

```typescript
{
  id: 'fetchUserData',
  dependsOn: ['authenticate'],
  service: {
    url: 'https://api.example.com/user',
    method: 'GET',
  }
}
```

## Service Configuration

```typescript
interface ServiceConfig {
  url: string;
  method: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  query?: Record<string, string>;
  body?: any;
  timeout?: number;
  fallback?: { data: any };
  oidc?: {
    clientId: string;
    clientSecret: string;
    scope?: string;
    tokenUrl?: string;
  };
}
```

### URL

The endpoint to call. Supports variable interpolation.

```typescript
// Static URL
url: 'https://api.example.com/users'

// Dynamic URL with interpolation
url: 'https://api.example.com/users/{$request.body.userId}'
```

### Method

HTTP method for the request. Supports all standard methods.

```typescript
method: 'GET'    // Retrieve data
method: 'POST'   // Create data
method: 'PUT'    // Update data (full)
method: 'PATCH'  // Update data (partial)
method: 'DELETE' // Delete data
method: 'HEAD'   // Like GET but without body
```

### Headers

HTTP headers for the request. All values support variable interpolation.

```typescript
headers: {
  'content-type': 'application/json',
  'authorization': '{$env.BEARER_TOKEN}',
  'x-user-id': '{$request.body.userId}',
  'x-request-id': '{$authenticate.body.requestId}',
}
```

### Cookies

HTTP cookies to send with the request. Values support variable interpolation.

```typescript
cookies: {
  'sessionId': '{$request.cookies.sessionId}',
  'preferences': '{$settings.body.preferences}',
  'locale': 'en-US',
}
```

### Query

URL query parameters. All values are strings and support variable interpolation.

```typescript
query: {
  'page': '1',
  'limit': '50',
  'filter': '{$request.body.status}',
  'userId': '{$getUserId.body.id}',
}
```

### Body

Request body for POST/PUT/PATCH requests. Supports variable interpolation on all string values.

```typescript
// Simple object
body: {
  email: 'user@example.com',
  name: 'John Doe',
}

// With interpolation
body: {
  email: '{$request.body.email}',
  userId: '{$authenticate.body.id}',
  roles: ['admin', 'user'],
}

// Nested objects
body: {
  user: {
    name: '{$request.body.name}',
    email: '{$request.body.email}',
  },
  settings: {
    theme: '{$userSettings.body.theme}',
    notifications: true,
  },
  tags: ['vip', 'verified'],
}
```

### Timeout

Request timeout in milliseconds. Default is 30000ms (30 seconds).

```typescript
timeout: 5000    // 5 seconds
timeout: 30000   // 30 seconds (default)
timeout: 60000   // 1 minute
```

### Fallback

Fallback response data to use if the service request fails. The fallback is returned in place of an error response.

```typescript
fallback: {
  data: {
    status: 'unavailable',
    message: 'Service temporarily unavailable',
    items: [],
  }
}
```

When a fallback is used:
- `status` is `null`
- `body` contains the fallback data
- `fallbackUsed` is `true`
- The service is still considered to have completed successfully for dependency purposes

### OIDC (Node.js only)

Enable OIDC authentication for the service. The orchestrator will automatically handle token acquisition and injection.

```typescript
oidc: {
  clientId: '$env.OIDC_CLIENT_ID',
  clientSecret: '$env.OIDC_CLIENT_SECRET',
  scope: 'openid profile email',
  tokenUrl: 'https://auth.example.com/token',
}
```

The `Authorization: Bearer <token>` header is automatically added.

**Note:** OIDC authentication is fully supported via the `undici-oidc-interceptor` package.

## Execution Order

Services execute in dependency order:

1. Services with no `dependsOn` run first in parallel
2. Services are queued when their dependencies complete
3. Services that depend on multiple services wait for all to complete
4. If any service fails without a fallback, dependent services still execute

### Example Execution Order

```typescript
[
  {
    id: 'service01',
    service: { url: '...', method: 'GET' },
  },
  {
    id: 'service02',
    dependsOn: ['service01'],
    service: { url: '...', method: 'POST' },
  },
  {
    id: 'service03',
    dependsOn: ['service01'],
    service: { url: '...', method: 'POST' },
  },
  {
    id: 'service04',
    dependsOn: ['service02', 'service03'],
    service: { url: '...', method: 'POST' },
  },
]
```

**Execution Flow:**
```
service01 (executes first)
  ↓
service02 (starts) + service03 (starts) [parallel, both depend on service01]
  ↓
service04 (starts after both service02 and service03 complete)
```

## Variable Interpolation

All string values in headers, cookies, query, body, and URLs support variable interpolation using the flexible `{$<contextKey>.path}` syntax with curly braces.

The context key can be any root-level property in the context object. Supports text before, after, and between tokens.

### Syntax

```typescript
{$<contextKey>.path.to.value}
```

### Examples

```typescript
// Service results
'{$authenticate.body.token}'
'{$getUserData.body.user.id}'
'{$getUser.body.id}'

// Request context
'{$request.body.email}'
'{$request.headers.authorization}'
'{$request.cookies.sessionId}'

// Environment variables
'{$env.API_KEY}'
'{$env.OIDC_CLIENT_ID}'

// Custom context keys
'{$customData.token}'
'{$auth.token}'

// Bracket notation for special characters
'{$serviceId.body["custom:field"]}'
'{$serviceId.body["field-with-dash"]}'

// Text before, after, and between tokens
'https://{$env.HOST}/api/{$request.id}'
'user_{$request.body.userId}'
'{$env.PROTOCOL}://{$env.HOST}:{$env.PORT}'
```

## Complete Examples

### Simple GET Request

```typescript
{
  id: 'getUser',
  service: {
    url: 'https://api.example.com/users/123',
    method: 'GET',
    headers: {
      'authorization': '{$env.BEARER_TOKEN}',
    },
  }
}
```

### POST Request with Body Interpolation

```typescript
{
  id: 'createRecord',
  dependsOn: ['getUser'],
  service: {
    url: 'https://api.example.com/records',
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-user-id': '{$getUser.body.id}',
    },
    body: {
      userId: '{$getUser.body.id}',
      name: '{$request.body.name}',
      email: '{$request.body.email}',
    },
  }
}
```

### Request with Query Parameters and Fallback

```typescript
{
  id: 'searchData',
  service: {
    url: 'https://api.example.com/search',
    method: 'GET',
    query: {
      q: '{$request.body.query}',
      limit: '50',
      offset: '0',
    },
    timeout: 10000,
    fallback: {
      data: {
        results: [],
        total: 0,
      }
    },
  }
}
```

### Service with OIDC Authentication (Node.js)

```typescript
{
  id: 'protectedResource',
  service: {
    url: 'https://api.example.com/protected',
    method: 'GET',
    oidc: {
      clientId: '{$env.OIDC_CLIENT_ID}',
      clientSecret: '{$env.OIDC_CLIENT_SECRET}',
      scope: 'openid profile email',
      tokenUrl: 'https://auth.example.com/token',
    },
  }
}
```

### Complex Request with Nested Body

```typescript
{
  id: 'submitForm',
  dependsOn: ['authenticate', 'validateData'],
  service: {
    url: 'https://api.example.com/submit',
    method: 'POST',
    headers: {
      'authorization': '{$authenticate.body.token}',
      'x-validation-token': '{$validateData.body.token}',
    },
    body: {
      user: {
        id: '{$authenticate.body.userId}',
        email: '{$request.body.email}',
      },
      data: {
        values: '{$validateData.body.validatedValues}',
      },
      metadata: {
        timestamp: '{$request.body.timestamp}',
        locale: '{$env.LOCALE}',
      },
    },
    timeout: 15000,
    fallback: {
      data: { queued: true },
    },
  }
}
```

## Tips

1. **Use sensible timeouts** - Set appropriate timeouts for different services
2. **Always have fallbacks for critical paths** - If a service might fail, provide a fallback
3. **Organize dependencies** - Use clear naming to understand the flow (`authenticate`, `getUserData`, `createRecord`)
4. **Use environment variables** - Keep secrets in environment variables, not in configs
5. **Use OIDC for secure authentication** - OIDC authentication is fully supported and recommended for secure service-to-service communication
