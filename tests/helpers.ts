import * as http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Mock HTTP server helper for testing
 */
export class MockServer {
  private server: http.Server;
  private port: number = 0;
  private baseUrl: string = '';

  constructor(
    private handler: (
      req: IncomingMessage,
      res: ServerResponse,
    ) => void = defaultHandler,
  ) {
    this.server = http.createServer(this.handler);
  }

  async listen(): Promise<string> {
    return new Promise((resolve) => {
      this.server.listen(0, 'localhost', () => {
        const address = this.server.address();
        if (address && typeof address !== 'string') {
          this.port = address.port;
          this.baseUrl = `http://localhost:${this.port}`;
          resolve(this.baseUrl);
        }
      });
    });
  }

  getUrl(path: string = ''): string {
    return `${this.baseUrl}${path}`;
  }

  async close(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }
}

/**
 * Default handler for mock server
 */
function defaultHandler(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}

/**
 * Create a JSON response handler
 */
export function jsonHandler(data: any, statusCode: number = 200) {
  return (req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(statusCode, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };
}

/**
 * Create a handler that validates headers
 */
export function headerValidatingHandler(
  expectedHeaders: Record<string, string>,
  data: any = { success: true },
  statusCode: number = 200,
) {
  return (req: IncomingMessage, res: ServerResponse) => {
    for (const [key, value] of Object.entries(expectedHeaders)) {
      const actualValue = req.headers[key.toLowerCase()];
      if (actualValue !== value) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            error: `Header ${key} mismatch. Expected: ${value}, Got: ${actualValue}`,
          }),
        );
        return;
      }
    }

    res.writeHead(statusCode, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };
}

/**
 * Create a handler that validates query parameters
 */
export function queryParamHandler(
  expectedParams: Record<string, string>,
  data: any = { success: true },
) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '', 'http://localhost');
    const params = url.searchParams;

    for (const [key, value] of Object.entries(expectedParams)) {
      const actualValue = params.get(key);
      if (actualValue !== value) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            error: `Query param ${key} mismatch. Expected: ${value}, Got: ${actualValue}`,
          }),
        );
        return;
      }
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };
}

/**
 * Create a handler that echoes request body
 */
export function echoBodyHandler() {
  return (req: IncomingMessage, res: ServerResponse) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      const data = body ? JSON.parse(body) : {};
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ received: data }));
    });
  };
}

/**
 * Create a handler that sets response cookies
 */
export function cookieHandler(cookies: Record<string, string>) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const setCookieHeaders = Object.entries(cookies).map(
      ([key, value]) => `${key}=${value}; Path=/`,
    );
    res.writeHead(200, {
      'content-type': 'application/json',
      'set-cookie': setCookieHeaders,
    });
    res.end(JSON.stringify({ success: true }));
  };
}

/**
 * Create a handler that validates cookies
 */
export function cookieValidatingHandler(expectedCookies: Record<string, string>) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const cookies = parseCookies(req.headers.cookie || '');

    for (const [key, value] of Object.entries(expectedCookies)) {
      if (cookies[key] !== value) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            error: `Cookie ${key} mismatch. Expected: ${value}, Got: ${cookies[key]}`,
          }),
        );
        return;
      }
    }

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ success: true }));
  };
}

/**
 * Parse cookies from cookie header
 */
function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').forEach((cookie) => {
    const [key, value] = cookie.split('=');
    if (key && value) {
      cookies[key.trim()] = value.trim();
    }
  });
  return cookies;
}

/**
 * Create a handler that returns different responses based on HTTP method
 */
export function methodHandler(handlers: Record<string, Function>) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const method = req.method || 'GET';
    const handler = handlers[method];

    if (!handler) {
      res.writeHead(405, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: `Method ${method} not allowed` }));
      return;
    }

    handler(req, res);
  };
}

/**
 * Create a handler that returns text/html content
 */
export function htmlHandler(html: string) {
  return (req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  };
}

/**
 * Create a handler that simulates server error
 */
export function errorHandler(statusCode: number = 500, message: string = 'Internal Server Error') {
  return (req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(statusCode, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  };
}

/**
 * Create a handler that simulates delayed response
 */
export function delayedHandler(delayMs: number, data: any = { success: true }) {
  return (req: IncomingMessage, res: ServerResponse) => {
    setTimeout(() => {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(data));
    }, delayMs);
  };
}

/**
 * Create a handler that returns binary media (image/png, etc.)
 */
export function binaryMediaHandler(
  contentType: string,
  buffer: Buffer,
  statusCode: number = 200,
) {
  return (req: IncomingMessage, res: ServerResponse) => {
    res.writeHead(statusCode, { 'content-type': contentType });
    res.end(buffer);
  };
}
