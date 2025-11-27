import jsonata from 'jsonata';
import type { OrchestrationContext } from './types.js';

/**
 * Resolves a path like "body.sub" or "headers['content-type']" in a data object
 * Uses synchronous path traversal
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
 * Recursively interpolates all string values in an object using JSONata
 * If a string is a single complete interpolation token (e.g., {$service.body}),
 * returns the resolved value with its original type.
 * If a string has text before/after the token, returns a string.
 *
 * Supports all JSONata features:
 * - Filters: {$service.body[status=200].id}
 * - Transformations: {$service.body.$string()}
 * - Functions: {$service.body.items.$count()}
 * - Expressions: {$service.body.price * 1.1}
 */
export async function interpolateObject(
  obj: any,
  context: OrchestrationContext
): Promise<any> {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Check if this is a single complete interpolation token (no text before/after)
    // Matches: {$contextKey.path} or {$[JSONata expression]}
    const singleTokenMatch = obj.match(/^\{\$(?:([a-zA-Z0-9_-]+)([^}]*)|(\[[^\]]*\]))\}$/);
    if (singleTokenMatch) {
      // This is a single token - resolve it and return with original type
      if (singleTokenMatch[3]) {
        // JSONata bracket expression: {$[...]}
        const jsonataExpr = singleTokenMatch[3].slice(1, -1); // Remove [ and ]
        try {
          const resolved = await resolveViaJSONataAsync('', jsonataExpr, context);
          return resolved !== undefined ? resolved : obj;
        } catch (error) {
          // If evaluation fails, return original token
          return obj;
        }
      } else {
        // Standard context key format: {$contextKey.path}
        const contextKey = singleTokenMatch[1];
        const pathWithDot = singleTokenMatch[2];
        const path = pathWithDot.startsWith('.') ? pathWithDot.slice(1) : pathWithDot;

        try {
          const resolved = await resolveTokenAsync(contextKey, path, context);
          return resolved !== undefined ? resolved : obj;
        } catch (error) {
          // If evaluation fails, return original token
          return obj;
        }
      }
    }

    // Multiple tokens or mixed text - use interpolateValueAsync which returns a string
    return interpolateValueAsync(obj, context);
  }

  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => interpolateObject(item, context)));
  }

  if (typeof obj === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(obj)) {
      result[key] = await interpolateObject(value, context);
    }
    return result;
  }

  return obj;
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

/**
 * ASYNC VERSION: Interpolates a string value using JSONata for powerful expression evaluation
 * This is the async counterpart to interpolateValue() that supports all JSONata features
 *
 * Supports JSONata expressions:
 * - Filters: {$service.body[status=200].id}
 * - Transformations: {$service.body.$string()}
 * - Functions: {$service.body.items.$count()}
 * - Expressions: {$service.body.price * 1.1}
 * - Complex operations: {$service.items[type='premium'].price.$sum()}
 */
export async function interpolateValueAsync(
  value: any,
  context: OrchestrationContext
): Promise<any> {
  if (typeof value !== 'string') {
    return value;
  }

  // Match {$<contextKey>.path.to.value} pattern and process each token
  const regex = /\{\$([a-zA-Z0-9_-]+)([^}]*)\}/g;
  let result = value;
  let match;

  // Collect all matches first
  const matches: Array<{
    fullMatch: string;
    contextKey: string;
    path: string;
  }> = [];

  while ((match = regex.exec(value)) !== null) {
    matches.push({
      fullMatch: match[0],
      contextKey: match[1],
      path: match[2].startsWith('.') ? match[2].slice(1) : match[2],
    });
  }

  // Evaluate each match with JSONata
  for (const m of matches) {
    try {
      const resolved = await resolveTokenAsync(m.contextKey, m.path, context);
      const replacement = resolved !== undefined && resolved !== null ? String(resolved) : m.fullMatch;
      result = result.replace(m.fullMatch, replacement);
    } catch (error) {
      // If evaluation fails, keep original token
    }
  }

  return result;
}


/**
 * Checks if a path contains JSONata-specific syntax beyond simple dot/bracket notation
 * (functions, filters, operators, etc.)
 */
function containsJSONataSyntax(path: string): boolean {
  // Check for JSONata functions - $something() anywhere in the path
  if (/\$[a-zA-Z_][a-zA-Z0-9_]*\s*\(/.test(path)) return true;
  // Check for JSONata global functions - sum(...), count(...), etc.
  if (/^\s*(sum|count|min|max|avg|string|length|reverse|sort|contains|split|join|floor|ceil|round|power)\s*\(/.test(path)) return true;
  // Check for JSONata filter syntax with operators [expr = value] or [expr > value] etc.
  if (/\[.*[\=\>\<\!\&\|].*\]/.test(path) && !path.match(/\['[^']*'\]/)) return true;
  // Check for JSONata operators (multiplication, division, modulo, but not in regular numbers)
  if (/[^a-zA-Z0-9_\s]\s*[\*\/\%]\s*[^a-zA-Z0-9_\s]/.test(path)) return true;
  return false;
}

/**
 * Resolves a single interpolation token using JSONata asynchronously
 * Supports all JSONata features including filters, transformations, and functions
 */
async function resolveTokenAsync(
  contextKey: string,
  path: string,
  context: OrchestrationContext
): Promise<any> {
  // Special handling for 'env'
  if (contextKey === 'env') {
    const resolved = context.env?.[path] || process.env[path];
    return resolved;
  }

  const contextValue = context[contextKey as keyof OrchestrationContext];
  if (contextValue === undefined) {
    return undefined;
  }

  // If there's no path, return the entire context value
  if (!path) {
    return contextValue;
  }

  // Try simple path resolution first (optimized for common case)
  // Only use simple path if it doesn't contain JSONata syntax
  if (!containsJSONataSyntax(path)) {
    try {
      const simpleResult = resolvePath(path, contextValue);
      if (simpleResult !== undefined) {
        return simpleResult;
      }
    } catch (error) {
      // Fall through to JSONata
    }
  }

  // Fall back to JSONata for advanced expressions or if simple resolution failed
  return resolveViaJSONataAsync(contextKey, path, context);
}

/**
 * Resolves expressions via JSONata asynchronously
 * This enables advanced JSONata features:
 * - Filters: body[status=200].id
 * - Transformations: body.$string()
 * - Functions: items.$count()
 * - Expressions: price * 1.1
 * - Aggregations: items[type='premium'].price.$sum()
 */
async function resolveViaJSONataAsync(
  contextKey: string,
  path: string,
  context: OrchestrationContext
): Promise<any> {
  // Handle bracket expressions like [Account.Order.Product."Product Name"]
  const expression = contextKey === '' ? path : `${contextKey}.${path}`;

  // Build evaluation context with special handling for 'env'
  let evalContext = { ...context };
  if (contextKey === 'env') {
    const mergedEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        mergedEnv[key] = value;
      }
    }
    if (context.env) {
      Object.assign(mergedEnv, context.env);
    }
    evalContext.env = mergedEnv;
  }

  try {
    const expr = jsonata(expression);
    // Use async evaluation
    const result = await expr.evaluate(evalContext);
    return result;
  } catch (error) {
    // If JSONata evaluation fails, return undefined
    return undefined;
  }
}
