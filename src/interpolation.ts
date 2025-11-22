import type { OrchestrationContext } from './types.js';

/**
 * Resolves a value using the interpolation syntax:
 * - {$<contextKey>.path.to.value} - with curly braces
 *
 * Supports text before, after, and between interpolation tokens.
 *
 * Examples:
 * - {$env.HOST}/api/users → https://api.example.com/api/users
 * - {$env.TEXT}api → helloapi
 * - {$env.A}/{$env.B} → path/file
 * - https://{$env.HOST}:{$env.PORT}/api/{$request.body.id}
 *
 * The context key can be any root property in the context object.
 * If a token cannot be resolved, it is returned unchanged.
 */
export function interpolateValue(
  value: any,
  context: OrchestrationContext
): any {
  if (typeof value !== 'string') {
    return value;
  }

  // Match {$<contextKey>.path.to.value} pattern and process each token
  return value.replace(/\{\$([a-zA-Z0-9_-]+)([^}]*)\}/g, (match, contextKey, pathWithDot) => {
    // Remove leading dot from path if present
    const path = pathWithDot.startsWith('.') ? pathWithDot.slice(1) : pathWithDot;

    // Special handling for 'env'
    if (contextKey === 'env') {
      const resolved = context.env?.[path] || process.env[path];
      return resolved !== undefined ? String(resolved) : match;
    }

    // For any other context key, resolve from the context object
    const contextValue = context[contextKey as keyof OrchestrationContext];

    if (contextValue === undefined) {
      // Context key not found, return original token
      return match;
    }

    // If there's a path, resolve it; otherwise return the entire context value
    let resolved: any;
    if (path) {
      resolved = resolvePath(path, contextValue);
    } else {
      resolved = contextValue;
    }

    // Convert to string if not undefined or null
    return resolved !== undefined && resolved !== null ? String(resolved) : match;
  });
}

/**
 * Recursively interpolates all string values in an object
 * If a string is a single complete interpolation token (e.g., {$service.body}),
 * returns the resolved value with its original type.
 * If a string has text before/after the token, returns a string.
 */
export function interpolateObject(
  obj: any,
  context: any
): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Check if this is a single complete interpolation token (no text before/after)
    const singleTokenMatch = obj.match(/^\{\$([a-zA-Z0-9_-]+)([^}]*)\}$/);
    if (singleTokenMatch) {
      // This is a single token - resolve it and return with original type
      const [, contextKey, pathWithDot] = singleTokenMatch;
      const path = pathWithDot.startsWith('.') ? pathWithDot.slice(1) : pathWithDot;

      if (contextKey === 'env') {
        const resolved = context.env?.[path] || process.env[path];
        return resolved !== undefined ? resolved : obj;
      }

      const contextValue = context[contextKey as keyof any];
      if (contextValue === undefined) {
        return obj;
      }

      let resolved: any;
      if (path) {
        resolved = resolvePath(path, contextValue);
      } else {
        resolved = contextValue;
      }
      return resolved !== undefined ? resolved : obj;
    }

    // Multiple tokens or mixed text - use interpolateValue which returns a string
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
