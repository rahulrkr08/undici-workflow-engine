import { request as undiciRequest, Agent as UndiciAgent } from 'undici';
import type { ServiceConfig, ServiceResult } from './types.js';

/**
 * Executes a single HTTP service call using Undici
 */
export async function executeService(
  config: ServiceConfig
): Promise<ServiceResult> {
  try {
    const agent = new UndiciAgent()
    // Build URL with query params
    let url = config.url;
    if (config.query && Object.keys(config.query).length > 0) {
      const params = new URLSearchParams(config.query);
      url = `${url}?${params.toString()}`;
    }

    // Prepare headers
    const headers = new Map<string, string>();
    if (config.headers) {
      Object.entries(config.headers).forEach(([key, value]) => {
        headers.set(key, value);
      });
    }

    // Add content-type for POST/PUT/PATCH with body
    if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method.toUpperCase())) {
      if (!headers.has('content-type')) {
        headers.set('content-type', 'application/json');
      }
    }

    // Add cookies to headers
    if (config.cookies && Object.keys(config.cookies).length > 0) {
      const cookieHeader = Object.entries(config.cookies)
        .map(([key, value]) => `${key}=${value}`)
        .join('; ');
      headers.set('cookie', cookieHeader);
    }

    // Prepare request body
    let body: string | undefined;
    if (config.body && ['POST', 'PUT', 'PATCH'].includes(config.method.toUpperCase())) {
      body = JSON.stringify(config.body);
    }

    // Setup request options
    const options: any = {
      method: config.method,
      headers: Object.fromEntries(headers),
      bodyTimeout: config.timeout || 30000,
      headersTimeout: config.timeout || 30000,
    };

    if (body) {
      options.body = body;
    }

    // Setup OIDC interceptor if configured
    if (config.oidc) {
      // @ts-expect-error types missing
      const { createOIDCInterceptor } = await import('undici-oidc-interceptor');
      const oidcInterceptor = createOIDCInterceptor({
        clientId: config.oidc.clientId,
        clientSecret: config.oidc.clientSecret,
        scope: config.oidc.scope,
        tokenUrl: config.oidc.tokenUrl,
      });

      agent.compose(oidcInterceptor);
      options.dispatcher = agent;
    }

    // Execute HTTP request
    const response = await undiciRequest(url, options);

    // Parse response body
    let parsedBody: any;
    const contentType = response.headers['content-type'];

    if (typeof contentType === 'string' && contentType.includes('application/json')) {
      const text = await response.body.text();
      parsedBody = text ? JSON.parse(text) : null;
    } else {
      parsedBody = await response.body.text();
    }

    // Extract response headers
    const responseHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(response.headers)) {
      if (typeof value === 'string') {
        responseHeaders[key] = value;
      } else if (Array.isArray(value)) {
        responseHeaders[key] = value.join(', ');
      }
    }

    // Extract cookies from Set-Cookie header
    const responseCookies: Record<string, string> = {};
    const setCookie = response.headers['set-cookie'];
    if (setCookie) {
      const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
      for (const cookie of cookies) {
        const match = cookie.match(/^([^=]+)=([^;]+)/);
        if (match) {
          responseCookies[match[1]] = match[2];
        }
      }
    }

    return {
      status: response.statusCode,
      body: parsedBody,
      headers: responseHeaders,
      cookies: responseCookies,
    };
  } catch (error: any) {
    // If fallback is configured, return it
    if (config.fallback) {
      return {
        status: null,
        body: config.fallback.data,
        fallbackUsed: true,
      };
    }

    // Otherwise, return error
    return {
      status: null,
      body: null,
      error: {
        message: error.message,
        code: error.code,
      },
    };
  }
}
