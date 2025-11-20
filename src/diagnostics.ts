import { channel } from 'node:diagnostics_channel';
import type { ServiceConfig, OrchestrationContext } from './types.js';

export const channels = {
  start: channel(`workflow:service:start`),
  complete: channel(`workflow:service:complete`),
  error: channel(`workflow:service:error`)
}

interface DiagnosticChannelMessage {
  serviceId: string;
  request: {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: any;
    query?: Record<string, string>;
  };
  timestamp: number;
  processingTime?: number;
  error?: {
    message: string;
    code?: string;
  };
  status?: number | null;
  fallbackUsed?: boolean;
}

/**
 * Emit a diagnostic channel event for service start
 */
export function emitServiceStart(
  serviceId: string,
  config: ServiceConfig,
  context: OrchestrationContext
): void {
  if (channels.start.hasSubscribers) {
    const message: DiagnosticChannelMessage = {
      serviceId,
      request: {
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: config.body,
        query: config.query,
      },
      timestamp: Date.now(),
    };

    channels.start.publish(message);
  }
}

/**
 * Emit a diagnostic channel event for service completion
 */
export function emitServiceComplete(
  serviceId: string,
  config: ServiceConfig,
  context: OrchestrationContext,
  processingTime: number,
  status: number | null,
  fallbackUsed?: boolean
): void {
  if (channels.complete.hasSubscribers) {
    const message: DiagnosticChannelMessage = {
      serviceId,
      request: {
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: config.body,
        query: config.query,
      },
      timestamp: Date.now(),
      processingTime,
      status,
      fallbackUsed,
    };

    channels.complete.publish(message);
  }
}

/**
 * Emit a diagnostic channel event for service error
 */
export function emitServiceError(
  serviceId: string,
  config: ServiceConfig,
  context: OrchestrationContext,
  processingTime: number,
  error: any
): void {
  

  if (channels.error.hasSubscribers) {
    const message: DiagnosticChannelMessage = {
      serviceId,
      request: {
        url: config.url,
        method: config.method,
        headers: config.headers,
        body: config.body,
        query: config.query,
      },
      timestamp: Date.now(),
      processingTime,
      error: {
        message: error.message || String(error),
        code: error.code,
      },
    };

    channels.error.publish(message);
  }
}
