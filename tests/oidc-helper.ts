import * as http from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Simple in-memory token storage for testing
 */
class TokenStore {
  private tokens: Map<string, { token: string; expiresAt: number }> = new Map();

  store(clientId: string, token: string, expiresInSeconds: number = 3600) {
    this.tokens.set(clientId, {
      token,
      expiresAt: Date.now() + expiresInSeconds * 1000,
    });
  }

  get(clientId: string): string | null {
    const entry = this.tokens.get(clientId);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.tokens.delete(clientId);
      return null;
    }
    return entry.token;
  }

  clear() {
    this.tokens.clear();
  }
}

/**
 * Mock OIDC Provider for testing
 * Simulates an OAuth 2.0 / OIDC compliant token endpoint
 */
export class MockOIDCProvider {
  private server: http.Server;
  private port: number = 0;
  private baseUrl: string = '';
  private tokenStore = new TokenStore();
  private accessTokens: Map<string, string> = new Map();
  private refreshTokens: Map<string, { clientId: string; expiresAt: number }> = new Map();

  constructor(
    private clients: Array<{
      client_id: string;
      client_secret: string;
      grant_types?: string[];
    }> = [
      {
        client_id: 'test-client',
        client_secret: 'test-secret',
        grant_types: ['client_credentials', 'refresh_token'],
      },
    ]
  ) {
    this.server = http.createServer(this.handleRequest.bind(this));
  }

  async listen(port: number = 0): Promise<string> {
    return new Promise((resolve) => {
      this.server.listen(port, '127.0.0.1', () => {
        const address = this.server.address();
        if (address && typeof address !== 'string') {
          this.port = address.port;
          this.baseUrl = `http://127.0.0.1:${this.port}`;
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
      this.server.close(() => {
        this.tokenStore.clear();
        resolve();
      });
    });
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse) {
    if (req.url === '/oauth/token' && req.method === 'POST') {
      this.handleTokenRequest(req, res);
    } else if (req.url === '/.well-known/openid-configuration') {
      this.handleConfigRequest(res);
    } else if (req.url === '/.well-known/jwks.json') {
      this.handleJWKSRequest(res);
    } else {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not_found' }));
    }
  }

  private handleTokenRequest(req: IncomingMessage, res: ServerResponse) {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk.toString();
    });

    req.on('end', () => {
      try {
        const params = Object.fromEntries(new URLSearchParams(body));
        const { grant_type, client_id, client_secret, refresh_token } = params;

        // Validate client credentials
        const client = this.clients.find((c) => c.client_id === client_id);
        if (!client || client.client_secret !== client_secret) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'invalid_client' }));
          return;
        }

        if (grant_type === 'client_credentials') {
          this.handleClientCredentialsGrant(res, client_id);
        } else if (grant_type === 'refresh_token') {
          this.handleRefreshTokenGrant(res, client_id, refresh_token as string);
        } else {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'unsupported_grant_type' }));
        }
      } catch (error) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_request' }));
      }
    });
  }

  private handleClientCredentialsGrant(res: ServerResponse, clientId: string) {
    const accessToken = `access_token_${clientId}_${Date.now()}`;
    const refreshToken = `refresh_token_${clientId}_${Date.now()}`;

    this.accessTokens.set(accessToken, clientId);
    this.refreshTokens.set(refreshToken, {
      clientId,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    this.tokenStore.store(clientId, accessToken, 3600);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'api:read api:write',
      })
    );
  }

  private handleRefreshTokenGrant(res: ServerResponse, clientId: string, refreshToken: string) {
    const storedRefresh = this.refreshTokens.get(refreshToken);

    if (!storedRefresh || storedRefresh.clientId !== clientId || storedRefresh.expiresAt < Date.now()) {
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'invalid_grant' }));
      return;
    }

    const newAccessToken = `access_token_${clientId}_${Date.now()}`;
    const newRefreshToken = `refresh_token_${clientId}_${Date.now()}`;

    this.accessTokens.set(newAccessToken, clientId);
    this.refreshTokens.set(newRefreshToken, {
      clientId,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    });
    this.refreshTokens.delete(refreshToken);

    this.tokenStore.store(clientId, newAccessToken, 3600);

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        access_token: newAccessToken,
        refresh_token: newRefreshToken,
        token_type: 'Bearer',
        expires_in: 3600,
      })
    );
  }

  private handleConfigRequest(res: ServerResponse) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        issuer: this.baseUrl,
        authorization_endpoint: `${this.baseUrl}/oauth/authorize`,
        token_endpoint: `${this.baseUrl}/oauth/token`,
        jwks_uri: `${this.baseUrl}/.well-known/jwks.json`,
        token_endpoint_auth_methods_supported: ['client_secret_post', 'client_secret_basic'],
        grant_types_supported: ['client_credentials', 'refresh_token'],
      })
    );
  }

  private handleJWKSRequest(res: ServerResponse) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify({
        keys: [
          {
            kty: 'RSA',
            use: 'sig',
            alg: 'RS256',
            n: 'test',
            e: 'AQAB',
          },
        ],
      })
    );
  }

  /**
   * Create an intercepting handler that validates Bearer tokens
   */
  createProtectedHandler(expectedScopes?: string[]) {
    return (req: IncomingMessage, res: ServerResponse) => {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'unauthorized', message: 'Missing or invalid authorization header' }));
        return;
      }

      const token = authHeader.slice(7);
      const clientId = this.accessTokens.get(token);

      if (!clientId) {
        res.writeHead(401, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid_token', message: 'Token not found or expired' }));
        return;
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: true, clientId, authenticated: true }));
    };
  }
}

/**
 * Create a mock resource server that validates OIDC bearer tokens
 */
export function createOIDCProtectedServer(oidcProvider: MockOIDCProvider): http.Server {
  return http.createServer(oidcProvider.createProtectedHandler());
}

export { TokenStore };
