import { test } from 'node:test';
import * as assert from 'node:assert';
import { executeService } from '../src/executor.js';
import type { ServiceConfig } from '../src/types.js';
import { MockServer, jsonHandler, cookieHandler } from './helpers.js';

test('Executor - Set-Cookie Response Header Handling', async (t) => {
  await t.test('should extract single Set-Cookie header', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'sessionId=abc123; Path=/',
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/login',
      method: 'POST',
      body: { username: 'user', password: 'pass' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    assert.strictEqual(result.cookies.sessionId, 'abc123');
    assert.deepStrictEqual(Object.keys(result.cookies).length, 1);
  });

  await t.test('should extract multiple Set-Cookie headers as array', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': ['sessionId=abc123; Path=/', 'userId=user456; Path=/'],
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/login',
      method: 'POST',
      body: { username: 'user', password: 'pass' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    assert.strictEqual(result.cookies.sessionId, 'abc123');
    assert.strictEqual(result.cookies.userId, 'user456');
    assert.strictEqual(Object.keys(result.cookies).length, 2);
  });

  await t.test('should handle Set-Cookie with complex attributes', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': [
          'sessionId=abc123; Path=/; HttpOnly; Secure; SameSite=Strict',
          'userId=user456; Domain=example.com; Max-Age=3600',
        ],
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/secure',
      method: 'POST',
      body: { data: 'test' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    // Parser only extracts name=value, ignoring attributes
    assert.strictEqual(result.cookies.sessionId, 'abc123');
    assert.strictEqual(result.cookies.userId, 'user456');
  });

  await t.test('should handle Set-Cookie with special characters in value', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9; Path=/',
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/token',
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    assert.strictEqual(result.cookies.token, 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
  });

  await t.test('should return empty cookies object when no Set-Cookie header', async () => {
    const server = new MockServer(jsonHandler({ success: true }));

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/data',
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    assert.deepStrictEqual(result.cookies, {});
  });

  await t.test('should skip malformed Set-Cookie entries', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': [
          'validCookie=value123; Path=/',
          'malformed-no-equals-sign',
          'anotherValid=xyz789; Path=/',
          'also-broken',
        ],
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/mixed',
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    // Only valid cookies should be parsed
    assert.strictEqual(result.cookies.validCookie, 'value123');
    assert.strictEqual(result.cookies.anotherValid, 'xyz789');
    assert.strictEqual(Object.keys(result.cookies).length, 2);
  });

  await t.test('should skip Set-Cookie entries with empty values', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': [
          'sessionId=abc123; Path=/',
          'clearCookie=; Path=/',
          'userId=user456; Path=/',
        ],
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/logout',
      method: 'POST',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    // Empty value cookies are not extracted by the regex parser
    assert.strictEqual(result.cookies.sessionId, 'abc123');
    assert.strictEqual(result.cookies.clearCookie, undefined);
    assert.strictEqual(result.cookies.userId, 'user456');
    assert.strictEqual(Object.keys(result.cookies).length, 2);
  });

  await t.test('should parse cookie with numeric value', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'userId=12345; Path=/',
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/user',
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    assert.strictEqual(result.cookies.userId, '12345');
    assert.strictEqual(typeof result.cookies.userId, 'string');
  });

  await t.test('should handle Set-Cookie with hyphenated names', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': [
          'session-id=abc123; Path=/',
          'user-pref=dark-mode; Path=/',
          'tracking-code=xyz789; Path=/',
        ],
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/prefs',
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    assert.strictEqual(result.cookies['session-id'], 'abc123');
    assert.strictEqual(result.cookies['user-pref'], 'dark-mode');
    assert.strictEqual(result.cookies['tracking-code'], 'xyz789');
  });

  await t.test('should handle Set-Cookie with semicolon in attributes but not in value', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'data=abcdef123456; Path=/api; Domain=example.com',
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/data',
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    // Should extract only name=value part before first semicolon
    assert.strictEqual(result.cookies.data, 'abcdef123456');
  });

  await t.test('should parse multiple cookies with same name in different Set-Cookie headers (last wins)', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': [
          'sessionId=oldValue123; Path=/',
          'sessionId=newValue456; Path=/',
        ],
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/refresh',
      method: 'POST',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    // Last occurrence should overwrite previous
    assert.strictEqual(result.cookies.sessionId, 'newValue456');
  });

  await t.test('should combine Set-Cookie response with other response properties', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'x-request-id': 'req-12345',
        'x-server': 'MyServer/1.0',
        'set-cookie': ['sessionId=abc123; Path=/'],
      });
      res.end(JSON.stringify({ user: 'john', authenticated: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/auth',
      method: 'POST',
      body: { username: 'john', password: 'pass' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    // Verify body is parsed correctly
    assert.deepStrictEqual(result.body, { user: 'john', authenticated: true });
    // Verify headers are extracted
    assert.ok(result.headers);
    assert.strictEqual(result.headers['x-request-id'], 'req-12345');
    assert.strictEqual(result.headers['x-server'], 'MyServer/1.0');
    // Verify cookies are extracted
    assert.ok(result.cookies);
    assert.strictEqual(result.cookies.sessionId, 'abc123');
  });

  await t.test('should handle Set-Cookie on 3xx redirect responses', async () => {
    const server = new MockServer((req, res) => {
      if (req.url === '/api/login') {
        res.writeHead(302, {
          'location': '/api/dashboard',
          'set-cookie': 'sessionId=abc123; Path=/',
        });
        res.end();
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ page: 'dashboard' }));
      }
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/login',
      method: 'POST',
      body: { username: 'user', password: 'pass' },
    };

    const result = await executeService(config);

    // Result will have the redirect response
    assert.strictEqual(result.status, 302);
    assert.ok(result.cookies);
    assert.strictEqual(result.cookies.sessionId, 'abc123');
  });

  await t.test('should handle Set-Cookie on error responses (4xx, 5xx)', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(401, {
        'content-type': 'application/json',
        'set-cookie': 'errorToken=err123; Path=/',
      });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/protected',
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 401);
    assert.ok(result.cookies);
    assert.strictEqual(result.cookies.errorToken, 'err123');
  });

  await t.test('should handle very long Set-Cookie value', async () => {
    const longTokenValue = 'x'.repeat(1000);
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': `token=${longTokenValue}; Path=/`,
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/token',
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    assert.strictEqual(result.cookies.token, longTokenValue);
  });

  await t.test('should handle Set-Cookie in response alongside sent cookies in request', async () => {
    const server = new MockServer((req, res) => {
      // Verify request cookies were sent
      assert.ok(req.headers.cookie);
      assert.strictEqual(req.headers.cookie, 'oldSession=old123');

      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'newSession=new456; Path=/',
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/refresh-session',
      method: 'POST',
      cookies: { oldSession: 'old123' },
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    assert.strictEqual(result.cookies.newSession, 'new456');
  });
});

test('Executor - Cookie Extraction Edge Cases', async (t) => {
  await t.test('should handle Set-Cookie with URL-encoded value', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'data=hello%20world%21; Path=/',
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/data',
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    // Parser should keep URL-encoded value as-is
    assert.strictEqual(result.cookies.data, 'hello%20world%21');
  });

  await t.test('should handle Set-Cookie with equals sign in cookie value', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'token=abc=123=def; Path=/',
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/token',
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    // Should extract everything between first = and first ;
    assert.strictEqual(result.cookies.token, 'abc=123=def');
  });

  await t.test('should handle Set-Cookie with no attributes', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': 'simple=value',
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/simple',
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    assert.strictEqual(result.cookies.simple, 'value');
  });

  await t.test('should return all cookies in result.cookies property', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {
        'content-type': 'application/json',
        'set-cookie': [
          'cookie1=value1; Path=/',
          'cookie2=value2; Path=/',
          'cookie3=value3; Path=/',
        ],
      });
      res.end(JSON.stringify({ success: true }));
    });

    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: url + '/api/cookies',
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.ok(result.cookies);
    assert.strictEqual(Object.keys(result.cookies).length, 3);
    assert.strictEqual(result.cookies.cookie1, 'value1');
    assert.strictEqual(result.cookies.cookie2, 'value2');
    assert.strictEqual(result.cookies.cookie3, 'value3');
  });
});
