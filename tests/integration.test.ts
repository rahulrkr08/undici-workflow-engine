import { test } from 'node:test';
import * as assert from 'node:assert';
import { runOrchestration } from '../src/orchestrator.js';
import { interpolateObject } from '../src/interpolation.js';
import type { ServiceBlock, OrchestrationContext } from '../src/types.js';
import { MockAgent, setGlobalDispatcher } from 'undici';


const mockAgent = new MockAgent()
setGlobalDispatcher(mockAgent)
mockAgent.disableNetConnect()

test('Integration - End-to-End Workflows', async t => {
  await t.test('should execute complete user data aggregation workflow', async () => {
    const refreshMock = mockAgent.get('https://jsonplaceholder.typicode.com')
    refreshMock.intercept({ path: '/users/1', method: 'GET' })
      .reply(200, {
        id: 1
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

    refreshMock.intercept({ path: '/posts', method: 'GET', query: { userId: '1' } })
      .reply(200, [
        { userId: 1 }
      ], {
        headers: { 'Content-Type': 'application/json' }
      });
    
    refreshMock.intercept({ path: '/albums', method: 'GET', query: { userId: '1' } })
      .reply(200, [
        { albumId: 1 },
      ], {
        headers: { 'Content-Type': 'application/json' }
      });

    const postMock = mockAgent.get('https://httpbin.org')
    postMock.intercept({ path: '/post', method: 'POST' })
      .reply(200, (opts) => {
        const body = opts.body ? JSON.parse(opts.body.toString()) : {};
        assert.equal(body.user?.body?.id, 1);
        assert.equal(body.postCount?.body?.length, 1);
        assert.equal(body.albumCount?.body?.length, 1);
        return {
          received: opts.body
        }
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

    const services: ServiceBlock[] = [
      {
        id: 'getUser',
        service: {
          url: 'https://jsonplaceholder.typicode.com/users/1',
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
            userId: '$getUser.body.id',
          },
        },
      },
      {
        id: 'getUserAlbums',
        dependsOn: ['getUser'],
        service: {
          url: 'https://jsonplaceholder.typicode.com/albums',
          method: 'GET',
          query: {
            userId: '$getUser.body.id',
          },
        },
      },
      {
        id: 'aggregateData',
        dependsOn: ['getUser', 'getUserPosts', 'getUserAlbums'],
        service: {
          url: 'https://httpbin.org/post',
          method: 'POST',
          body: {
            user: '$getUser.',
            postCount: '$getUserPosts.',
            albumCount: '$getUserAlbums.',
          },
        },
      },
    ];

    const context: OrchestrationContext = {
      request: {},
    };

    const result = await runOrchestration(services, context);

    // Verify all services executed
    assert.ok(result.services.getUser !== undefined);
    assert.ok(result.services.getUserPosts !== undefined);
    assert.ok(result.services.getUserAlbums !== undefined);
    assert.ok(result.services.aggregateData !== undefined);

    // Verify data was properly passed
    assert.ok(result.services.getUser.status! >= 200 && result.services.getUser.status! < 300);
  });
});
