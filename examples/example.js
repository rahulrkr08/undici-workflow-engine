import { runOrchestration } from './dist/index.js';
import { readFileSync } from 'fs';

// Load configuration from services.json
const configFile = readFileSync('./services.json', 'utf-8');
const config = JSON.parse(configFile);

// Context with request data
const context = {
  request: {
    body: {
      workspaceId: 'W-100',
    },
    headers: {
      'content-type': 'application/json',
    },
    cookies: {
      sessionId: 'xyz-session-123',
    },
  },
  env: {
    OIDC_CLIENT_ID: process.env.OIDC_CLIENT_ID || 'your-client-id',
    OIDC_CLIENT_SECRET: process.env.OIDC_CLIENT_SECRET || 'your-client-secret',
    OIDC_SCOPE: process.env.OIDC_SCOPE || 'openid profile',
  },
};

// Run the orchestration
async function main() {
  try {
    const result = await runOrchestration(config.services, context);
    
    console.log('Orchestration Result:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('✅ All services completed successfully!');
    } else {
      console.log('❌ Some services failed');
    }
  } catch (error) {
    console.error('Error running orchestration:', error);
  }
}

main();
