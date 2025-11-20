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
    errorStrategy: 'silent' as const, // Continue on error (fallback handles it)
  }));

  try {
    // Run workflow - async-flow-orchestrator manages the context
    const workflowResult = await executeWorkflow({
      processes,
      initialContext: context,
    });

    // Extract service results from workflow data
    const servicesKeys = Object.keys(workflowResult.metadata.states);
    const services: Record<string, ServiceResult> = Object.keys(workflowResult.data).reduce((acc, key) => {
      if (servicesKeys.includes(key)) {
        acc[key] = workflowResult.data[key] as ServiceResult;
      }
      return acc;
    }, {} as Record<string, ServiceResult>);

    return {
      context,
      services,
    };
  } catch (error: any) {
    return { context, services: {}, };
  }
}
