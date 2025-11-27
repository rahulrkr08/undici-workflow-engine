// Main orchestration function
export { runOrchestration } from './orchestrator.js';

// Single service executor (for advanced use cases)
export { executeService } from './executor.js';

// Utility functions
export {
  interpolateValueAsync,
  interpolateObject,
  cookiesToHeader,
  buildQueryString,
} from './interpolation.js';

// Type definitions
export type {
  ServiceConfig,
  ServiceBlock,
  OrchestrationConfig,
  OrchestrationContext,
  ServiceResult,
  OrchestrationResult,
} from './types.js';
