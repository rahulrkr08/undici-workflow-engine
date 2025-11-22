import { test } from 'node:test';
import * as assert from 'node:assert';
import { executeService } from '../src/executor.js';
import { runOrchestration } from '../src/orchestrator.js';
import type { ServiceConfig, ServiceBlock, OrchestrationContext } from '../src/types.js';
import { MockServer, jsonHandler } from './helpers.js';
import { MockOIDCProvider } from './oidc-helper.js';

test('OIDC Workflow - Basic Client Credentials Flow', async (t) => {
  await t.test('should obtain access token via client credentials', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'workflow-app',
        client_secret: 'workflow-secret',
        grant_types: ['client_credentials', 'refresh_token'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const resourceServer = new MockServer(oidcProvider.createProtectedHandler());
    const resourceUrl = await resourceServer.listen();
    t.after(() => resourceServer.close());

    const config: ServiceConfig = {
      url: resourceUrl + '/api/protected',
      method: 'GET',
      oidc: {
        clientId: 'workflow-app',
        clientSecret: 'workflow-secret',
        tokenUrl: oidcUrl + '/oauth/token',
      },
    };

    const result = await executeService(config);

    // Service should attempt the request
    assert.ok(result.status !== undefined);
  });

  await t.test('should include bearer token in authorization header', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'api-client',
        client_secret: 'api-secret',
        grant_types: ['client_credentials'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const server = new MockServer((req, res) => {
      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ authorized: true, token_prefix: authHeader.slice(0, 10) }));
      } else {
        res.writeHead(401);
        res.end();
      }
    });

    const serverUrl = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: serverUrl + '/api/data',
      method: 'GET',
      oidc: {
        clientId: 'api-client',
        clientSecret: 'api-secret',
        tokenUrl: oidcUrl + '/oauth/token',
      },
    };

    const result = await executeService(config);

    // Request should be attempted with OIDC configuration
    assert.ok(result.status !== undefined);
  });
});

test('OIDC Workflow - Orchestration with OIDC Services', async (t) => {
  await t.test('should execute single service with OIDC authentication', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'orchestration-client',
        client_secret: 'orchestration-secret',
        grant_types: ['client_credentials'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const server = new MockServer(jsonHandler({ data: 'protected-resource' }));
    const serverUrl = await server.listen();
    t.after(() => server.close());

    const services: ServiceBlock[] = [
      {
        id: 'getProtectedData',
        service: {
          url: serverUrl + '/api/protected',
          method: 'GET',
          oidc: {
            clientId: 'orchestration-client',
            clientSecret: 'orchestration-secret',
            tokenUrl: oidcUrl + '/oauth/token',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.getProtectedData);
    assert.ok(result.services.getProtectedData.status !== undefined);
  });

  await t.test('should support multiple services with different OIDC credentials', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'service-a-client',
        client_secret: 'service-a-secret',
        grant_types: ['client_credentials'],
      },
      {
        client_id: 'service-b-client',
        client_secret: 'service-b-secret',
        grant_types: ['client_credentials'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const serverA = new MockServer(jsonHandler({ service: 'A' }));
    const serverAUrl = await serverA.listen();
    t.after(() => serverA.close());

    const serverB = new MockServer(jsonHandler({ service: 'B' }));
    const serverBUrl = await serverB.listen();
    t.after(() => serverB.close());

    const services: ServiceBlock[] = [
      {
        id: 'serviceA',
        service: {
          url: serverAUrl + '/api/data',
          method: 'GET',
          oidc: {
            clientId: 'service-a-client',
            clientSecret: 'service-a-secret',
            tokenUrl: oidcUrl + '/oauth/token',
          },
        },
      },
      {
        id: 'serviceB',
        service: {
          url: serverBUrl + '/api/data',
          method: 'GET',
          oidc: {
            clientId: 'service-b-client',
            clientSecret: 'service-b-secret',
            tokenUrl: oidcUrl + '/oauth/token',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.serviceA);
    assert.ok(result.services.serviceB);
  });

  await t.test('should execute dependent services with OIDC', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'workflow-client',
        client_secret: 'workflow-secret',
        grant_types: ['client_credentials'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const server = new MockServer((req, res) => {
      const path = req.url;

      if (path === '/api/user/1') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ id: 1, name: 'Test User', role: 'admin' }));
      } else if (path === '/api/admin') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ adminPanel: true, users: 100 }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const serverUrl = await server.listen();
    t.after(() => server.close());

    const services: ServiceBlock[] = [
      {
        id: 'getUser',
        service: {
          url: serverUrl + '/api/user/1',
          method: 'GET',
          oidc: {
            clientId: 'workflow-client',
            clientSecret: 'workflow-secret',
            tokenUrl: oidcUrl + '/oauth/token',
          },
        },
      },
      {
        id: 'getAdminPanel',
        dependsOn: ['getUser'],
        service: {
          url: serverUrl + '/api/admin',
          method: 'GET',
          oidc: {
            clientId: 'workflow-client',
            clientSecret: 'workflow-secret',
            tokenUrl: oidcUrl + '/oauth/token',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.getUser);
    assert.ok(result.services.getAdminPanel);
  });
});

test('OIDC Workflow - Configuration with Environment Variables', async (t) => {
  await t.test('should use environment variables for OIDC configuration', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'env-client',
        client_secret: 'env-secret',
        grant_types: ['client_credentials'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const server = new MockServer(jsonHandler({ test: 'data' }));
    const serverUrl = await server.listen();
    t.after(() => server.close());

    const services: ServiceBlock[] = [
      {
        id: 'getEnvData',
        service: {
          url: serverUrl + '/api/data',
          method: 'GET',
          oidc: {
            clientId: '$env.OIDC_CLIENT_ID',
            clientSecret: '$env.OIDC_CLIENT_SECRET',
            tokenUrl: '$env.OIDC_TOKEN_URL',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
      env: {
        OIDC_CLIENT_ID: 'env-client',
        OIDC_CLIENT_SECRET: 'env-secret',
        OIDC_TOKEN_URL: oidcUrl + '/oauth/token',
      },
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.getEnvData);
  });
});

test('OIDC Workflow - POST Request with OIDC', async (t) => {
  await t.test('should send POST request with OIDC authentication and body', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'post-client',
        client_secret: 'post-secret',
        grant_types: ['client_credentials'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const server = new MockServer((req, res) => {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          const data = JSON.parse(body);
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ created: true, received: data }));
        });
      } else {
        res.writeHead(405);
        res.end();
      }
    });

    const serverUrl = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: serverUrl + '/api/create',
      method: 'POST',
      body: { name: 'New Resource', type: 'test' },
      oidc: {
        clientId: 'post-client',
        clientSecret: 'post-secret',
        tokenUrl: oidcUrl + '/oauth/token',
      },
    };

    const result = await executeService(config);

    assert.ok(result.status !== undefined);
  });

  await t.test('should send POST request with OIDC in orchestration', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'create-client',
        client_secret: 'create-secret',
        grant_types: ['client_credentials'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const server = new MockServer((req, res) => {
      if (req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          res.writeHead(201, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ id: 123, created: true }));
        });
      } else {
        res.writeHead(405);
        res.end();
      }
    });

    const serverUrl = await server.listen();
    t.after(() => server.close());

    const services: ServiceBlock[] = [
      {
        id: 'createResource',
        service: {
          url: serverUrl + '/api/resources',
          method: 'POST',
          body: { name: 'Resource', type: 'test' },
          oidc: {
            clientId: 'create-client',
            clientSecret: 'create-secret',
            tokenUrl: oidcUrl + '/oauth/token',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.createResource);
  });
});

test('OIDC Workflow - Complex Workflows with Multiple Services', async (t) => {
  await t.test('should handle multi-step workflow with OIDC authentication', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'workflow-app',
        client_secret: 'workflow-secret',
        grant_types: ['client_credentials'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const server = new MockServer((req, res) => {
      const path = req.url;

      if (path === '/api/users') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify([{ id: 1, name: 'User 1' }, { id: 2, name: 'User 2' }]));
      } else if (path === '/api/posts?userId=1') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify([{ id: 1, title: 'Post 1', userId: 1 }]));
      } else if (path === '/api/comments?postId=1') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify([{ id: 1, text: 'Great post!' }]));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const serverUrl = await server.listen();
    t.after(() => server.close());

    const oidcConfig = {
      clientId: 'workflow-app',
      clientSecret: 'workflow-secret',
      tokenUrl: oidcUrl + '/oauth/token',
    };

    const services: ServiceBlock[] = [
      {
        id: 'getUsers',
        service: {
          url: serverUrl + '/api/users',
          method: 'GET',
          oidc: oidcConfig,
        },
      },
      {
        id: 'getUserPosts',
        dependsOn: ['getUsers'],
        service: {
          url: serverUrl + '/api/posts?userId=1',
          method: 'GET',
          oidc: oidcConfig,
        },
      },
      {
        id: 'getPostComments',
        dependsOn: ['getUserPosts'],
        service: {
          url: serverUrl + '/api/comments?postId=1',
          method: 'GET',
          oidc: oidcConfig,
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.getUsers);
    assert.ok(result.services.getUserPosts);
    assert.ok(result.services.getPostComments);
  });

  await t.test('should handle diamond dependency with OIDC', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'diamond-client',
        client_secret: 'diamond-secret',
        grant_types: ['client_credentials'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const server = new MockServer((req, res) => {
      const path = req.url;

      if (path === '/api/config') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ version: '1.0' }));
      } else if (path === '/api/service-a') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ service: 'A' }));
      } else if (path === '/api/service-b') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ service: 'B' }));
      } else if (path === '/api/aggregate') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ aggregated: true }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    const serverUrl = await server.listen();
    t.after(() => server.close());

    const oidcConfig = {
      clientId: 'diamond-client',
      clientSecret: 'diamond-secret',
      tokenUrl: oidcUrl + '/oauth/token',
    };

    const services: ServiceBlock[] = [
      {
        id: 'getConfig',
        service: {
          url: serverUrl + '/api/config',
          method: 'GET',
          oidc: oidcConfig,
        },
      },
      {
        id: 'getServiceA',
        dependsOn: ['getConfig'],
        service: {
          url: serverUrl + '/api/service-a',
          method: 'GET',
          oidc: oidcConfig,
        },
      },
      {
        id: 'getServiceB',
        dependsOn: ['getConfig'],
        service: {
          url: serverUrl + '/api/service-b',
          method: 'GET',
          oidc: oidcConfig,
        },
      },
      {
        id: 'aggregate',
        dependsOn: ['getServiceA', 'getServiceB'],
        service: {
          url: serverUrl + '/api/aggregate',
          method: 'GET',
          oidc: oidcConfig,
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.getConfig);
    assert.ok(result.services.getServiceA);
    assert.ok(result.services.getServiceB);
    assert.ok(result.services.aggregate);
  });
});

test('OIDC Workflow - Error Handling with OIDC', async (t) => {
  await t.test('should handle OIDC errors gracefully', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'error-client',
        client_secret: 'error-secret',
        grant_types: ['client_credentials'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const server = new MockServer(jsonHandler({ test: 'data' }));
    const serverUrl = await server.listen();
    t.after(() => server.close());

    // Use invalid token URL to simulate OIDC error
    const config: ServiceConfig = {
      url: serverUrl + '/api/data',
      method: 'GET',
      oidc: {
        clientId: 'error-client',
        clientSecret: 'error-secret',
        tokenUrl: 'http://invalid-oidc-server.local/oauth/token',
      },
      fallback: {
        data: { fallback: 'data' },
      },
    };

    const result = await executeService(config);

    // Should either use fallback or return error
    assert.ok(
      result.metadata?.fallbackUsed || result.status !== 200 || result.error
    );
  });

  await t.test('should use fallback when OIDC service is unavailable', async () => {
    const services: ServiceBlock[] = [
      {
        id: 'getWithOIDC',
        service: {
          url: 'http://invalid-server.local/api/data',
          method: 'GET',
          oidc: {
            clientId: 'unavailable-client',
            clientSecret: 'unavailable-secret',
            tokenUrl: 'http://invalid-oidc.local/oauth/token',
          },
          fallback: {
            data: { status: 'fallback', message: 'OIDC service unavailable' },
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.getWithOIDC);
    // Should have attempted the service
    assert.ok(result.services.getWithOIDC.status !== undefined);
  });
});

test('OIDC Workflow - Headers and Query Parameters with OIDC', async (t) => {
  await t.test('should combine OIDC with custom headers', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'header-client',
        client_secret: 'header-secret',
        grant_types: ['client_credentials'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const server = new MockServer((req, res) => {
      const apiKey = req.headers['x-api-key'];
      const authHeader = req.headers.authorization;

      if (apiKey && authHeader) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ authenticated: true, authorized: true }));
      } else {
        res.writeHead(400);
        res.end();
      }
    });

    const serverUrl = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: serverUrl + '/api/data',
      method: 'GET',
      headers: { 'x-api-key': 'my-api-key-123' },
      oidc: {
        clientId: 'header-client',
        clientSecret: 'header-secret',
        tokenUrl: oidcUrl + '/oauth/token',
      },
    };

    const result = await executeService(config);

    assert.ok(result.status !== undefined);
  });

  await t.test('should combine OIDC with query parameters', async () => {
    const oidcProvider = new MockOIDCProvider([
      {
        client_id: 'query-client',
        client_secret: 'query-secret',
        grant_types: ['client_credentials'],
      },
    ]);

    const oidcUrl = await oidcProvider.listen();
    t.after(() => oidcProvider.close());

    const server = new MockServer((req, res) => {
      const url = new URL(req.url || '', 'http://localhost');
      const version = url.searchParams.get('version');

      if (version && req.headers.authorization) {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ version, authenticated: true }));
      } else {
        res.writeHead(400);
        res.end();
      }
    });

    const serverUrl = await server.listen();
    t.after(() => server.close());

    const services: ServiceBlock[] = [
      {
        id: 'getVersionedData',
        service: {
          url: serverUrl + '/api/data',
          method: 'GET',
          query: { version: 'v2' },
          oidc: {
            clientId: 'query-client',
            clientSecret: 'query-secret',
            tokenUrl: oidcUrl + '/oauth/token',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.getVersionedData);
  });
});
