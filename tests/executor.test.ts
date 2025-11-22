import { test } from 'node:test';
import * as assert from 'node:assert';
import { executeService } from '../src/executor.js';
import type { ServiceConfig } from '../src/types.js';
import {
  MockServer,
  jsonHandler,
  headerValidatingHandler,
  queryParamHandler,
  echoBodyHandler,
  cookieValidatingHandler,
  errorHandler,
  methodHandler,
} from './helpers.js';

test('Executor - Basic HTTP Operations', async (t) => {
  await t.test('should handle successful GET request', async () => {
    const server = new MockServer(jsonHandler({ id: 1, name: 'test' }));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/users/1'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body, { id: 1, name: 'test' });
  });

  await t.test('should handle successful POST request with JSON body', async () => {
    const server = new MockServer(echoBodyHandler());
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/users'),
      method: 'POST',
      body: { name: 'John Doe', email: 'john@example.com' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body.received, {
      name: 'John Doe',
      email: 'john@example.com',
    });
  });

  await t.test('should handle PUT request', async () => {
    const server = new MockServer(echoBodyHandler());
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/users/1'),
      method: 'PUT',
      body: { name: 'Jane Doe' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body.received, { name: 'Jane Doe' });
  });

  await t.test('should handle PATCH request', async () => {
    const server = new MockServer(echoBodyHandler());
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/users/1'),
      method: 'PATCH',
      body: { status: 'active' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body.received, { status: 'active' });
  });

  await t.test('should handle DELETE request', async () => {
    const server = new MockServer(jsonHandler({ deleted: true }));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/users/1'),
      method: 'DELETE',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body, { deleted: true });
  });
});

test('Executor - Query Parameters', async (t) => {
  await t.test('should include query parameters in URL', async () => {
    const server = new MockServer(
      queryParamHandler({ id: '1', limit: '10' }, { items: [] }),
    );
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/users'),
      method: 'GET',
      query: { id: '1', limit: '10' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body, { items: [] });
  });

  await t.test('should handle multiple query parameters', async () => {
    const server = new MockServer(
      queryParamHandler(
        { userId: '1', sort: 'id', order: 'asc' },
        { posts: [{ id: 1 }] },
      ),
    );
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/posts'),
      method: 'GET',
      query: { userId: '1', sort: 'id', order: 'asc' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body, { posts: [{ id: 1 }] });
  });

  await t.test('should handle special characters in query parameters', async () => {
    const server = new MockServer(
      queryParamHandler(
        { email: 'user@example.com', query: 'hello world' },
        { results: [] },
      ),
    );
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/search'),
      method: 'GET',
      query: { email: 'user@example.com', query: 'hello world' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
  });
});

test('Executor - Headers and Cookies', async (t) => {
  await t.test('should include custom headers in request', async () => {
    const server = new MockServer(
      headerValidatingHandler(
        { 'x-api-key': 'secret123', 'user-agent': 'test-agent' },
        { authorized: true },
      ),
    );
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/protected'),
      method: 'GET',
      headers: { 'x-api-key': 'secret123', 'user-agent': 'test-agent' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body, { authorized: true });
  });

  await t.test('should set content-type header for POST with body', async () => {
    const server = new MockServer(
      headerValidatingHandler({ 'content-type': 'application/json' }),
    );
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/data'),
      method: 'POST',
      body: { test: 'data' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
  });

  await t.test('should include cookies in request', async () => {
    const server = new MockServer(
      cookieValidatingHandler({ sessionId: 'abc123', userId: '42' }),
    );
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/session'),
      method: 'GET',
      cookies: { sessionId: 'abc123', userId: '42' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
  });

  await t.test('should extract response headers', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'x-custom-header': 'header-value',
      });
      res.end(JSON.stringify({ success: true }));
    });
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/data'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.headers);
    assert.strictEqual(result.headers['x-custom-header'], 'header-value');
  });
});

test('Executor - Error Handling', async (t) => {
  await t.test('should handle 404 Not Found', async () => {
    const server = new MockServer(errorHandler(404, 'Not Found'));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/nonexistent'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 404);
    assert.deepStrictEqual(result.body, { error: 'Not Found' });
  });

  await t.test('should handle 500 Server Error', async () => {
    const server = new MockServer(errorHandler(500, 'Internal Server Error'));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/error'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 500);
    assert.deepStrictEqual(result.body, { error: 'Internal Server Error' });
  });

  await t.test('should handle fallback on network error', async () => {
    const config: ServiceConfig = {
      url: 'http://invalid-domain-that-does-not-exist-12345.local/api',
      method: 'GET',
      fallback: { data: { status: 'fallback_used' } },
    };

    const result = await executeService(config);

    // Should return fallback
    assert.ok(result.metadata?.fallbackUsed === true || result.body?.status === 'fallback_used');
  });

  await t.test('should return error when no fallback and request fails', async () => {
    const config: ServiceConfig = {
      url: 'http://invalid-domain-that-does-not-exist-12345.local/api',
      method: 'GET',
    };

    const result = await executeService(config);

    // Should return error
    assert.strictEqual(result.status, null);
    assert.ok(result.error);
  });
});

test('Executor - Response Body Parsing', async (t) => {
  await t.test('should parse JSON response body', async () => {
    const server = new MockServer(
      jsonHandler({
        user: { id: 1, name: 'John' },
        items: [{ id: 1 }, { id: 2 }],
      }),
    );
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/data'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(typeof result.body === 'object');
    assert.strictEqual(result.body.user.name, 'John');
    assert.strictEqual(result.body.items.length, 2);
  });

  await t.test('should handle empty response body', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('');
    });
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/empty'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body, null);
  });

  await t.test('should handle text response body', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('Plain text response');
    });
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/text'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body, 'Plain text response');
  });

  await t.test('should handle complex nested JSON structures', async () => {
    const data = {
      user: {
        id: 1,
        profile: {
          name: 'John Doe',
          contact: {
            email: 'john@example.com',
            phones: ['123-456', '789-000'],
          },
        },
      },
      metadata: { created: '2024-01-01', version: 1 },
    };
    const server = new MockServer(jsonHandler(data));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/user'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.deepStrictEqual(result.body, data);
  });
});

test('Executor - HTTP Methods', async (t) => {
  await t.test('should support GET method', async () => {
    const server = new MockServer(jsonHandler({ method: 'GET' }));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/method'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
  });

  await t.test('should support POST method', async () => {
    const server = new MockServer(jsonHandler({ method: 'POST' }));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/method'),
      method: 'POST',
      body: { test: 'data' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
  });

  await t.test('should not send body for GET requests', async () => {
    const server = new MockServer((req, res) => {
      let hasBody = false;
      req.on('data', () => {
        hasBody = true;
      });
      req.on('end', () => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ hasBody }));
      });
    });
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/data'),
      method: 'GET',
      body: { test: 'data' }, // Should be ignored
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body.hasBody, false);
  });
});
