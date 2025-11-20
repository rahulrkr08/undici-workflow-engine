import { test } from 'node:test';
import * as assert from 'node:assert';
import { interpolateValue, interpolateObject, cookiesToHeader, buildQueryString } from '../src/interpolation.js';
import type { OrchestrationContext } from '../src/types.js';

test('Interpolation - interpolateValue', async t => {
  await t.test('should return non-string values unchanged', () => {
    const context: OrchestrationContext = {
      request: {},
    };

    assert.strictEqual(interpolateValue(123, context), 123);
    assert.strictEqual(interpolateValue(true, context), true);
    assert.deepStrictEqual(interpolateValue({ key: 'value' }, context), { key: 'value' });
    assert.deepStrictEqual(interpolateValue([1, 2, 3], context), [1, 2, 3]);
    assert.strictEqual(interpolateValue(null, context), null);
  });

  await t.test('should handle {$env} variables', () => {
    const context: OrchestrationContext = {
      request: {},
      env: {
        API_KEY: 'secret123',
        DEBUG: 'true',
      },
    };

    assert.strictEqual(interpolateValue('{$env.API_KEY}', context), 'secret123');
    assert.strictEqual(interpolateValue('{$env.DEBUG}', context), 'true');
    assert.strictEqual(interpolateValue('{$env.MISSING}', context), '{$env.MISSING}');
    assert.strictEqual(interpolateValue('{$env.API_KEY}/hello', context), 'secret123/hello');
  });

  await t.test('should handle {$service} variables', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        status: 200,
        body: { userId: 123, name: 'John' },
      },
    } as any;

    assert.strictEqual(interpolateValue('{$service01.status}', context), '200');
    assert.strictEqual(interpolateValue('{$service01.body.userId}', context), '123');
    assert.strictEqual(interpolateValue('{$service01.body.name}', context), 'John');
  });

  await t.test('should handle {$request} variables', () => {
    const context: OrchestrationContext = {
      request: {
        body: { email: 'test@example.com' },
        headers: { 'x-custom': 'value' },
      },
    };

    assert.strictEqual(interpolateValue('{$request.body.email}', context), 'test@example.com');
    assert.strictEqual(interpolateValue('{$request.headers.x-custom}', context), 'value');
  });

  await t.test('should handle any custom context keys', () => {
    const context: OrchestrationContext = {
      request: {},
      customData: {
        value: 'custom123',
        nested: { field: 'nestedValue' },
      },
    } as any;

    assert.strictEqual(interpolateValue('{$customData.value}', context), 'custom123');
    assert.strictEqual(interpolateValue('{$customData.nested.field}', context), 'nestedValue');
  });

  await t.test('should handle bracket notation', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        body: { 'custom:field': 'customValue', 'another-field': 'anotherValue' },
      },
    } as any;

    assert.strictEqual(interpolateValue("{$service01.body['custom:field']}", context), 'customValue');
    assert.strictEqual(interpolateValue('{$service01.body["another-field"]}', context), 'anotherValue');
  });

  await t.test('should return original value for plain strings', () => {
    const context: OrchestrationContext = {
      request: {},
    };

    assert.strictEqual(interpolateValue('plain text', context), 'plain text');
    assert.strictEqual(interpolateValue('http://example.com', context), 'http://example.com');
  });

  await t.test('should handle context keys without path', () => {
    const context: OrchestrationContext = {
      request: {},
      auth: { token: 'abc123' },
    } as any;

    // When using interpolateObject (which preserves types), this returns the object
    // When using interpolateValue directly on a string with the token, it converts to string
    const result = interpolateValue('{$auth}', context);
    assert.strictEqual(result, '[object Object]');

    // But with interpolateObject, it returns the original object type
    const result2 = interpolateObject('{$auth}', context);
    assert.deepStrictEqual(result2, { token: 'abc123' });
  });
});

test('Interpolation - interpolateObject', async t => {
  await t.test('should interpolate all values in object', () => {
    const context: OrchestrationContext = {
      request: {
        body: { userId: 123 },
      },
      env: {
        API_KEY: 'secret',
      },
      service01: {
        body: { token: 'abc123' },
      },
    } as any;

    const input = {
      headers: {
        'x-api-key': '{$env.API_KEY}',
        'x-user-id': '{$request.body.userId}',
      },
      query: {
        token: '{$service01.body.token}',
      },
      data: 'plain string',
    };

    const result = interpolateObject(input, context);

    assert.strictEqual(result.headers['x-api-key'], 'secret');
    assert.strictEqual(result.headers['x-user-id'], 123);  // Returns number type
    assert.strictEqual(result.query.token, 'abc123');
    assert.strictEqual(result.data, 'plain string');
  });

  await t.test('should interpolate arrays', () => {
    const context: OrchestrationContext = {
      request: {},
      env: {
        VALUE1: 'first',
        VALUE2: 'second',
      },
    };

    const input = ['{$env.VALUE1}', '{$env.VALUE2}', 'plain'];
    const result = interpolateObject(input, context);

    assert.deepStrictEqual(result, ['first', 'second', 'plain']);
  });

  await t.test('should handle nested objects and arrays', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        body: {
          items: [
            { id: 1, name: 'item1' },
            { id: 2, name: 'item2' },
          ],
        },
      },
    };

    const input = {
      data: {
        nested: {
          items: '{$service01.body.items}',
        },
      },
    };

    const result = interpolateObject(input, context);

    // When a token is single and complete, it returns the original type (array in this case)
    assert.deepStrictEqual(result.data.nested.items, [
      { id: 1, name: 'item1' },
      { id: 2, name: 'item2' },
    ]);
  });

  await t.test('should handle null and undefined values', () => {
    const context: OrchestrationContext = {
      request: {},
    };

    assert.strictEqual(interpolateObject(null, context), null);
    assert.strictEqual(interpolateObject(undefined, context), undefined);
  });

  await t.test('should preserve non-string values', () => {
    const context: OrchestrationContext = {
      request: {},
    };

    const input = {
      string: 'text',
      number: 42,
      boolean: true,
      object: { key: 'value' },
      array: [1, 2, 3],
    };

    const result = interpolateObject(input, context);

    assert.deepStrictEqual(result, input);
  });
});

test('Interpolation - edge cases', async t => {
  await t.test('should handle undefined service references', () => {
    const context: OrchestrationContext = {
      request: {},
    };

    const result = interpolateValue('{$service.nonexistent.body}', context);
    assert.strictEqual(result, '{$service.nonexistent.body}');
  });

  await t.test('should handle missing nested properties', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        body: { field: 'value' },
      },
    };

    const result = interpolateValue('{$service01.body.missing.nested}', context);
    assert.strictEqual(result, '{$service01.body.missing.nested}');
  });

  await t.test('should handle empty context', () => {
    const context: OrchestrationContext = {
      request: {},
    };

    assert.strictEqual(interpolateValue('{$env.MISSING}', context), '{$env.MISSING}');
    assert.strictEqual(interpolateValue('{$request.body}', context), '{$request.body}');
  });
});

test('Interpolation - cookiesToHeader', async t => {
  await t.test('should convert cookies object to header string', () => {
    const cookies = { sessionId: 'abc123', userId: '42' };
    const result = cookiesToHeader(cookies);

    assert.strictEqual(result, 'sessionId=abc123; userId=42');
  });

  await t.test('should handle single cookie', () => {
    const cookies = { token: 'xyz789' };
    const result = cookiesToHeader(cookies);

    assert.strictEqual(result, 'token=xyz789');
  });

  await t.test('should handle empty cookies', () => {
    const cookies = {};
    const result = cookiesToHeader(cookies);

    assert.strictEqual(result, '');
  });

  await t.test('should handle special characters in cookie values', () => {
    const cookies = { auth: 'Bearer token=xyz' };
    const result = cookiesToHeader(cookies);

    assert.strictEqual(result, 'auth=Bearer token=xyz');
  });

  await t.test('should handle multiple cookies with various values', () => {
    const cookies = {
      sessionId: 'abc123',
      userId: '42',
      preferences: 'darkmode',
      token: 'Bearer xyz789',
    };
    const result = cookiesToHeader(cookies);

    // Result should contain all cookies
    assert.ok(result.includes('sessionId=abc123'));
    assert.ok(result.includes('userId=42'));
    assert.ok(result.includes('preferences=darkmode'));
    assert.ok(result.includes('token=Bearer xyz789'));
    assert.ok(result.includes('; '));
  });
});

test('Interpolation - buildQueryString', async t => {
  await t.test('should convert query object to URL search params', () => {
    const query = { id: '1', limit: '10' };
    const result = buildQueryString(query);

    // URLSearchParams sorts keys, so check both possible orders
    assert.ok(result === 'id=1&limit=10' || result === 'limit=10&id=1');
  });

  await t.test('should handle single query parameter', () => {
    const query = { userId: '42' };
    const result = buildQueryString(query);

    assert.strictEqual(result, 'userId=42');
  });

  await t.test('should handle empty query', () => {
    const query = {};
    const result = buildQueryString(query);

    assert.strictEqual(result, '');
  });

  await t.test('should encode special characters in query values', () => {
    const query = { search: 'hello world', email: 'test@example.com' };
    const result = buildQueryString(query);

    // URLSearchParams should encode spaces and special chars
    assert.ok(result.includes('hello+world') || result.includes('hello%20world'));
    assert.ok(result.includes('test%40example.com'));
  });

  await t.test('should handle multiple query parameters', () => {
    const query = { userId: '1', sort: 'id', order: 'asc', limit: '10' };
    const result = buildQueryString(query);

    // Check all parameters are present
    assert.ok(result.includes('userId=1'));
    assert.ok(result.includes('sort=id'));
    assert.ok(result.includes('order=asc'));
    assert.ok(result.includes('limit=10'));
  });

  await t.test('should handle numeric and boolean-like query values', () => {
    const query = { page: '1', active: 'true', skip: '0' };
    const result = buildQueryString(query);

    assert.ok(result.includes('page=1'));
    assert.ok(result.includes('active=true'));
    assert.ok(result.includes('skip=0'));
  });
});

test('Interpolation - resolvePath edge cases', async t => {
  await t.test('should handle empty path returning data as-is', () => {
    const context: OrchestrationContext = {
      request: {},
      data: { value: 'test' },
    } as any;

    // Empty path should return the entire context value as string
    const result = interpolateValue('{$data}', context);
    assert.strictEqual(result, '[object Object]');
  });

  await t.test('should handle deeply nested paths', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        response: {
          data: {
            user: {
              profile: {
                contact: {
                  email: 'john@example.com',
                },
              },
            },
          },
        },
      },
    } as any;

    const result = interpolateValue('{$service01.response.data.user.profile.contact.email}', context);
    assert.strictEqual(result, 'john@example.com');
  });

  await t.test('should handle null intermediate values in path', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        body: null,
      },
    } as any;

    const result = interpolateValue('{$service01.body.field}', context);
    assert.strictEqual(result, '{$service01.body.field}');
  });

  await t.test('should handle undefined intermediate values in path', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        body: undefined,
      },
    } as any;

    const result = interpolateValue('{$service01.body.field}', context);
    assert.strictEqual(result, '{$service01.body.field}');
  });

  await t.test('should handle bracket notation with single quotes', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        data: {
          'custom-field': 'value1',
          'api:key': 'value2',
        },
      },
    } as any;

    const result1 = interpolateValue("{$service01.data['custom-field']}", context);
    assert.strictEqual(result1, 'value1');

    const result2 = interpolateValue("{$service01.data['api:key']}", context);
    assert.strictEqual(result2, 'value2');
  });

  await t.test('should handle bracket notation with double quotes', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        data: {
          'field-name': 'fieldValue',
          'x-header': 'headerValue',
        },
      },
    } as any;

    const result1 = interpolateValue('{$service01.data["field-name"]}', context);
    assert.strictEqual(result1, 'fieldValue');

    const result2 = interpolateValue('{$service01.data["x-header"]}', context);
    assert.strictEqual(result2, 'headerValue');
  });

  await t.test('should handle mixed bracket and dot notation', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        response: {
          'headers': {
            'content-type': 'application/json',
          },
        },
      },
    } as any;

    const result = interpolateValue("{$service01.response['headers']['content-type']}", context);
    assert.strictEqual(result, 'application/json');
  });
});

test('Interpolation - curly brace syntax', async t => {
  await t.test('should interpolate with curly braces and trailing text', () => {
    const context: OrchestrationContext = {
      request: {},
      env: {
        HOST: 'https://www.example.com',
      },
    };

    const result = interpolateValue('{$env.HOST}/hello', context);
    assert.strictEqual(result, 'https://www.example.com/hello');
  });

  await t.test('should interpolate with curly braces and leading text', () => {
    const context: OrchestrationContext = {
      request: {},
      env: {
        API: 'api',
      },
    };

    const result = interpolateValue('prefix{$env.API}', context);
    assert.strictEqual(result, 'prefixapi');
  });

  await t.test('should interpolate with curly braces and adjacent text', () => {
    const context: OrchestrationContext = {
      request: {},
      env: {
        TEXT: 'hello',
      },
    };

    const result = interpolateValue('{$env.TEXT}api', context);
    assert.strictEqual(result, 'helloapi');
  });

  await t.test('should interpolate with curly braces and special characters', () => {
    const context: OrchestrationContext = {
      request: {},
      env: {
        TEXT: 'test',
      },
    };

    const result = interpolateValue('{$env.TEXT}-api', context);
    assert.strictEqual(result, 'test-api');
  });

  await t.test('should support multiple interpolations in single string', () => {
    const context: OrchestrationContext = {
      request: {},
      env: {
        A: 'path',
        B: 'file',
      },
    };

    const result = interpolateValue('{$env.A}/{$env.B}', context);
    assert.strictEqual(result, 'path/file');
  });

  await t.test('should support complex URL with multiple interpolations', () => {
    const context: OrchestrationContext = {
      request: {
        body: { id: '123' },
      },
      env: {
        HOST: 'https://api.example.com',
      },
    };

    const result = interpolateValue('{$env.HOST}/api/users/{$request.body.id}', context);
    assert.strictEqual(result, 'https://api.example.com/api/users/123');
  });

  await t.test('should handle query strings with multiple interpolations', () => {
    const context: OrchestrationContext = {
      request: {
        body: { token: 'abc123', email: 'test@example.com' },
      },
      env: {
        API_KEY: 'key123',
      },
    };

    const result = interpolateValue('{$env.API_KEY}?token={$request.body.token}&email={$request.body.email}', context);
    assert.strictEqual(result, 'key123?token=abc123&email=test@example.com');
  });

  await t.test('should handle nested paths in curly braces', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        body: { userId: 456 },
      },
    };

    const result = interpolateValue('/users/{$service01.body.userId}', context);
    assert.strictEqual(result, '/users/456');
  });

  await t.test('should handle bracket notation in curly braces', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        data: { 'custom-field': 'value123' },
      },
    };

    const result = interpolateValue('prefix{$service01.data["custom-field"]}suffix', context);
    assert.strictEqual(result, 'prefixvalue123suffix');
  });

  await t.test('should return original token if context key not found', () => {
    const context: OrchestrationContext = {
      request: {},
    };

    const result = interpolateValue('{$missing.field}/api', context);
    assert.strictEqual(result, '{$missing.field}/api');
  });

  await t.test('should handle undefined resolved values in curly braces', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        body: { field: 'value' },
      },
    };

    const result = interpolateValue('/api/{$service01.body.missing}', context);
    assert.strictEqual(result, '/api/{$service01.body.missing}');
  });

  await t.test('should convert non-string values to strings in curly braces', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        status: 200,
      },
    };

    const result = interpolateValue('Status: {$service01.status}', context);
    assert.strictEqual(result, 'Status: 200');
  });

  await t.test('should handle consecutive interpolations', () => {
    const context: OrchestrationContext = {
      request: {},
      env: {
        A: 'hello',
        B: 'world',
      },
    };

    const result = interpolateValue('{$env.A}{$env.B}', context);
    assert.strictEqual(result, 'helloworld');
  });

  await t.test('should preserve text between tokens', () => {
    const context: OrchestrationContext = {
      request: {},
      env: {
        PROTOCOL: 'https',
        HOST: 'api.example.com',
        PORT: '8080',
      },
    };

    const result = interpolateValue('{$env.PROTOCOL}://{$env.HOST}:{$env.PORT}', context);
    assert.strictEqual(result, 'https://api.example.com:8080');
  });

  await t.test('should handle undefined context key in single token interpolation', () => {
    const context: OrchestrationContext = {
      request: {},
    };

    // Single token with undefined context key should return original
    const result = interpolateObject('{$undefinedService.body}', context);
    assert.strictEqual(result, '{$undefinedService.body}');
  });

  await t.test('should handle resolvePath with null/undefined intermediate values', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        body: null,
      },
    } as any;

    // Trying to access nested property on null should return undefined
    const result = interpolateValue('{$service01.body.field}', context);
    assert.strictEqual(result, '{$service01.body.field}');
  });

  await t.test('should return original token when context value is undefined in interpolateObject', () => {
    const context: OrchestrationContext = {
      request: {},
      // No 'missing' key
    } as any;

    const result = interpolateObject('{$missing.path.field}', context);
    assert.strictEqual(result, '{$missing.path.field}');
  });

  await t.test('should handle single token with undefined resolved value', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        body: { existingField: 'value' },
      },
    } as any;

    // Single token resolving to undefined should return original
    const result = interpolateObject('{$service01.body.nonExistent}', context);
    assert.strictEqual(result, '{$service01.body.nonExistent}');
  });

  await t.test('should preserve original type for single complete token in interpolateObject', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        body: { count: 42, active: true, items: [1, 2, 3] },
      },
    } as any;

    // Single token should preserve type (not convert to string)
    const result = interpolateObject('{$service01.body}', context);
    assert.deepStrictEqual(result, { count: 42, active: true, items: [1, 2, 3] });

    // Single number token should stay number
    const numResult = interpolateObject('{$service01.body.count}', context);
    assert.strictEqual(numResult, 42);

    // Single boolean token should stay boolean
    const boolResult = interpolateObject('{$service01.body.active}', context);
    assert.strictEqual(boolResult, true);

    // Single array token should stay array
    const arrResult = interpolateObject('{$service01.body.items}', context);
    assert.deepStrictEqual(arrResult, [1, 2, 3]);
  });

  await t.test('should handle context key without path in single token', () => {
    const context: OrchestrationContext = {
      request: {},
      auth: { token: 'secret123', user: { id: 1 } },
    } as any;

    // Single token with just context key, no path should return entire context value
    const result = interpolateObject('{$auth}', context);
    assert.deepStrictEqual(result, { token: 'secret123', user: { id: 1 } });
  });

  await t.test('should handle env variable without path in single token', () => {
    const context: OrchestrationContext = {
      request: {},
      env: { API_URL: 'https://api.example.com' },
    };

    // When using {$env} alone (without path), interpolateValue converts to string
    const result = interpolateValue('{$env}', context);
    // {$env} alone doesn't match the pattern since it needs a path like {$env.KEY}
    assert.strictEqual(result, '{$env}');
  });

  await t.test('should handle interpolateObject with mixed string and tokens', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        id: '123',
      },
    } as any;

    // Mixed text and token should return string
    const result = interpolateObject('prefix-{$service01.id}-suffix', context);
    assert.strictEqual(result, 'prefix-123-suffix');
  });

  await t.test('should handle interpolateObject with null value', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        body: null,
      },
    } as any;

    // Resolving single token to null should return null
    const result = interpolateObject('{$service01.body}', context);
    assert.strictEqual(result, null);
  });

  await t.test('should handle nested object interpolation in arrays', () => {
    const context: OrchestrationContext = {
      request: {},
      service01: {
        items: [{ id: '1' }, { id: '2' }],
      },
    } as any;

    // Array should interpolate each item
    const result = interpolateObject('{$service01.items}', context);
    assert.deepStrictEqual(result, [{ id: '1' }, { id: '2' }]);
  });
});
