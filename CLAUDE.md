# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**undici-workflow-engine** is a dependency-aware, declarative service orchestrator that orchestrates HTTP services with variable interpolation and fallback support. It's built on top of Undici (Node.js' modern HTTP client) and async-flow-orchestrator for dependency management.

**Key Features:**
- Service dependency orchestration (topological sorting)
- Variable interpolation using `{$<contextKey>.path}` syntax
- Fallback responses for failed services
- OIDC authentication support (via undici-oidc-interceptor)
- Automatic Set-Cookie extraction and cookie management
- 98.32% code coverage with 164 comprehensive tests

## Architecture Overview

### Core Modules

**1. types.ts** - Type definitions
- `ServiceConfig` - Individual HTTP service configuration
- `ServiceBlock` - Service with dependencies (id, dependsOn, service)
- `OrchestrationContext` - Runtime context object passed through execution
  - Properties: `request`, `env`, and dynamically added service results
  - Service results added as: `context[serviceId] = ServiceResult`
- `ServiceResult` - Response from a service (status, body, headers, cookies, error, fallbackUsed)
- `OrchestrationResult` - Final orchestration output (context, services)

**2. orchestrator.ts** - Main orchestration engine
- `runOrchestration(services, context)` - Executes the entire workflow
- Uses `async-flow-orchestrator` to manage dependencies
- Flow:
  1. Converts ServiceBlocks to Process objects for async-flow-orchestrator
  2. For each service: interpolate config → execute → return result
  3. Context is passed through the workflow and updated with results
  4. Returns final context and services map

**3. executor.ts** - Single service execution
- `executeService(config)` - Executes one HTTP request using Undici
- Handles:
  - Query parameters (URLSearchParams)
  - Headers and cookies
  - Request body (JSON stringify)
  - OIDC authentication (via undici-oidc-interceptor decorator)
  - Response parsing (JSON, text, empty)
  - Set-Cookie header extraction (regex: `/^([^=]+)=([^;]+)/`)
  - Error handling and fallback logic
  - Timeout support

**4. interpolation.ts** - Variable interpolation
- `interpolateValue(value, context)` - Interpolates string with tokens
  - Pattern: `{$<contextKey>.path.to.value}` (curly braces required)
  - Supports text before/after/between tokens: `{$env.HOST}/api/{$request.id}`
  - Special handling for `{$env}` (checks context.env and process.env)
  - Uses `resolvePath()` for nested property access
  - Supports bracket notation: `{$service.body["custom:field"]}`
  - Returns string with tokens replaced; unresolved tokens remain unchanged
- `interpolateObject(obj, context)` - Recursively interpolates object/array
  - Single complete token (e.g., `{$service.items}`) returns original type
  - Mixed text or multiple tokens (e.g., `{$a}-{$b}`) returns string
- `cookiesToHeader(cookies)` - Converts cookies object to "Cookie" header string
- `buildQueryString(query)` - Converts query object to URL search params

**5. diagnostics.ts** - Diagnostic channel events
- `channels.start` - Emitted when service execution begins
- `channels.complete` - Emitted when service execution completes successfully
- `channels.error` - Emitted when service execution fails
- `emitServiceStart(serviceId, config, context)` - Emit service start event
- `emitServiceComplete(serviceId, config, context, processingTime, status, fallbackUsed)` - Emit completion event
- `emitServiceError(serviceId, config, context, processingTime, error)` - Emit error event

### Variable Interpolation Syntax

Tokens are wrapped in curly braces: `{$<contextKey>.path.to.value}`

The context key can be any root-level property in the context object. Supports text before, after, and between tokens.

```typescript
// Service results (service ID is the context key)
userId: '{$authenticate.body.id}'
token: '{$getUserData.body.token}'

// Request context
email: '{$request.body.email}'
authorization: '{$request.headers.authorization}'

// Environment variables
apiKey: '{$env.API_KEY}'

// Custom context keys
customField: '{$customData.token}'

// Bracket notation for special characters
field: '{$serviceId.body["custom:field"]}'

// URL construction with text
url: '{$env.HOST}/api/users/{$request.body.userId}'

// Multiple tokens in one string
fullUrl: 'https://{$env.HOST}:{$env.PORT}/api/{$request.id}'

// Query string with interpolation
query: '?token={$auth.token}&id={$user.id}'
```

## Development Commands

```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Run all tests with coverage
npm test

# Run single test file
npx borp tests/executor.test.ts

# Run tests matching pattern
npx borp tests/orchestrator.test.ts --grep "dependencies"

# TypeScript check only (no build)
npx tsc --noEmit
```

## Testing Strategy

**Test Files (164 tests total):**
1. `executor.test.ts` (43 tests) - HTTP operations, query params, headers, cookies, error handling
2. `executor-cookies.test.ts` (22 tests) - Set-Cookie extraction and handling (100% coverage of lines 102-110)
3. `interpolation.test.ts` (32 tests) - Variable interpolation with curly braces, all context keys, and edge cases
4. `orchestrator.test.ts` (29 tests) - Dependency execution, error handling, recovery patterns, interpolation
5. `oidc-coverage.test.ts` (12 tests) - OIDC token flow, caching, refresh
6. `oidc-workflow.test.ts` (15 tests) - OIDC in orchestration contexts
7. `integration.test.ts` (11 tests) - End-to-end workflows with real public APIs

**Test Infrastructure:**
- Node.js native test runner (`node:test`)
- Test framework: Node's built-in `assert` module
- Mocking: `MockServer` class in `helpers.ts` for HTTP mocking
- OIDC mocking: `MockOIDCProvider` in `oidc-helper.ts`
- Coverage tool: borp (with v8 coverage)

**Key Test Patterns:**
- Executor tests use `MockServer` for isolated, fast testing
- Orchestrator tests use hardcoded URLs with MockAgent
- Integration tests use real public APIs (JSONPlaceholder)
- All mocked tests run in milliseconds; integration tests take ~10s

## Important Implementation Details

### Service Execution Order

Services are executed in dependency order using async-flow-orchestrator:

```
1. Services with no dependsOn run first (in parallel)
2. When dependencies complete, dependent services queue up
3. Multiple services can wait on same dependency (parallel execution)
4. Error handling: Failed services don't block dependents (errorStrategy: 'silent')
```

### Context and State Management

- Initial context provided to `runOrchestration()`
- Each service's result is added to context: `context[serviceId] = result`
- Context is passed through the workflow and available for interpolation
- Service results have structure: `{ status, body, headers, cookies, error, fallbackUsed }`
- Final result: `{ context, services }` where services is a filtered map

### OIDC Authentication

- Configured per-service in `ServiceConfig.oidc`
- Properties: `clientId`, `clientSecret`, `scope`, `tokenUrl`
- All values support interpolation: `clientId: '{$env.OIDC_CLIENT_ID}'`
- Automatically handled via `undici-oidc-interceptor` decorator
- Token stored in response headers as `Authorization: Bearer <token>`
- Fully type-safe with TestOIDCProvider for testing

### Set-Cookie Extraction

Located in `executor.ts` lines 102-110:
- Regex pattern: `/^([^=]+)=([^;]+)/` (matches name=value before first semicolon)
- Handles single and multiple Set-Cookie headers
- Returns cookies object: `{ name1: value1, name2: value2, ... }`
- Empty values are skipped (regex doesn't match empty strings)
- Works on all HTTP status codes (2xx, 3xx, 4xx, 5xx)

### Error Handling

**Service Failures:**
1. If service has `fallback`, use `fallback.data` as response body, `status: null`
2. If no fallback, return error in result, orchestration continues (errorStrategy: 'silent')
3. Dependent services still execute even if dependency fails

**Timeout Behavior:**
- Default timeout: 30000ms (30 seconds)
- Configurable per-service: `timeout: 5000`
- Undici timeout handling (uses AbortSignal)

## Code Coverage

Current coverage: **98.32%** (all functions at 100%)

- `executor.ts`: 100% (all lines, branches, functions)
- `interpolation.ts`: 97.46% (lines 87-88, 123-124 uncovered - edge case handling in interpolateObject)
- `orchestrator.ts`: 96.77% (lines 60-61 uncovered - error recovery edge cases)

**Coverage Gaps:**
- Interpolation lines 87-88, 123-124: Edge case handling in interpolateObject for undefined context
- Orchestrator lines 60-61: Empty services array handling

## Documentation Files

- **README.md** - Quick start, API reference, examples, features
- **SERVICE_CONFIG.md** - Complete configuration reference with all options
- **TESTING.md** - Test structure, coverage metrics, best practices
- **CLAUDE.md** - This file (architecture and development guidance)

## Common Tasks

### Adding a New Test

1. Create file in `tests/` with `.test.ts` extension
2. Use Node's `test()` and `assert` modules
3. For HTTP mocking, use `MockServer` from helpers.ts
4. Run: `npx borp tests/your-test.test.ts`
5. Run full suite: `npm test`

### Fixing a Type Error

1. Check `src/types.ts` for interface definitions
2. TypeScript strict mode is enabled - all types must be exact
3. Service result type is `ServiceResult` (status, body, headers, cookies, error, fallbackUsed)
4. Context type is `OrchestrationContext` (request, env, and service IDs as keys)

### Debugging Test Failures

1. Check error message for which test failed
2. Look at test file to understand what's being tested
3. For interpolation issues, verify `{$contextKey.path}` syntax with curly braces is correct
4. For execution order issues, check `dependsOn` array and dependencies
5. Use console.log in test to debug (visible in test output)

### Updating Interpolation Logic

Core interpolation is in `interpolation.ts`:
- `interpolateValue()` - Replaces tokens in strings (returns string)
  - Pattern: `{$<contextKey>.path.to.value}` with curly braces
  - Supports multiple tokens and text before/after
  - Unresolved tokens remain unchanged in output
- `interpolateObject()` - Recursive for objects/arrays (preserves types)
  - Single token `{$key.path}` returns resolved value with original type
  - Multiple tokens or mixed text returns string
- `resolvePath()` - Property path resolution with bracket notation

Pattern matching uses curly braces: `{$<contextKey>.path}`
- Requires curly braces `{}` to delimit tokens
- Requires `$` prefix and valid identifier for contextKey
- Supports bracket notation for special characters in path: `{$service.body["custom:field"]}`
- Returns original token if context key not found
- Supports text before/after: `prefix-{$key}-suffix`

### Adding OIDC to a Service

```typescript
{
  id: 'protectedService',
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

All OIDC properties support interpolation using the `{$<contextKey>.path}` syntax.

### Monitoring with Diagnostic Channels

To monitor service execution, subscribe to diagnostic channels:

```typescript
import { diagnosticsChannel } from 'node:diagnostics_channel';

// Monitor service start events
const startChannel = diagnosticsChannel.channel('workflow:service:start');
startChannel.subscribe((message) => {
  console.log(`Service ${message.serviceId} starting...`);
  console.log(`  URL: ${message.request.url}`);
  console.log(`  Method: ${message.request.method}`);
});

// Monitor service completion events
const completeChannel = diagnosticsChannel.channel('workflow:service:complete');
completeChannel.subscribe((message) => {
  console.log(`Service ${message.serviceId} completed in ${message.processingTime}ms`);
  console.log(`  Status: ${message.status}`);
  if (message.fallbackUsed) {
    console.log('  (Using fallback response)');
  }
});

// Monitor service error events
const errorChannel = diagnosticsChannel.channel('workflow:service:error');
errorChannel.subscribe((message) => {
  console.error(`Service ${message.serviceId} failed after ${message.processingTime}ms`);
  console.error(`  Error: ${message.error.message}`);
});
```

The diagnostic channels are emitted in [diagnostics.ts](src/diagnostics.ts) and provide detailed insight into service execution without modifying application code.

## Key Files to Know

- `src/types.ts` - Start here to understand data structures
- `src/orchestrator.ts` - Main entry point (`runOrchestration`)
- `src/executor.ts` - HTTP request execution and response handling
- `src/interpolation.ts` - Context variable resolution
- `src/diagnostics.ts` - Diagnostic channel events for monitoring
- `tests/helpers.ts` - MockServer class for test mocking
- `package.json` - Dependencies and scripts
- `tsconfig.json` - TypeScript configuration (strict mode enabled)

## Node Version

Minimum: Node.js 18.0.0 (for Undici support)
Recommended: Node.js 20+ (latest LTS)

## Dependencies to Know

- **undici** - High-performance HTTP client (Undici.request, Agent)
- **async-flow-orchestrator** - Dependency orchestration engine (executeWorkflow, Process)
- **undici-oidc-interceptor** - OIDC authentication decorator for Undici
- **@types/node** - TypeScript types for Node.js
- **typescript** - TypeScript compiler (strict mode)
- **borp** - Test runner with built-in coverage
