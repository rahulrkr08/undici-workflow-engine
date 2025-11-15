import type { OrchestrationContext } from './types.js';

/**
 * Resolves a value using the interpolation syntax:
 * - $<contextKey>.path.to.value
 *
 * Examples:
 * - $service.serviceId.body.field
 * - $request.body.email
 * - $env.API_KEY
 * - $customData.value
 *
 * The context key can be any root property in the context object.
 */
export function interpolateValue(
  value: any,
  context: OrchestrationContext
): any {
  if (typeof value !== 'string') {
    return value;
  }

  // Match $<contextKey>.path.to.value pattern
  const match = value.match(/^\$([a-zA-Z0-9_]+)(.*)$/);
  if (!match) {
    // No interpolation pattern found
    return value;
  }

  const [, contextKey, pathWithDot] = match;
  // Remove leading dot from path if present
  const path = pathWithDot.startsWith('.') ? pathWithDot.slice(1) : pathWithDot;
  // Special handling for 'env' - check both context.env and process.env
  if (contextKey === 'env') {
    // First check context.env, then process.env
    return context.env?.[path] || process.env[path] || value;
  }

  // For any other context key, resolve from the context object
  const contextValue = context[contextKey as keyof OrchestrationContext];

  if (contextValue === undefined) {
    // Context key not found
    return undefined;
  }

  // If there's a path, resolve it; otherwise return the entire context value
  if (path) {
    return resolvePath(path, contextValue);
  }

  return contextValue;
}

/**
 * Recursively interpolates all string values in an object
 */
export function interpolateObject(
  obj: any,
  context: any
): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return interpolateValue(obj, context);
  }

  if (Array.isArray(obj)) {
    return obj.map(item => interpolateObject(item, context));
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = interpolateObject(value, context);
    }
    return result;
  }

  return obj;
}

/**
 * Resolves a path like "body.sub" or "headers['content-type']" in a data object
 */
function resolvePath(path: string, data: any): any {
  if (!path) {
    return data;
  }

  // Handle bracket notation: body['custom:field'] or body["custom:field"]
  const bracketRegex = /\['([^']+)'\]|\["([^"]+)"\]/g;
  const normalizedPath = path.replace(bracketRegex, '.$1$2');

  const parts = normalizedPath.split('.');
  let current = data;

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = current[part];
  }

  return current;
}

/**
 * Converts cookies object to Cookie header string
 */
export function cookiesToHeader(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([key, value]) => `${key}=${value}`)
    .join('; ');
}

/**
 * Converts query object to URL search params
 */
export function buildQueryString(query: Record<string, string>): string {
  const params = new URLSearchParams(query);
  return params.toString();
}
