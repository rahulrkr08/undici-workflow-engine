import { test } from 'node:test';
import * as assert from 'node:assert';
import { interpolateObject, cookiesToHeader, buildQueryString } from '../src/interpolation.js';
import type { OrchestrationContext } from '../src/types.js';

test('Interpolation - interpolateObject', async t => {
  await t.test('should interpolate all values in object', async () => {
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

    const result = await interpolateObject(input, context);

    assert.strictEqual(result.headers['x-api-key'], 'secret');
    assert.strictEqual(result.headers['x-user-id'], 123);  // Returns number type
    assert.strictEqual(result.query.token, 'abc123');
    assert.strictEqual(result.data, 'plain string');
  });

  await t.test('should interpolate arrays', async () => {
    const context: OrchestrationContext = {
      request: {},
      env: {
        VALUE1: 'first',
        VALUE2: 'second',
      },
    };

    const input = ['{$env.VALUE1}', '{$env.VALUE2}', 'plain'];
    const result = await interpolateObject(input, context);

    assert.deepStrictEqual(result, ['first', 'second', 'plain']);
  });

  await t.test('should handle nested objects and arrays', async () => {
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

    const result = await interpolateObject(input, context);

    // When a token is single and complete, it returns the original type (array in this case)
    assert.deepStrictEqual(result.data.nested.items, [
      { id: 1, name: 'item1' },
      { id: 2, name: 'item2' },
    ]);
  });

  await t.test('should handle null and undefined values', async () => {
    const context: OrchestrationContext = {
      request: {},
    };

    assert.strictEqual(await interpolateObject(null, context), null);
    assert.strictEqual(await interpolateObject(undefined, context), undefined);
  });

  await t.test('should preserve non-string values', async () => {
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

    const result = await interpolateObject(input, context);

    assert.deepStrictEqual(result, input);
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
