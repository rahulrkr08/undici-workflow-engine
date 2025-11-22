export interface ServiceConfig {
  url: string;
  method: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  query?: Record<string, string>;
  body?: any;
  timeout?: number;
  fallback?: {
    data: any;
  };
  oidc?: {
    clientId: string;
    clientSecret: string;
    scope?: string;
    tokenUrl?: string;
  };
  errorStrategy?: 'silent' | 'throw';
}

export interface ServiceBlock {
  id: string;
  dependsOn?: string[];
  service: ServiceConfig;
  condition?: (context: any) => boolean; // Context from async-flow-orchestrator (has getAll() method)
  errorStrategy?: 'silent' | 'throw';
}

export interface OrchestrationConfig {
  services: ServiceBlock[];
}

export interface OrchestrationContext {
  request: {
    body?: any;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
    query?: Record<string, string>;
  };
  env?: Record<string, string>;
  // Services will be added dynamically as they complete
  [serviceId: string]: any;
}

export interface ServiceResultMetadata {
  executionStatus?: 'executed' | 'skipped' | 'failed';
  fallbackUsed?: boolean;
}

export interface ServiceResult {
  status: number | null;
  body: any;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  error?: any;
  metadata?: ServiceResultMetadata;
}

export interface OrchestrationResult {
  context: Record<string, ServiceResult>;
  services: Record<string, ServiceResult>;
}
