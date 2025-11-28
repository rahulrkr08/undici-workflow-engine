import { test } from 'node:test';
import * as assert from 'node:assert';
import { interpolateObject } from '../src/interpolation.js';
import type { OrchestrationContext } from '../src/types.js';

test('JSONata - Advanced Features', async t => {
  await t.test('should support JSONata string functions', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        name: 'hello world',
      },
    } as any;

    const result = await interpolateObject('{service.name.$uppercase()}', context);
    assert.strictEqual(result, 'HELLO WORLD');
  });

  await t.test('should support JSONata array filtering', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        users: [
          { id: 1, status: 'active', name: 'Alice' },
          { id: 2, status: 'inactive', name: 'Bob' },
          { id: 3, status: 'active', name: 'Charlie' },
        ],
      },
    } as any;

    const result = await interpolateObject('{service.users[status="active"].name}', context);
    assert.strictEqual(result.includes('Alice'), true);
  });

  await t.test('should support JSONata arithmetic expressions', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        price: 100,
      },
    } as any;

    const result = await interpolateObject('{service.price * 1.1}', context);
    assert.ok(Math.abs(result - 110) < 0.00001);
  });

  await t.test('should support JSONata functions with aggregation', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        values: [10, 20, 30],
      },
    } as any;

    const result = await interpolateObject('{$sum(service.values)}', context);
    assert.strictEqual(result, 60);
  });
});

test('JSONata - Type Preservation with Complex Types', async t => {
  await t.test('should preserve boolean types', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        success: true,
        cached: false,
      },
    } as any;

    const resultTrue = await interpolateObject('{service.success}', context);
    assert.strictEqual(resultTrue, true);
    assert.strictEqual(typeof resultTrue, 'boolean');

    const resultFalse = await interpolateObject('{service.cached}', context);
    assert.strictEqual(resultFalse, false);
    assert.strictEqual(typeof resultFalse, 'boolean');
  });

  await t.test('should preserve null values', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        nullValue: null,
      },
    } as any;

    const result = await interpolateObject('{service.nullValue}', context);
    assert.strictEqual(result, null);
  });
});

test('JSONata - Bracket Expression Array Flattening', async t => {
  await t.test('should support array flattening with bracket expressions', async () => {
    const context: OrchestrationContext = {
      Account: {
        'Account Name': 'Firefly',
        Order: [
          {
            Product: [
              { 'Product Name': 'Bowler Hat' },
              { 'Product Name': 'Trilby hat' },
            ],
          },
          {
            Product: [
              { 'Product Name': 'Bowler Hat' },
              { 'Product Name': 'Cloak' },
            ],
          },
        ],
      },
    } as any;

    const result = await interpolateObject('{[Account.Order.Product."Product Name"]}', context);
    assert.strictEqual(Array.isArray(result), true);
    assert.strictEqual(result.length, 4);
    assert.deepStrictEqual(result, ['Bowler Hat', 'Trilby hat', 'Bowler Hat', 'Cloak']);
  });
});

test('JSONata - Error Handling', async t => {
  await t.test('should return original token for undefined expressions', async () => {
    const context: OrchestrationContext = {
      request: {},
    };

    const result = await interpolateObject('{undefined.path}', context);
    assert.strictEqual(result, '{undefined.path}');
  });

  await t.test('should handle null property access gracefully', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        data: null,
      },
    } as any;

    const result = await interpolateObject('{service.data.property}', context);
    assert.strictEqual(result, '{service.data.property}');
  });

  await t.test('should handle undefined property access gracefully', async () => {
    const context: OrchestrationContext = {
      request: {},
      service: {
        undefinedValue: undefined,
      },
    } as any;

    const result = await interpolateObject('{service.undefinedValue}', context);
    assert.strictEqual(result, '{service.undefinedValue}');
  });
});

test('JSONata - Complex Nested Structures', async t => {
  await t.test('should handle deeply nested mixed structures', async () => {
    const context: OrchestrationContext = {
      request: {},
      database: {
        users: [
          { id: 1, name: 'Alice', age: 30 },
          { id: 2, name: 'Bob', age: 25 },
        ],
      },
    } as any;

    const config = {
      users: '{database.users}',
      firstUser: '{database.users[0]}',
      firstUserName: '{database.users[0].name}',
    };

    const result = await interpolateObject(config, context);
    assert.strictEqual(Array.isArray(result.users), true);
    assert.strictEqual(result.users.length, 2);
    assert.deepStrictEqual(result.firstUser, { id: 1, name: 'Alice', age: 30 });
    assert.strictEqual(result.firstUserName, 'Alice');
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
      statusCode: '{api.response.status}',
      items: '{api.response.body.items}',
      message: 'Status: {api.response.status}',
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
