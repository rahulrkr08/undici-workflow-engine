import { test } from 'node:test';
import * as assert from 'node:assert';
import { executeService } from '../src/executor.js';
import type { ServiceConfig } from '../src/types.js';
import { MockServer, binaryMediaHandler, jsonHandler } from './helpers.js';

test('Executor - Binary Media Handling', async (t) => {
  await t.test('should handle image/png responses as base64', async () => {
    // Create a simple PNG buffer (1x1 transparent pixel)
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
      0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
      0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    const server = new MockServer(binaryMediaHandler('image/png', pngBuffer));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/image'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    // Body should be base64 encoded
    assert.strictEqual(typeof result.body, 'string');
    // Verify it's valid base64
    const decoded = Buffer.from(result.body, 'base64');
    assert.deepStrictEqual(decoded, pngBuffer);
    // Verify metadata includes content-type
    assert.strictEqual(result.metadata?.contentType, 'image/png');
  });

  await t.test('should handle image/jpeg responses as base64', async () => {
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

    const server = new MockServer(binaryMediaHandler('image/jpeg', jpegBuffer));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/image.jpg'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(typeof result.body, 'string');
    const decoded = Buffer.from(result.body, 'base64');
    assert.deepStrictEqual(decoded, jpegBuffer);
    assert.strictEqual(result.metadata?.contentType, 'image/jpeg');
  });

  await t.test('should handle image/svg+xml responses as base64', async () => {
    const svgBuffer = Buffer.from('<svg></svg>');

    const server = new MockServer(binaryMediaHandler('image/svg+xml', svgBuffer));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/image.svg'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(typeof result.body, 'string');
    const decoded = Buffer.from(result.body, 'base64');
    assert.deepStrictEqual(decoded, svgBuffer);
    assert.strictEqual(result.metadata?.contentType, 'image/svg+xml');
  });

  await t.test('should handle application/pdf responses as base64', async () => {
    const pdfBuffer = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF header

    const server = new MockServer(binaryMediaHandler('application/pdf', pdfBuffer));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/document.pdf'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(typeof result.body, 'string');
    const decoded = Buffer.from(result.body, 'base64');
    assert.deepStrictEqual(decoded, pdfBuffer);
    assert.strictEqual(result.metadata?.contentType, 'application/pdf');
  });

  await t.test('should handle video/mp4 responses as base64', async () => {
    const videoBuffer = Buffer.from([0x00, 0x00, 0x00, 0x20, 0x66, 0x74, 0x79, 0x70]); // MP4 header

    const server = new MockServer(binaryMediaHandler('video/mp4', videoBuffer));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/video.mp4'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(typeof result.body, 'string');
    const decoded = Buffer.from(result.body, 'base64');
    assert.deepStrictEqual(decoded, videoBuffer);
    assert.strictEqual(result.metadata?.contentType, 'video/mp4');
  });

  await t.test('should handle audio/mpeg responses as base64', async () => {
    const audioBuffer = Buffer.from([0xff, 0xfb]); // MP3 header

    const server = new MockServer(binaryMediaHandler('audio/mpeg', audioBuffer));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/audio.mp3'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(typeof result.body, 'string');
    const decoded = Buffer.from(result.body, 'base64');
    assert.deepStrictEqual(decoded, audioBuffer);
    assert.strictEqual(result.metadata?.contentType, 'audio/mpeg');
  });

  await t.test('should handle application/octet-stream responses as base64', async () => {
    const binaryBuffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);

    const server = new MockServer(
      binaryMediaHandler('application/octet-stream', binaryBuffer),
    );
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/binary'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(typeof result.body, 'string');
    const decoded = Buffer.from(result.body, 'base64');
    assert.deepStrictEqual(decoded, binaryBuffer);
    assert.strictEqual(result.metadata?.contentType, 'application/octet-stream');
  });

  await t.test('should handle content-type with charset parameter', async () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

    const server = new MockServer(binaryMediaHandler('image/png; charset=utf-8', pngBuffer));
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/image'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(typeof result.body, 'string');
    const decoded = Buffer.from(result.body, 'base64');
    assert.deepStrictEqual(decoded, pngBuffer);
    assert.strictEqual(result.metadata?.contentType, 'image/png; charset=utf-8');
  });

  await t.test('should handle text/plain responses as text', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('Hello, World!');
    });
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/text'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body, 'Hello, World!');
    assert.strictEqual(result.metadata?.contentType, 'text/plain');
  });

  await t.test('should still handle application/json correctly', async () => {
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
    assert.strictEqual(result.metadata?.contentType, 'application/json');
  });

  await t.test('should handle text/html responses as text', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body>Hello</body></html>');
    });
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/html'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body, '<html><body>Hello</body></html>');
    assert.strictEqual(result.metadata?.contentType, 'text/html');
  });

  await t.test('should handle application/xml responses as text', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, { 'content-type': 'application/xml' });
      res.end('<root><item>test</item></root>');
    });
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/xml'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body, '<root><item>test</item></root>');
    assert.strictEqual(result.metadata?.contentType, 'application/xml');
  });

  await t.test('should handle missing content-type header', async () => {
    const server = new MockServer((req, res) => {
      res.writeHead(200, {});
      res.end('Hello, World!');
    });
    const url = await server.listen();
    t.after(() => server.close());

    const config: ServiceConfig = {
      url: server.getUrl('/api/unknown'),
      method: 'GET',
    };

    const result = await executeService(config);

    assert.strictEqual(result.status, 200);
    assert.strictEqual(result.body, 'Hello, World!');
    assert.strictEqual(result.metadata?.contentType, undefined);
  });
});
