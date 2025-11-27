import { test } from 'node:test';
import * as assert from 'node:assert';
import { interpolateObject } from '../src/interpolation.js';
import type { OrchestrationContext } from '../src/types.js';

test('JSONata Integration - Basic Path Resolution', async t => {
  await t.test('should resolve simple paths with JSONata backend', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        status: 200,
        body: { userId: 123, name: 'John' },
      },
    } as any;

    assert.strictEqual(await interpolateObject('{$service.status}', context), 200);
    assert.strictEqual(await interpolateObject('{$service.body.userId}', context), 123);
    assert.strictEqual(await interpolateObject('{$service.body.name}', context), 'John');
  });

  await t.test('should handle bracket notation with JSONata', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        body: { 'custom:field': 'customValue', 'another-field': 'anotherValue' },
      },
    } as any;

    assert.strictEqual(await interpolateObject("{$service.body['custom:field']}", context), 'customValue');
    assert.strictEqual(await interpolateObject('{$service.body["another-field"]}', context), 'anotherValue');
  });

  await t.test('should handle array indices with JSONata', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        items: ['first', 'second', 'third'],
      },
    } as any;

    assert.strictEqual(await interpolateObject('{$service.items.0}', context), 'first');
    assert.strictEqual(await interpolateObject('{$service.items.1}', context), 'second');
    assert.strictEqual(await interpolateObject('{$service.items.2}', context), 'third');
  });
});

test('JSONata Integration - Type Preservation', async t => {
  await t.test('should preserve number types in interpolateObject', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        status: 200,
        count: 42,
      },
    } as any;

    // Single token should preserve type
    const result = await interpolateObject('{$service.status}', context);
    assert.strictEqual(result, 200);
    assert.strictEqual(typeof result, 'number');
  });

  await t.test('should preserve boolean types in interpolateObject', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        success: true,
        cached: false,
      },
    } as any;

    const resultTrue = await interpolateObject('{$service.success}', context);
    assert.strictEqual(resultTrue, true);
    assert.strictEqual(typeof resultTrue, 'boolean');

    const resultFalse = await interpolateObject('{$service.cached}', context);
    assert.strictEqual(resultFalse, false);
    assert.strictEqual(typeof resultFalse, 'boolean');
  });

  await t.test('should preserve object types in interpolateObject', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        body: { userId: 123, name: 'John' },
      },
    } as any;

    // Single token returning object should preserve object type
    const result = await interpolateObject('{$service.body}', context);
    assert.deepStrictEqual(result, { userId: 123, name: 'John' });
    assert.strictEqual(typeof result, 'object');
  });

  await t.test('should preserve array types in interpolateObject', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        items: [1, 2, 3],
      },
    } as any;

    // Single token returning array should preserve array type
    const result = await interpolateObject('{$service.items}', context);
    assert.deepStrictEqual(result, [1, 2, 3]);
    assert.strictEqual(Array.isArray(result), true);
  });
});

test('JSONata Integration - Deep Nesting', async t => {
  await t.test('should handle deeply nested paths', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        response: {
          data: {
            user: {
              profile: {
                name: 'Alice',
                email: 'alice@example.com',
              },
            },
          },
        },
      },
    } as any;

    assert.strictEqual(await interpolateObject('{$service.response.data.user.profile.name}', context), 'Alice');
    assert.strictEqual(await interpolateObject('{$service.response.data.user.profile.email}', context), 'alice@example.com');
  });

  await t.test('should handle mixed arrays and objects', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        data: {
          users: [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }],
        },
      },
    } as any;

    assert.strictEqual(await interpolateObject('{$service.data.users.0.name}', context), 'Alice');
    assert.strictEqual(await interpolateObject('{$service.data.users.1.id}', context), 2);
  });
});

test('JSONata Integration - Environment Variables', async t => {
  await t.test('should merge context.env and process.env correctly', async () => {
    const context: OrchestrationContext = {
      request: {},
      env: {
        API_KEY: 'secret123',
        CUSTOM_VAR: 'custom-value',
      },
    };

    // Should find in context.env
    assert.strictEqual(await interpolateObject('{$env.API_KEY}', context), 'secret123');
    assert.strictEqual(await interpolateObject('{$env.CUSTOM_VAR}', context), 'custom-value');

    // Should find in process.env (like PATH, HOME, etc.)
    const pathValue = await interpolateObject('{$env.PATH}', context);
    assert.strictEqual(typeof pathValue, 'string');
    assert.ok(pathValue.length > 0);
  });
});

test('JSONata Integration - Complex Interpolation', async t => {
  await t.test('should handle multiple tokens in single string', async () => {
    const context: OrchestrationContext = {
      request: {},
      service1: { body: { userId: 123 } },
      service2: { body: { token: 'abc456' } },
    } as any;

    const result = await interpolateObject('userId={$service1.body.userId}&token={$service2.body.token}', context);
    assert.strictEqual(result, 'userId=123&token=abc456');
  });

  await t.test('should handle text before, after, and between tokens', async () => {
    const context: OrchestrationContext = {
      request: {},
      env: {
        HOST: 'api.example.com',
        PORT: '8080',
      },
    };

    const url = await interpolateObject('https://{$env.HOST}:{$env.PORT}/api/v1', context);
    assert.strictEqual(url, 'https://api.example.com:8080/api/v1');
  });

  await t.test('should handle complex URL construction', async () => {
    const context: OrchestrationContext = {
      request: { body: { userId: 456 } },
      env: {
        API_BASE: 'https://api.example.com',
      },
    };

    const url = await interpolateObject('{$env.API_BASE}/users/{$request.body.userId}', context);
    assert.strictEqual(url, 'https://api.example.com/users/456');
  });
});

test('JSONata Integration - Error Handling', async t => {
  await t.test('should return original token for undefined context keys', async () => {
    const context: OrchestrationContext = {
      request: {},
    };

    assert.strictEqual(await interpolateObject('{$undefined.path}', context), '{$undefined.path}');
  });

  await t.test('should return original token for missing nested properties', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: { body: { id: 123 } },
    } as any;

    assert.strictEqual(await interpolateObject('{$service.missing.property}', context), '{$service.missing.property}');
  });

  await t.test('should handle null and undefined values gracefully', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        nullValue: null,
        undefinedValue: undefined,
      },
    } as any;

    // null is a valid value, so it should be returned as is
    assert.strictEqual(await interpolateObject('{$service.nullValue}', context), null);
    // undefined should return original token
    assert.strictEqual(await interpolateObject('{$service.undefinedValue}', context), '{$service.undefinedValue}');
  });
});

test('JSONata Integration - InterpolateObject with Complex Structures', async t => {
  await t.test('should interpolate objects recursively', async () => {
    const context: OrchestrationContext = {
      request: {},
      auth: { token: 'abc123' },
      user: { id: 456, name: 'John' },
    } as any;

    const config = {
      headers: {
        authorization: '{$auth.token}',
      },
      query: {
        userId: '{$user.id}',
        name: '{$user.name}',
      },
    };

    const result = await interpolateObject(config, context);
    // Note: Single token {$user.id} preserves the number type (456, not '456')
    assert.deepStrictEqual(result, {
      headers: {
        authorization: 'abc123',
      },
      query: {
        userId: 456, // Type preserved for single token
        name: 'John',
      },
    });
  });

  await t.test('should interpolate arrays recursively', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: { id: 'svc1', name: 'Service 1' },
    } as any;

    const config = [
      '{$service.id}',
      '{$service.name}',
      'static-value',
    ];

    const result = await interpolateObject(config, context);
    assert.deepStrictEqual(result, ['svc1', 'Service 1', 'static-value']);
  });

  await t.test('should preserve types in nested structures', async () => {
    const context: OrchestrationContext = {
      request: {},
      api: {
        response: {
          status: 200,
          body: { items: [1, 2, 3] },
        },
      },
    } as any;

    const config = {
      statusCode: '{$api.response.status}', // Single token, should preserve number
      items: '{$api.response.body.items}', // Single token, should preserve array
      message: 'Status: {$api.response.status}', // Mixed text, should be string
    };

    const result = await interpolateObject(config, context);
    assert.strictEqual(result.statusCode, 200);
    assert.strictEqual(typeof result.statusCode, 'number');
    assert.deepStrictEqual(result.items, [1, 2, 3]);
    assert.strictEqual(Array.isArray(result.items), true);
    assert.strictEqual(result.message, 'Status: 200');
    assert.strictEqual(typeof result.message, 'string');
  });
});
