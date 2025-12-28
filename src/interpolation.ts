import jsonata from 'jsonata';
import type { OrchestrationContext } from './types.js';

/**
 * Recursively interpolates all string values in an object using JSONata
 * Supports direct JSONata expressions wrapped in curly braces: {expression}
 * Also supports {-expression-} for complex expressions with nested braces
 *
 * The entire OrchestrationContext is available as the root object for evaluation.
 *
 * Supports all JSONata features:
 * - Path access: {request.body.userId}
 * - Filters: {users[status="active"].name}
 * - Transformations: {name.$uppercase()}
 * - Functions: {items.$count()}
 * - Expressions: {price * 1.1}
 * - Array flattening: {[Account.Order.Product."Product Name"]}
 * - Complex expressions with nested braces: {-$map(data, function($x) { {"id": $x.id} })-}
 *
 * Type preservation:
 * - Single token {expression} returns original type (number, boolean, array, object, etc.)
 * - Multiple tokens or mixed text returns string
 */
export async function interpolateObject(
  obj: any,
  context: OrchestrationContext
): Promise<any> {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Check for {-expression-} syntax first (handles nested braces)
    const complexTokenMatch = obj.match(/^\{-(.+)-\}$/s);
    if (complexTokenMatch) {
      // This is a complex token with potential nested braces
      const jsonataExpr = complexTokenMatch[1];
      const resolved = await evaluateJSONataAsync(jsonataExpr, context);
      return resolved !== undefined ? resolved : obj;
    }

    // Check if this is a single complete interpolation token (no text before/after)
    // Matches: {jsonata_expression} anywhere in the string
    const singleTokenMatch = obj.match(/^\{([^}]+)\}$/);
    if (singleTokenMatch) {
      // This is a single token - resolve it and return with original type
      const jsonataExpr = singleTokenMatch[1];
      const resolved = await evaluateJSONataAsync(jsonataExpr, context);
      return resolved !== undefined ? resolved : obj;
    }

    // Multiple tokens or mixed text - replace all {expression} placeholders
    return interpolateStringAsync(obj, context);
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
 * Interpolates a string with multiple JSONata expressions
 * Each {expression} or {-expression-} is evaluated and replaced in the string
 * Returns a string with all tokens replaced
 */
async function interpolateStringAsync(
  value: string,
  context: OrchestrationContext
): Promise<string> {
  let result = value;

  // First, handle {-expression-} patterns (complex expressions with nested braces)
  const complexRegex = /\{-(.+?)-\}/gs;
  const complexMatches: Array<{ fullMatch: string; expression: string }> = [];
  let match;

  while ((match = complexRegex.exec(value)) !== null) {
    complexMatches.push({
      fullMatch: match[0],
      expression: match[1],
    });
  }

  // Evaluate complex matches first
  for (const m of complexMatches) {
    const resolved = await evaluateJSONataAsync(m.expression, context);
    const replacement = resolved !== undefined && resolved !== null ? String(resolved) : m.fullMatch;
    result = result.replace(m.fullMatch, replacement);
  }

  // Then handle simple {expression} patterns
  const regex = /\{([^}]+)\}/g;
  const matches: Array<{
    fullMatch: string;
    expression: string;
  }> = [];

  while ((match = regex.exec(result)) !== null) {
    matches.push({
      fullMatch: match[0],
      expression: match[1],
    });
  }

  // Evaluate each match with JSONata
  for (const m of matches) {
    const resolved = await evaluateJSONataAsync(m.expression, context);
    const replacement = resolved !== undefined && resolved !== null ? String(resolved) : m.fullMatch;
    result = result.replace(m.fullMatch, replacement);
  }

  return result;
}

/**
 * Evaluates a JSONata expression against the given context
 * The entire context is available at the root level
 */
async function evaluateJSONataAsync(
  expression: string,
  context: OrchestrationContext
): Promise<any> {
  try {
    const expr = jsonata(expression);
    // Use async evaluation
    const result = await expr.evaluate(context);
    return result;
  } catch (error) {
    // If JSONata evaluation fails, return undefined
    return undefined;
  }
}
