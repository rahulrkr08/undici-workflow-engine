import { test } from 'node:test';
import * as assert from 'node:assert';
import { runOrchestration } from '../src/orchestrator.js';
import type { ServiceBlock, OrchestrationContext } from '../src/types.js';
import { MockAgent, setGlobalDispatcher } from 'undici';

const mockAgent = new MockAgent();
setGlobalDispatcher(mockAgent);
mockAgent.disableNetConnect();

test('Condition: skip service when condition evaluates to false', async () => {
  const userMock = mockAgent.get('https://example.com');
  userMock.intercept({ path: '/protected', method: 'GET' })
    .reply(200, { data: 'secret' });

  const services: ServiceBlock[] = [
    {
      id: 'protectedService',
      condition: () => false,
      service: {
        url: 'https://example.com/protected',
        method: 'GET',
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);

  // Service should be skipped and not in results
  assert.strictEqual(result.services.protectedService, undefined);
});

test('Condition: skip dependent service when condition is false', async () => {
  const userMock = mockAgent.get('https://example2.com');
  userMock.intercept({ path: '/auth', method: 'POST' })
    .reply(200, { isAdmin: false });
  userMock.intercept({ path: '/admin', method: 'GET' })
    .reply(200, { role: 'admin' });

  const services: ServiceBlock[] = [
    {
      id: 'auth',
      service: {
        url: 'https://example2.com/auth',
        method: 'POST',
        body: { user: 'user' },
      },
    },
    {
      id: 'adminPanel',
      dependsOn: ['auth'],
      condition: (context: any) => {
        const auth = context.getAll().auth;
        return auth?.body?.isAdmin === true;
      },
      service: {
        url: 'https://example2.com/admin',
        method: 'GET',
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);

  assert.strictEqual(result.services.auth.status, 200);
  // adminPanel should be skipped because condition is false
  assert.strictEqual(result.services.adminPanel, undefined);
});

test('ErrorStrategy: throw can be used to mark critical errors', async () => {
  const userMock = mockAgent.get('https://example3.com');
  userMock.intercept({ path: '/critical', method: 'GET' })
    .reply(500, { error: 'Server error' });

  const services: ServiceBlock[] = [
    {
      id: 'criticalService',
      errorStrategy: 'throw',
      service: {
        url: 'https://example3.com/critical',
        method: 'GET',
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);

  // Critical service should be in results with 500 status
  assert.strictEqual(result.services.criticalService.status, 500);
  // errorStrategy: 'throw' allows marking errors as critical
  // while still allowing the orchestration to complete
});

test('ErrorStrategy: silent on service error allows dependent execution', async () => {
  const userMock = mockAgent.get('https://example4.com');
  userMock.intercept({ path: '/service1', method: 'GET' })
    .reply(500, { error: 'Server error' });
  userMock.intercept({ path: '/service2', method: 'GET' })
    .reply(200, { result: 'ok' });

  const services: ServiceBlock[] = [
    {
      id: 'service1',
      service: {
        url: 'https://example4.com/service1',
        method: 'GET',
      },
    },
    {
      id: 'service2',
      dependsOn: ['service1'],
      service: {
        url: 'https://example4.com/service2',
        method: 'GET',
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);

  // With errorStrategy: 'silent' (default), dependent services should still execute even if dependency fails
  assert.strictEqual(result.services.service1.status, 500);
  assert.strictEqual(result.services.service2.status, 200);
});

test('Condition: use request context in condition to skip service', async () => {
  const userMock = mockAgent.get('https://example5.com');
  userMock.intercept({ path: '/admin-action', method: 'POST' })
    .reply(200, { action: 'completed' });

  const services: ServiceBlock[] = [
    {
      id: 'checkPermission',
      condition: (context: any) => {
        const request = context.getAll().request;
        return request?.body?.isAdmin === true;
      },
      service: {
        url: 'https://example5.com/admin-action',
        method: 'POST',
      },
    },
  ];

  const context: OrchestrationContext = {
    request: { body: { isAdmin: false } },
    env: {},
  };

  const result = await runOrchestration(services, context);

  // Service should be skipped because request.body.isAdmin is false
  assert.strictEqual(result.services.checkPermission, undefined);
});

test('Combined: condition false and errorStrategy throw', async () => {
  const userMock = mockAgent.get('https://example6.com');
  userMock.intercept({ path: '/validate', method: 'POST' })
    .reply(200, { isValid: false });
  userMock.intercept({ path: '/process', method: 'POST' })
    .reply(500, { error: 'Processing failed' });

  const services: ServiceBlock[] = [
    {
      id: 'validate',
      service: {
        url: 'https://example6.com/validate',
        method: 'POST',
      },
    },
    {
      id: 'process',
      dependsOn: ['validate'],
      condition: (context: any) => {
        const validate = context.getAll().validate;
        return validate?.body?.isValid === true;
      },
      errorStrategy: 'throw',
      service: {
        url: 'https://example6.com/process',
        method: 'POST',
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);

  assert.strictEqual(result.services.validate.status, 200);
  // Process should be skipped because validate condition is false
  assert.strictEqual(result.services.process, undefined);
});

test('Condition: multiple services with conditions - some skipped, some executed', async () => {
  const userMock = mockAgent.get('https://example7.com');
  userMock.intercept({ path: '/always', method: 'GET' })
    .reply(200, { data: 'always-runs' });
  userMock.intercept({ path: '/sometimes', method: 'GET' })
    .reply(200, { data: 'sometimes-runs' });

  const services: ServiceBlock[] = [
    {
      id: 'alwaysRun',
      condition: () => true,
      service: {
        url: 'https://example7.com/always',
        method: 'GET',
      },
    },
    {
      id: 'neverRun',
      condition: () => false,
      service: {
        url: 'https://example7.com/never',
        method: 'GET',
      },
    },
    {
      id: 'sometimesRun',
      condition: () => true,
      service: {
        url: 'https://example7.com/sometimes',
        method: 'GET',
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);

  // alwaysRun should execute
  assert.ok(result.services.alwaysRun);
  assert.strictEqual(result.services.alwaysRun.status, 200);

  // neverRun should be skipped
  assert.strictEqual(result.services.neverRun, undefined);

  // sometimesRun should execute
  assert.ok(result.services.sometimesRun);
  assert.strictEqual(result.services.sometimesRun.status, 200);
});

test('Condition: skipped service with fallback should include fallback data', async () => {
  const services: ServiceBlock[] = [
    {
      id: 'protectedService',
      condition: () => false,
      service: {
        url: 'https://example.com/protected',
        method: 'GET',
        fallback: {
          data: { defaultMessage: 'Service skipped, using fallback' },
        },
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);

  // Service should be skipped but fallback data should be included
  assert.ok(result.services.protectedService);
  assert.strictEqual(result.services.protectedService.status, null);
  assert.deepStrictEqual(result.services.protectedService.body, {
    defaultMessage: 'Service skipped, using fallback',
  });
  assert.strictEqual(result.services.protectedService.metadata?.fallbackUsed, true);
});

test('Condition: skipped service without fallback should not be included', async () => {
  const services: ServiceBlock[] = [
    {
      id: 'skippedService',
      condition: () => false,
      service: {
        url: 'https://example.com/skipped',
        method: 'GET',
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);

  // Service should be skipped and not in results (no fallback defined)
  assert.strictEqual(result.services.skippedService, undefined);
});

test('Condition: dependent service skipped with fallback includes fallback data', async () => {
  const userMock = mockAgent.get('https://example8.com');
  userMock.intercept({ path: '/auth', method: 'POST' })
    .reply(200, { isAdmin: false });

  const services: ServiceBlock[] = [
    {
      id: 'auth',
      service: {
        url: 'https://example8.com/auth',
        method: 'POST',
      },
    },
    {
      id: 'adminPanel',
      dependsOn: ['auth'],
      condition: (context: any) => {
        const auth = context.getAll().auth;
        return auth?.body?.isAdmin === true;
      },
      service: {
        url: 'https://example8.com/admin',
        method: 'GET',
        fallback: {
          data: { message: 'Admin access denied, using default dashboard' },
        },
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);

  assert.strictEqual(result.services.auth.status, 200);
  // adminPanel should be skipped but fallback data should be included
  assert.ok(result.services.adminPanel);
  assert.strictEqual(result.services.adminPanel.status, null);
  assert.deepStrictEqual(result.services.adminPanel.body, {
    message: 'Admin access denied, using default dashboard',
  });
  assert.strictEqual(result.services.adminPanel.metadata?.fallbackUsed, true);
});

test('Execution Status: executed service should have executionStatus set to "executed"', async () => {
  const userMock = mockAgent.get('https://example9.com');
  userMock.intercept({ path: '/data', method: 'GET' })
    .reply(200, { result: 'success' });

  const services: ServiceBlock[] = [
    {
      id: 'getData',
      service: {
        url: 'https://example9.com/data',
        method: 'GET',
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);

  assert.strictEqual(result.services.getData.metadata?.executionStatus, 'executed');
  assert.strictEqual(result.services.getData.status, 200);
});

test('Execution Status: skipped service with fallback should have executionStatus set to "skipped"', async () => {
  const services: ServiceBlock[] = [
    {
      id: 'conditionalService',
      condition: () => false,
      service: {
        url: 'https://example.com/api',
        method: 'GET',
        fallback: {
          data: { default: 'fallback' },
        },
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);

  assert.strictEqual(result.services.conditionalService.metadata?.executionStatus, 'skipped');
  assert.strictEqual(result.services.conditionalService.status, null);
  assert.strictEqual(result.services.conditionalService.metadata?.fallbackUsed, true);
});

test('Execution Status: failed service with fallback should have executionStatus set to "failed"', async () => {
  // Test a service that fails due to network error (not HTTP error status)
  // We'll use an invalid URL that causes a connection error
  const services: ServiceBlock[] = [
    {
      id: 'failService',
      service: {
        url: 'https://invalid-domain-that-does-not-exist-12345.test/api',
        method: 'GET',
        timeout: 100, // Short timeout to fail quickly
        fallback: {
          data: { message: 'Service failed, using fallback' },
        },
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);

  assert.strictEqual(result.services.failService.metadata?.executionStatus, 'failed');
  assert.strictEqual(result.services.failService.status, null);
  assert.strictEqual(result.services.failService.metadata?.fallbackUsed, true);
});

test('Execution Status: first service fails, second service should be pending', async () => {
  const services: ServiceBlock[] = [
    {
      id: 'failingService',
      errorStrategy: 'throw',
      service: {
        url: 'https://invalid-domain-that-does-not-exist-12345.test/api',
        method: 'GET',
        timeout: 100, // Short timeout to fail quickly
      },
    },
    {
      id: 'service2',
      dependsOn: ['failingService'],
      service: {
        url: 'https://example10.com/service2',
        method: 'GET',
      },
    },
  ];

  const context: OrchestrationContext = {
    request: {},
    env: {},
  };

  const result = await runOrchestration(services, context);
  console.log(JSON.stringify(result, null, 2));
  // First service should fail
  assert.strictEqual(result.services.failingService.metadata?.executionStatus, 'failed');
  assert.strictEqual(result.services.failingService.status, null);

  // Second service should be pending (not executed because dependency failed with errorStrategy: 'throw')
  assert.ok(result.services.service2);
  assert.strictEqual(result.services.service2.metadata?.executionStatus, 'pending');
  assert.strictEqual(result.services.service2.status, null);
});
