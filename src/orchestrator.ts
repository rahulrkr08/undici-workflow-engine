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
      const interpolatedConfig: ServiceConfig = interpolateObject(
        serviceBlock.service,
        workflowContext.getAll()
      );

      // Execute the HTTP service and return result
      // async-flow-orchestrator will store it in context
      const result = await executeService(
        interpolatedConfig,
        workflowContext.getAll() as OrchestrationContext,
        serviceBlock.id
      );
      return result;
    },
    condition: serviceBlock.condition,
    errorStrategy: serviceBlock.errorStrategy || 'silent', // Default to 'silent' for backward compatibility
  }));

  try {
    // Run workflow - async-flow-orchestrator manages the context
    const workflowResult = await executeWorkflow({
      processes,
      initialContext: context,
    });

    // Extract service results from workflow data
    const servicesMap: Record<string, ServiceResult> = {};

    for (const serviceBlock of services) {
      const status = workflowResult.metadata.states[serviceBlock.id];
      const data = workflowResult.data[serviceBlock.id];

      // Include all services that were executed (completed, failed)
      if (status === 'completed' || status === 'failed') {
        servicesMap[serviceBlock.id] = data as ServiceResult;
      } else if (status === 'skipped' && serviceBlock.service.fallback) {
        // For skipped services, include fallback data if defined
        servicesMap[serviceBlock.id] = {
          status: null,
          body: serviceBlock.service.fallback.data,
          fallbackUsed: true,
        };
      }
    }

    return {
      context,
      services: servicesMap,
    };
  } catch (error: any) {
    return { context, services: {}, };
  }
}
