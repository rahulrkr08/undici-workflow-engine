import { executeWorkflow, Process } from 'async-flow-orchestrator';
import type {
  ServiceBlock,
  OrchestrationContext,
  OrchestrationResult,
  ServiceResult,
  ServiceConfig,
} from './types.js';
import { interpolateObject } from './interpolation.js';
import { executeService } from './executor.js';
import { error } from 'console';

/**
 * Main orchestration function
 * Executes services in dependency order with variable interpolation
 */
export async function runOrchestration(
  services: ServiceBlock[],
  context: OrchestrationContext
): Promise<OrchestrationResult> {
  // Build processes array for async-flow-orchestrator
  const processes: Process[] = services.map(serviceBlock => ({
    id: serviceBlock.id,
    dependencies: serviceBlock.dependsOn || [],
    execute: async (workflowContext) => {
      // Interpolate service configuration
      const interpolatedConfig: ServiceConfig = await interpolateObject(
        serviceBlock.service,
        workflowContext.getAll() as OrchestrationContext
      );

      // Execute the HTTP service and return result
      // async-flow-orchestrator will store it in context
      const result = await executeService(
        interpolatedConfig,
        workflowContext.getAll() as OrchestrationContext,
        serviceBlock.id
      );

      // If service failed and errorStrategy is 'throw', throw error to stop dependent services
      const errorStrategy = serviceBlock.errorStrategy || 'silent';
      if (errorStrategy === 'throw' && (result.metadata?.executionStatus === 'failed' || result.error)) {
        const err = new Error(`Service ${serviceBlock.id} failed`);
        // Include the service result (including error details) for debugging
        (err as any).result = result;
        throw err;
      }

      return result;
    },
    condition: serviceBlock.condition,
    errorStrategy: serviceBlock.errorStrategy || 'silent', // Default to 'silent' for backward compatibility
  }));

  let workflowResult: any = await executeWorkflow({
    processes,
    initialContext: context,
  });
  console.log({workflowResult})
  // Extract service results from workflow data
  const servicesMap: Record<string, ServiceResult> = {};

  for (const serviceBlock of services) {
    const status = workflowResult.metadata?.states?.[serviceBlock.id];
    // Data can be in workflowResult.data (normal case) or in context (when execute threw)
    let data = workflowResult.data?.[serviceBlock.id];

    switch (status) {
      case 'completed':
        // Service completed successfully
        servicesMap[serviceBlock.id] = data as ServiceResult;
        break;

      case 'failed':
        // Service failed - the result should be in data or context
        const errorResult = workflowResult.metadata?.errors?.[serviceBlock.id];
        const { result: {metadata, ...error} } = errorResult || {};
        if(errorResult) {
          servicesMap[serviceBlock.id] = {
            error,
            status: errorResult.result?.status || null,
            metadata: metadata,
          } as ServiceResult;
        } 
        break;

      case 'skipped':
        // Service was skipped due to condition
        if (serviceBlock.service.fallback) {
          // For skipped services, include fallback data if defined
          servicesMap[serviceBlock.id] = {
            status: serviceBlock.service.fallback.status || null,
            body: serviceBlock.service.fallback.data,
            metadata: {
              executionStatus: 'skipped',
              fallbackUsed: true,
            },
          };
        }
        break;

      case 'pending':
        // Service was not executed due to failed dependencies
        servicesMap[serviceBlock.id] = {
          status: null,
          body: null,
          metadata: {
            executionStatus: 'pending',
          },
        };
        break;
    }
  }

  return {
    context,
    services: servicesMap,
  };
}
