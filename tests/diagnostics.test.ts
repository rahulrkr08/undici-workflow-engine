import { test } from 'node:test';
import assert from 'node:assert';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { emitServiceStart, emitServiceComplete, emitServiceError } from '../src/diagnostics.js';
import type { ServiceConfig, OrchestrationContext } from '../src/types.js';

test('Diagnostics - Service Channel Events', async (t) => {
  await t.test('should emit start event with request information', async () => {
    const startEvents: any[] = [];
    const listener = (message: any) => {
      startEvents.push(message);
    };

    subscribe('workflow:service:start', listener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/users/1',
        method: 'GET',
        headers: { 'x-custom': 'value' },
        query: { format: 'json' },
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      emitServiceStart('getUser', config, context);

      assert.strictEqual(startEvents.length, 1, 'Start event should be emitted');
      assert.strictEqual(startEvents[0].serviceId, 'getUser');
      assert.strictEqual(startEvents[0].request.url, 'http://api.example.com/users/1');
      assert.strictEqual(startEvents[0].request.method, 'GET');
      assert.deepStrictEqual(startEvents[0].request.headers, { 'x-custom': 'value' });
      assert.deepStrictEqual(startEvents[0].request.query, { format: 'json' });
      assert.ok(typeof startEvents[0].timestamp === 'number');
    } finally {
      unsubscribe('workflow:service:start', listener);
    }
  });

  await t.test('should include all request details in diagnostic message', async () => {
    const messages: any[] = [];
    const listener = (message: any) => {
      messages.push(message);
    };

    subscribe('workflow:service:start', listener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/data',
        method: 'POST',
        headers: { authorization: 'Bearer token' },
        body: { userId: 123 },
        query: { version: 'v2' },
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      emitServiceStart('fetchData', config, context);

      assert.strictEqual(messages.length, 1);
      assert.strictEqual(messages[0].request.method, 'POST');
      assert.deepStrictEqual(messages[0].request.body, { userId: 123 });
      assert.strictEqual(messages[0].request.headers.authorization, 'Bearer token');
    } finally {
      unsubscribe('workflow:service:start', listener);
    }
  });

  await t.test('should emit complete event with processing time and status', async () => {
    const completeEvents: any[] = [];
    const listener = (message: any) => {
      completeEvents.push(message);
    };

    subscribe('workflow:service:complete', listener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/data',
        method: 'GET',
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      emitServiceComplete('getData', config, context, 150, 200);

      assert.strictEqual(completeEvents.length, 1, 'Complete event should be emitted');
      assert.strictEqual(completeEvents[0].serviceId, 'getData');
      assert.strictEqual(completeEvents[0].processingTime, 150);
      assert.strictEqual(completeEvents[0].status, 200);
      assert.ok(typeof completeEvents[0].timestamp === 'number');
    } finally {
      unsubscribe('workflow:service:complete', listener);
    }
  });

  await t.test('should emit complete event with fallback flag', async () => {
    const completeEvents: any[] = [];
    const listener = (message: any) => {
      completeEvents.push(message);
    };

    subscribe('workflow:service:complete', listener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/fallback',
        method: 'GET',
        fallback: { data: { default: true } },
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      emitServiceComplete('fallbackService', config, context, 50, null, true);

      assert.strictEqual(completeEvents.length, 1);
      assert.strictEqual(completeEvents[0].fallbackUsed, true);
      assert.strictEqual(completeEvents[0].status, null);
    } finally {
      unsubscribe('workflow:service:complete', listener);
    }
  });

  await t.test('should emit error event with error information', async () => {
    const errorEvents: any[] = [];
    const listener = (message: any) => {
      errorEvents.push(message);
    };

    subscribe('workflow:service:error', listener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/error',
        method: 'GET',
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      const error = new Error('Connection timeout') as any;
      error.code = 'ECONNREFUSED';

      emitServiceError('failingService', config, context, 5000, error);

      assert.strictEqual(errorEvents.length, 1, 'Error event should be emitted');
      assert.strictEqual(errorEvents[0].serviceId, 'failingService');
      assert.strictEqual(errorEvents[0].processingTime, 5000);
      assert.strictEqual(errorEvents[0].error.message, 'Connection timeout');
      assert.strictEqual(errorEvents[0].error.code, 'ECONNREFUSED');
    } finally {
      unsubscribe('workflow:service:error', listener);
    }
  });

  await t.test('should handle error with missing message property', async () => {
    const errorEvents: any[] = [];
    const listener = (message: any) => {
      errorEvents.push(message);
    };

    subscribe('workflow:service:error', listener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/error',
        method: 'GET',
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      const error = { code: 'UNKNOWN' };

      emitServiceError('unknownError', config, context, 100, error);

      assert.strictEqual(errorEvents.length, 1);
      assert.strictEqual(errorEvents[0].error.message, '[object Object]');
      assert.strictEqual(errorEvents[0].error.code, 'UNKNOWN');
    } finally {
      unsubscribe('workflow:service:error', listener);
    }
  });

  await t.test('should include request headers in diagnostic message', async () => {
    const startEvents: any[] = [];
    const listener = (message: any) => {
      startEvents.push(message);
    };

    subscribe('workflow:service:start', listener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/auth',
        method: 'GET',
        headers: {
          authorization: 'Bearer token123',
          'content-type': 'application/json',
        },
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      emitServiceStart('authService', config, context);

      assert.deepStrictEqual(startEvents[0].request.headers, {
        authorization: 'Bearer token123',
        'content-type': 'application/json',
      });
    } finally {
      unsubscribe('workflow:service:start', listener);
    }
  });

  await t.test('should include query parameters in diagnostic message', async () => {
    const startEvents: any[] = [];
    const listener = (message: any) => {
      startEvents.push(message);
    };

    subscribe('workflow:service:start', listener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/search',
        method: 'GET',
        query: { q: 'test', limit: '10', offset: '0' },
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      emitServiceStart('searchService', config, context);

      assert.deepStrictEqual(startEvents[0].request.query, {
        q: 'test',
        limit: '10',
        offset: '0',
      });
    } finally {
      unsubscribe('workflow:service:start', listener);
    }
  });

  await t.test('should include request body in diagnostic message', async () => {
    const startEvents: any[] = [];
    const listener = (message: any) => {
      startEvents.push(message);
    };

    subscribe('workflow:service:start', listener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/create',
        method: 'POST',
        body: { name: 'John', email: 'john@example.com', active: true },
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      emitServiceStart('createService', config, context);

      assert.deepStrictEqual(startEvents[0].request.body, {
        name: 'John',
        email: 'john@example.com',
        active: true,
      });
    } finally {
      unsubscribe('workflow:service:start', listener);
    }
  });

  await t.test('should include error code in error event', async () => {
    const errorEvents: any[] = [];
    const listener = (message: any) => {
      errorEvents.push(message);
    };

    subscribe('workflow:service:error', listener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/error',
        method: 'GET',
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      const error = new Error('Socket hang up') as any;
      error.code = 'ECONNRESET';

      emitServiceError('errorService', config, context, 250, error);

      assert.strictEqual(errorEvents[0].error.code, 'ECONNRESET');
      assert.strictEqual(errorEvents[0].error.message, 'Socket hang up');
    } finally {
      unsubscribe('workflow:service:error', listener);
    }
  });

  await t.test('should emit multiple events in sequence', async () => {
    const startEvents: any[] = [];
    const completeEvents: any[] = [];

    const startListener = (message: any) => {
      startEvents.push(message);
    };
    const completeListener = (message: any) => {
      completeEvents.push(message);
    };

    subscribe('workflow:service:start', startListener);
    subscribe('workflow:service:complete', completeListener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/multi',
        method: 'GET',
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      emitServiceStart('service1', config, context);
      emitServiceComplete('service1', config, context, 100, 200);

      assert.strictEqual(startEvents.length, 1);
      assert.strictEqual(completeEvents.length, 1);
      assert.strictEqual(startEvents[0].serviceId, 'service1');
      assert.strictEqual(completeEvents[0].serviceId, 'service1');
    } finally {
      unsubscribe('workflow:service:start', startListener);
      unsubscribe('workflow:service:complete', completeListener);
    }
  });

  await t.test('should not publish when no subscribers exist', async () => {
    // This test verifies the hasSubscribers check works correctly
    // by ensuring no errors occur when calling emit functions without subscribers
    const config: ServiceConfig = {
      url: 'http://api.example.com/no-sub',
      method: 'GET',
    };

    const context: OrchestrationContext = {
      request: { body: {}, headers: {}, cookies: {}, query: {} },
    };

    // These should not throw even though no one is listening
    emitServiceStart('noSub1', config, context);
    emitServiceComplete('noSub2', config, context, 0, 200);
    emitServiceError('noSub3', config, context, 0, new Error('test'));

    assert.ok(true, 'No errors when emitting without subscribers');
  });

  await t.test('should handle complete event without fallback flag', async () => {
    const completeEvents: any[] = [];
    const listener = (message: any) => {
      completeEvents.push(message);
    };

    subscribe('workflow:service:complete', listener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/success',
        method: 'GET',
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      emitServiceComplete('successService', config, context, 75, 201);

      assert.strictEqual(completeEvents.length, 1);
      assert.strictEqual(completeEvents[0].fallbackUsed, undefined);
      assert.strictEqual(completeEvents[0].status, 201);
    } finally {
      unsubscribe('workflow:service:complete', listener);
    }
  });

  await t.test('should include all fields in start event with complete config', async () => {
    const startEvents: any[] = [];
    const listener = (message: any) => {
      startEvents.push(message);
    };

    subscribe('workflow:service:start', listener);

    try {
      const config: ServiceConfig = {
        url: 'http://api.example.com/complete',
        method: 'PUT',
        headers: { 'x-auth': 'secret' },
        body: { data: 'payload' },
        query: { id: '123' },
        timeout: 5000,
      };

      const context: OrchestrationContext = {
        request: { body: {}, headers: {}, cookies: {}, query: {} },
      };

      emitServiceStart('completeService', config, context);

      const event = startEvents[0];
      assert.strictEqual(event.request.url, 'http://api.example.com/complete');
      assert.strictEqual(event.request.method, 'PUT');
      assert.deepStrictEqual(event.request.headers, { 'x-auth': 'secret' });
      assert.deepStrictEqual(event.request.body, { data: 'payload' });
      assert.deepStrictEqual(event.request.query, { id: '123' });
    } finally {
      unsubscribe('workflow:service:start', listener);
    }
  });
});
