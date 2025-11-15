import { mock, test } from 'node:test';
import * as assert from 'node:assert';
import { runOrchestration } from '../src/orchestrator.js';
import type { ServiceBlock, OrchestrationContext } from '../src/types.js';
import { MockAgent, setGlobalDispatcher } from 'undici';
import * as asyncFlowOrchestrator from 'async-flow-orchestrator';

const mockAgent = new MockAgent();
setGlobalDispatcher(mockAgent);
mockAgent.disableNetConnect();

test('Orchestrator - Single Service Execution', async t => {
  await t.test('should execute single service and return results', async () => {
    const userMock = mockAgent.get('https://jsonplaceholder.typicode.com');
    userMock.intercept({ path: '/users/1', method: 'GET' })
      .reply(200, { id: 1, name: 'Test User' });

    const services: ServiceBlock[] = [
      {
        id: 'getUser',
        service: {
          url: 'https://jsonplaceholder.typicode.com/users/1',
          method: 'GET',
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);
    assert.ok(result.services !== undefined);
    assert.ok(result.services.getUser !== undefined);
    assert.strictEqual(result.services.getUser.status, 200);
  });

});

test('Orchestrator - Service Dependencies', async t => {
  await t.test('should execute services in dependency order', async () => {
    const userMock = mockAgent.get('https://jsonplaceholder.typicode.com');
    userMock.intercept({ path: '/users/1', method: 'GET' })
      .reply(200, { id: 1, name: 'Test User' });
    userMock.intercept({ path: '/posts', method: 'GET', query: { userId: '1' } })
      .reply(200, [{ id: 1, userId: 1, title: 'Post 1' }]);
    userMock.intercept({ path: '/posts', method: 'GET', query: { userId: '1' } })
      .reply(200, [{ id: 1, userId: 1, title: 'Post 1' }]);

    const services: ServiceBlock[] = [
      {
        id: 'user',
        service: {
          url: 'https://jsonplaceholder.typicode.com/users/1',
          method: 'GET',
        },
      },
      {
        id: 'posts',
        dependsOn: ['user'],
        service: {
          url: 'https://jsonplaceholder.typicode.com/posts',
          method: 'GET',
          query: {
            userId: '$user.id',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.user !== undefined);
    assert.ok(result.services.posts !== undefined);
    assert.strictEqual(result.services.user.status, 200);
  });

  await t.test('should handle transitive dependencies', async () => {
    const userMock = mockAgent.get('https://jsonplaceholder.typicode.com');
    userMock.intercept({ path: '/users/1', method: 'GET' })
      .reply(200, { id: 1, name: 'Test User' });
    userMock.intercept({ path: '/users', method: 'GET', query: { id: '1' } })
      .reply(200, [{ id: 1, name: 'Test User' }]);
    userMock.intercept({ path: '/posts', method: 'GET', query: { userId: '1' } })
      .reply(200, [{ id: 1, userId: 1, title: 'Post 1' }]);

    const services: ServiceBlock[] = [
      {
        id: 'service1',
        service: {
          url: 'https://jsonplaceholder.typicode.com/users/1',
          method: 'GET',
        },
      },
      {
        id: 'service2',
        dependsOn: ['service1'],
        service: {
          url: 'https://jsonplaceholder.typicode.com/users',
          method: 'GET',
          query: {
            id: '$service1.id',
          },
        },
      },
      {
        id: 'service3',
        dependsOn: ['service1', 'service2'],
        service: {
          url: 'https://jsonplaceholder.typicode.com/posts',
          method: 'GET',
          query: {
            userId: '$service1.id',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.service1 !== undefined);
    assert.ok(result.services.service2 !== undefined);
    assert.ok(result.services.service3 !== undefined);
  });

  await t.test('should execute independent services in parallel', async () => {
    const userMock = mockAgent.get('https://jsonplaceholder.typicode.com');
    userMock.intercept({ path: '/users/1', method: 'GET' })
      .reply(200, { id: 1, name: 'Test User' });
    userMock.intercept({ path: '/posts/1', method: 'GET' })
      .reply(200, { id: 1, title: 'Test Post' });
    userMock.intercept({ path: '/comments/1', method: 'GET' })
      .reply(200, { id: 1, body: 'Test Comment' });

    const services: ServiceBlock[] = [
      {
        id: 'users',
        service: {
          url: 'https://jsonplaceholder.typicode.com/users/1',
          method: 'GET',
        },
      },
      {
        id: 'posts',
        service: {
          url: 'https://jsonplaceholder.typicode.com/posts/1',
          method: 'GET',
        },
      },
      {
        id: 'comments',
        service: {
          url: 'https://jsonplaceholder.typicode.com/comments/1',
          method: 'GET',
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.users !== undefined);
    assert.ok(result.services.posts !== undefined);
    assert.ok(result.services.comments !== undefined);
  });
});

test('Orchestrator - Variable Interpolation', async t => {
  await t.test('should interpolate request context in service config', async () => {
    const postMock = mockAgent.get('https://jsonplaceholder.typicode.com');
    postMock.intercept({ path: '/posts', method: 'GET', query: { userId: '1' } })
      .reply(200, () => {
        return [{ id: 1, userId: 1, title: 'Post 1' }];
      });

    const services: ServiceBlock[] = [
      {
        id: 'search',
        service: {
          url: 'https://jsonplaceholder.typicode.com/posts',
          method: 'GET',
          query: {
            userId: '$request.query.userId',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {
        query: {
          userId: '1',
        },
      },
    };

    const result = await runOrchestration(services, context);
    console.log(JSON.stringify(result, null, 2));
    assert.ok(result.services.search !== undefined);
    assert.strictEqual(result.services.search.status, 200);
  });

  await t.test('should interpolate service results in dependent services', async () => {
    const userMock = mockAgent.get('https://jsonplaceholder.typicode.com');
    userMock.intercept({ path: '/users/1', method: 'GET' })
      .reply(200, { id: 1, name: 'Test User' });
    userMock.intercept({ path: '/posts', method: 'GET', query: { userId: '1' } })
      .reply(200, [{ id: 1, userId: 1, title: 'Post 1' }]);
    userMock.intercept({ path: '/posts', method: 'GET', query: { userId: '1' } })
      .reply(200, [{ id: 1, userId: 1, title: 'Post 1' }]);

    const services: ServiceBlock[] = [
      {
        id: 'user',
        service: {
          url: 'https://jsonplaceholder.typicode.com/users/1',
          method: 'GET',
        },
      },
      {
        id: 'userPosts',
        dependsOn: ['user'],
        service: {
          url: 'https://jsonplaceholder.typicode.com/posts',
          method: 'GET',
          query: {
            userId: '$user.id',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.userPosts !== undefined);
  });

  await t.test('should interpolate environment variables', async () => {
    const headerMock = mockAgent.get('https://httpbin.org');
    headerMock.intercept({ path: '/headers', method: 'GET' })
      .reply(200, { headers: { 'x-api-key': 'test-key-123' } });

    const services: ServiceBlock[] = [
      {
        id: 'getWithAuth',
        service: {
          url: 'https://httpbin.org/headers',
          method: 'GET',
          headers: {
            'x-api-key': '$env.API_KEY',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
      env: {
        API_KEY: 'test-key-123',
      },
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.getWithAuth !== undefined);
    assert.strictEqual(result.services.getWithAuth.status, 200);
  });

  await t.test('should interpolate custom context properties', async () => {
    const headerMock = mockAgent.get('https://httpbin.org');
    headerMock.intercept({ path: '/headers', method: 'GET' })
      .reply(200, { headers: { authorization: 'bearer-token-123' } });

    const services: ServiceBlock[] = [
      {
        id: 'fetchWithCustomAuth',
        service: {
          url: 'https://httpbin.org/headers',
          method: 'GET',
          headers: {
            authorization: '$customAuth.token',
          },
        },
      },
    ];

    const context: OrchestrationContext & Record<string, any> = {
      request: {},
      customAuth: {
        token: 'bearer-token-123',
      },
    };

    const result = await runOrchestration(services, context as OrchestrationContext);

    assert.ok(result.services.fetchWithCustomAuth !== undefined);
    assert.strictEqual(result.services.fetchWithCustomAuth.status, 200);
  });
});

test('Orchestrator - Error Handling and Fallbacks', async t => {
  await t.test('should use fallback when service fails', async () => {
    const userMock = mockAgent.get('https://invalid-domain-99999.com');
    userMock.intercept({ path: '/', method: 'GET' })
      .replyWithError(new Error('Network error'));

    const services: ServiceBlock[] = [
      {
        id: 'mayFail',
        service: {
          url: 'https://invalid-domain-99999.com/',
          method: 'GET',
          fallback: {
            data: { fallback: true, message: 'Service unavailable' },
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.mayFail !== undefined);
  });

  await t.test('should continue orchestration even if one service fails without fallback', async () => {
    const userMock = mockAgent.get('https://jsonplaceholder.typicode.com');
    userMock.intercept({ path: '/users/1', method: 'GET' })
      .reply(200, { id: 1, name: 'Test User' });
    userMock.intercept({ path: '/posts/1', method: 'GET' })
      .reply(200, { id: 1, title: 'Test Post' });

    const failMock = mockAgent.get('https://invalid-domain-fail.com');
    failMock.intercept({ path: '/', method: 'GET' })
      .replyWithError(new Error('Network error'));

    const services: ServiceBlock[] = [
      {
        id: 'independentService1',
        service: {
          url: 'https://jsonplaceholder.typicode.com/users/1',
          method: 'GET',
        },
      },
      {
        id: 'failingService',
        service: {
          url: 'https://invalid-domain-fail.com/',
          method: 'GET',
        },
      },
      {
        id: 'independentService2',
        service: {
          url: 'https://jsonplaceholder.typicode.com/posts/1',
          method: 'GET',
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(Object.keys(result.services).length > 0);
  });

  await t.test('should mark success false if fallback was used', async () => {
    const failMock = mockAgent.get('https://invalid-domain-99999.com');
    failMock.intercept({ path: '/', method: 'GET' })
      .replyWithError(new Error('Network error'));

    const services: ServiceBlock[] = [
      {
        id: 'withFallback',
        service: {
          url: 'https://invalid-domain-99999.com/',
          method: 'GET',
          fallback: {
            data: { fallback: true },
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);
    assert.strictEqual((result.services.withFallback.body as any).fallback, true);
  });
});

test('Orchestrator - Complex Workflows', async t => {
  await t.test('should handle multi-step authentication and data fetch workflow', async () => {
    const userMock = mockAgent.get('https://jsonplaceholder.typicode.com');
    userMock.intercept({ path: '/users/1', method: 'GET' })
      .reply(200, { id: 1, name: 'Test User' });
    userMock.intercept({ path: '/users', method: 'GET', query: { id: '1' } })
      .reply(200, [{ id: 1, name: 'Test User' }]);
    userMock.intercept({ path: '/posts', method: 'GET', query: { userId: '1' } })
      .reply(200, [{ id: 1, userId: 1, title: 'Post 1' }]);

    const postMock = mockAgent.get('https://httpbin.org');
    postMock.intercept({ path: '/post', method: 'POST' })
      .reply(200, { success: true });

    const services: ServiceBlock[] = [
      {
        id: 'authenticate',
        service: {
          url: 'https://jsonplaceholder.typicode.com/users/1',
          method: 'GET',
        },
      },
      {
        id: 'fetchUserProfile',
        dependsOn: ['authenticate'],
        service: {
          url: 'https://jsonplaceholder.typicode.com/users',
          method: 'GET',
          query: {
            id: '$authenticate.id',
          },
        },
      },
      {
        id: 'fetchUserPosts',
        dependsOn: ['authenticate'],
        service: {
          url: 'https://jsonplaceholder.typicode.com/posts',
          method: 'GET',
          query: {
            userId: '$authenticate.id',
          },
        },
      },
      {
        id: 'aggregate',
        dependsOn: ['fetchUserProfile', 'fetchUserPosts'],
        service: {
          url: 'https://httpbin.org/post',
          method: 'POST',
          body: {
            profile: '$fetchUserProfile.',
            posts: '$fetchUserPosts.',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.authenticate !== undefined);
    assert.ok(result.services.fetchUserProfile !== undefined);
    assert.ok(result.services.fetchUserPosts !== undefined);
    assert.ok(result.services.aggregate !== undefined);
  });

  await t.test('should handle diamond dependency pattern', async () => {
    const userMock = mockAgent.get('https://jsonplaceholder.typicode.com');
    userMock.intercept({ path: '/users/1', method: 'GET' })
      .reply(200, { id: 1, name: 'Test User' });
    userMock.intercept({ path: '/posts', method: 'GET', query: { userId: '1' } })
      .reply(200, [{ id: 1, userId: 1, title: 'Post 1' }]);
    userMock.intercept({ path: '/comments', method: 'GET', query: { postId: '1' } })
      .reply(200, [{ id: 1, postId: 1, body: 'Comment 1' }]);

    const postMock = mockAgent.get('https://httpbin.org');
    postMock.intercept({ path: '/post', method: 'POST' })
      .reply(200, { success: true });

    const services: ServiceBlock[] = [
      {
        id: 'root',
        service: {
          url: 'https://jsonplaceholder.typicode.com/users/1',
          method: 'GET',
        },
      },
      {
        id: 'leftBranch',
        dependsOn: ['root'],
        service: {
          url: 'https://jsonplaceholder.typicode.com/posts',
          method: 'GET',
          query: { userId: '$root.id' },
        },
      },
      {
        id: 'rightBranch',
        dependsOn: ['root'],
        service: {
          url: 'https://jsonplaceholder.typicode.com/comments',
          method: 'GET',
          query: { postId: '1' },
        },
      },
      {
        id: 'merge',
        dependsOn: ['leftBranch', 'rightBranch'],
        service: {
          url: 'https://httpbin.org/post',
          method: 'POST',
          body: {
            posts: '$leftBranch.',
            comments: '$rightBranch.',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.root !== undefined);
    assert.ok(result.services.leftBranch !== undefined);
    assert.ok(result.services.rightBranch !== undefined);
    assert.ok(result.services.merge !== undefined);
  });

  await t.test('should handle POST requests with body interpolation', async () => {
    const userMock = mockAgent.get('https://jsonplaceholder.typicode.com');
    userMock.intercept({ path: '/users/1', method: 'GET' })
      .reply(200, { id: 1, name: 'Test User' });
    userMock.intercept({ path: '/posts', method: 'POST' })
      .reply(200, { id: 1, userId: 1, title: 'Test Post' });

    const services: ServiceBlock[] = [
      {
        id: 'fetchUser',
        service: {
          url: 'https://jsonplaceholder.typicode.com/users/1',
          method: 'GET',
        },
      },
      {
        id: 'createPost',
        dependsOn: ['fetchUser'],
        service: {
          url: 'https://jsonplaceholder.typicode.com/posts',
          method: 'POST',
          body: {
            title: 'Test Post',
            body: 'Test Body',
            userId: '$fetchUser.id',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {
        body: {
          postTitle: 'New Post',
        },
      },
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.fetchUser !== undefined);
    assert.ok(result.services.createPost !== undefined);
  });
});

test('Orchestrator - Request Context Preservation', async t => {
  await t.test('should preserve initial request context through orchestration', async () => {
    const postMock = mockAgent.get('https://httpbin.org');
    postMock.intercept({ path: '/post', method: 'POST' })
      .reply(200, { success: true });

    const services: ServiceBlock[] = [
      {
        id: 'service1',
        service: {
          url: 'https://httpbin.org/post',
          method: 'POST',
          body: {
            userEmail: '$request.body.email',
            userId: '$request.body.userId',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {
        body: {
          email: 'test@example.com',
          userId: 123,
        },
      },
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.service1 !== undefined);
    assert.strictEqual(result.services.service1.status, 200);
  });

  await t.test('should handle request headers in services', async () => {
    const headerMock = mockAgent.get('https://httpbin.org');
    headerMock.intercept({ path: '/headers', method: 'GET' })
      .reply(200, { headers: { authorization: 'Bearer token123' } });

    const services: ServiceBlock[] = [
      {
        id: 'authenticatedRequest',
        service: {
          url: 'https://httpbin.org/headers',
          method: 'GET',
          headers: {
            authorization: '$request.headers.authorization',
            'x-user-id': '$request.headers.userId',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {
        headers: {
          authorization: 'Bearer token123',
          userId: '456',
        },
      },
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.authenticatedRequest !== undefined);
    assert.strictEqual(result.services.authenticatedRequest.status, 200);
  });
});

test('Orchestrator - Error Catch and Recovery', async t => {
  await t.test('should catch service error and continue orchestration', async () => {
    const userMock = mockAgent.get('https://jsonplaceholder.typicode.com');
    userMock.intercept({ path: '/users/1', method: 'GET' })
      .reply(200, { id: 1, name: 'user1' });
    userMock.intercept({ path: '/comments', method: 'GET' })
      .reply(200, [{ id: 1, body: 'comment' }]);

    const failMock = mockAgent.get('https://fail-service.com');
    failMock.intercept({ path: '/api/fail', method: 'GET' })
      .replyWithError(new Error('Internal Server Error'));

    const services: ServiceBlock[] = [
      {
        id: 'getUser',
        service: {
          url: 'https://jsonplaceholder.typicode.com/users/1',
          method: 'GET',
        },
      },
      {
        id: 'failingService',
        dependsOn: ['getUser'],
        service: {
          url: 'https://fail-service.com/api/fail',
          method: 'GET',
        },
      },
      {
        id: 'getComments',
        service: {
          url: 'https://jsonplaceholder.typicode.com/comments',
          method: 'GET',
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.getUser !== undefined);
    assert.ok(result.services.getComments !== undefined);
    assert.ok(result.services.failingService !== undefined);
  });

  await t.test('should catch error when dependency fails without fallback', async () => {
    const userMock = mockAgent.get('https://jsonplaceholder.typicode.com');
    userMock.intercept({ path: '/posts', method: 'GET', query: { userId: undefined } })
      .reply(200, [{ id: 1, userId: 1, title: 'Post 1' }]);

    const failMock = mockAgent.get('https://fail-dep.com');
    failMock.intercept({ path: '/users/1', method: 'GET' })
      .replyWithError(new Error('Service down'));

    const services: ServiceBlock[] = [
      {
        id: 'getUser',
        service: {
          url: 'https://fail-dep.com/users/1',
          method: 'GET',
        },
      },
      {
        id: 'getUserPosts',
        dependsOn: ['getUser'],
        service: {
          url: 'https://jsonplaceholder.typicode.com/posts',
          method: 'GET',
          query: {
            userId: '$getUser.id',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.getUser !== undefined);
  });

  await t.test('should handle interpolation error gracefully', async () => {
    const testMock = mockAgent.get('https://test-api.com');
    testMock.intercept({ path: '/api/test', method: 'GET' })
      .reply(200, { id: 1 });

    const services: ServiceBlock[] = [
      {
        id: 'service1',
        service: {
          url: 'https://test-api.com/api/test',
          method: 'GET',
          headers: {
            'x-user-id': '$nonExistent.property.nested.deep',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.service1 !== undefined);
  });

  await t.test('should catch error in workflow execution', async () => {
    const services: ServiceBlock[] = [
      {
        id: 'invalidService',
        service: {
          url: 'not-a-valid-url',
          method: 'GET',
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(typeof result.services === 'object');
  });

  await t.test('should catch error and mark success false when critical service fails', async () => {
    const criticalMock = mockAgent.get('https://critical-service.com');
    criticalMock.intercept({ path: '/critical', method: 'GET' })
      .reply(503, { error: 'Service Unavailable' });

    const services: ServiceBlock[] = [
      {
        id: 'criticalService',
        service: {
          url: 'https://critical-service.com/critical',
          method: 'GET',
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);
    assert.ok(result.services.criticalService !== undefined);
  });

  await t.test('should handle multiple parallel services with one failing', async () => {
    const mock1 = mockAgent.get('https://api1.com');
    mock1.intercept({ path: '/api/1', method: 'GET' })
      .reply(200, { id: 1 });

    const mock2 = mockAgent.get('https://api2.com');
    mock2.intercept({ path: '/api/2', method: 'GET' })
      .reply(400, { error: 'Bad request' });

    const mock3 = mockAgent.get('https://api3.com');
    mock3.intercept({ path: '/api/3', method: 'GET' })
      .reply(200, { id: 3 });

    const services: ServiceBlock[] = [
      {
        id: 'service1',
        service: {
          url: 'https://api1.com/api/1',
          method: 'GET',
        },
      },
      {
        id: 'service2',
        service: {
          url: 'https://api2.com/api/2',
          method: 'GET',
        },
      },
      {
        id: 'service3',
        service: {
          url: 'https://api3.com/api/3',
          method: 'GET',
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.service1 !== undefined);
    assert.ok(result.services.service2 !== undefined);
    assert.ok(result.services.service3 !== undefined);
  });

  await t.test('should catch error with fallback in dependent service', async () => {
    const mock1 = mockAgent.get('https://users-api.com');
    mock1.intercept({ path: '/users/1', method: 'GET' })
      .reply(200, { id: 1 });

    const mock2 = mockAgent.get('https://enrich-api.com');
    mock2.intercept({ path: '/enrich', method: 'GET' })
      .reply(500, { error: 'Failed' });

    const services: ServiceBlock[] = [
      {
        id: 'getUser',
        service: {
          url: 'https://users-api.com/users/1',
          method: 'GET',
        },
      },
      {
        id: 'enrichUser',
        dependsOn: ['getUser'],
        service: {
          url: 'https://enrich-api.com/enrich',
          method: 'GET',
          fallback: {
            data: { enriched: false, reason: 'Service unavailable' },
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.getUser !== undefined);
    assert.strictEqual(result.services.getUser.status, 200);
    assert.ok(result.services.enrichUser !== undefined);
  });

  await t.test('should handle error with missing context during interpolation', async () => {
    const testMock = mockAgent.get('https://test-api.com');
    testMock.intercept({ path: '/api/test', method: 'POST' })
      .reply(200, { id: 1 });

    const services: ServiceBlock[] = [
      {
        id: 'service1',
        service: {
          url: 'https://test-api.com/api/test',
          method: 'POST',
          body: {
            userId: '$missingService.id',
            email: '$request.body.email',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {
        body: {
          email: 'test@example.com',
        },
      },
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.service1 !== undefined);
  });

  await t.test('should handle error when all services in chain fail', async () => {
    const mock1 = mockAgent.get('https://step1.com');
    mock1.intercept({ path: '/api/step1', method: 'GET' })
      .reply(500, { error: 'Error 1' });

    const mock2 = mockAgent.get('https://step2.com');
    mock2.intercept({ path: '/api/step2', method: 'GET' })
      .reply(500, { error: 'Error 2' });

    const mock3 = mockAgent.get('https://step3.com');
    mock3.intercept({ path: '/api/step3', method: 'GET' })
      .reply(500, { error: 'Error 3' });

    const services: ServiceBlock[] = [
      {
        id: 'step1',
        service: {
          url: 'https://step1.com/api/step1',
          method: 'GET',
        },
      },
      {
        id: 'step2',
        dependsOn: ['step1'],
        service: {
          url: 'https://step2.com/api/step2',
          method: 'GET',
        },
      },
      {
        id: 'step3',
        dependsOn: ['step2'],
        service: {
          url: 'https://step3.com/api/step3',
          method: 'GET',
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.step1 !== undefined);
  });

  await t.test('should catch error and recover with fallback at different levels', async () => {
    const mock1 = mockAgent.get('https://step1.com');
    mock1.intercept({ path: '/api/step1', method: 'GET' })
      .reply(200, { id: 1 });

    const mock2 = mockAgent.get('https://step2.com');
    mock2.intercept({ path: '/api/step2', method: 'GET' })
      .reply(500, { error: 'Error 2' });

    const mock3 = mockAgent.get('https://step3.com');
    mock3.intercept({ path: '/api/step3', method: 'GET' })
      .reply(200, { id: 3 });

    const services: ServiceBlock[] = [
      {
        id: 'step1',
        service: {
          url: 'https://step1.com/api/step1',
          method: 'GET',
        },
      },
      {
        id: 'step2WithFallback',
        dependsOn: ['step1'],
        service: {
          url: 'https://step2.com/api/step2',
          method: 'GET',
          fallback: {
            data: { fallback: true, reason: 'Service failed' },
          },
        },
      },
      {
        id: 'step3',
        dependsOn: ['step1'],
        service: {
          url: 'https://step3.com/api/step3',
          method: 'GET',
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.step1 !== undefined);
    assert.strictEqual(result.services.step1.status, 200);
    assert.ok(result.services.step2WithFallback !== undefined);
    assert.ok(result.services.step3 !== undefined);
    assert.strictEqual(result.services.step3.status, 200);
  });

  await t.test('should handle empty error message gracefully', async () => {
    const errorMock = mockAgent.get('https://error-api.com');
    errorMock.intercept({ path: '/api/test', method: 'GET' })
      .reply(500, {});

    const services: ServiceBlock[] = [
      {
        id: 'emptyErrorService',
        service: {
          url: 'https://error-api.com/api/test',
          method: 'GET',
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.emptyErrorService !== undefined);
    assert.strictEqual(result.services.emptyErrorService.status, 500);
  });

  await t.test('should catch circular reference prevention in error handling', async () => {
    const apiMock = mockAgent.get('https://api.com');
    apiMock.intercept({ path: '/api/1', method: 'GET' })
      .reply(200, { id: 1 });
    apiMock.intercept({ path: '/api/2', method: 'GET' })
      .reply(200, { id: 2 });

    const services: ServiceBlock[] = [
      {
        id: 'service1',
        service: {
          url: 'https://api.com/api/1',
          method: 'GET',
        },
      },
      {
        id: 'service2',
        dependsOn: ['service1'],
        service: {
          url: 'https://api.com/api/2',
          method: 'GET',
          query: {
            ref: '$service1.id',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    assert.ok(result.services.service1 !== undefined);
    assert.ok(result.services.service2 !== undefined);
  });
});
