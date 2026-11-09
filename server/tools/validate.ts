// Minimal JSON-Schema validator for tool inputs (the subset our tool schemas use). Applies `default`s.
export interface JSONSchema {
  type?: 'object' | 'string' | 'integer' | 'number' | 'boolean' | 'array';
  description?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JSONSchema;
  enum?: (string | number)[];
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  pattern?: string;
  default?: unknown;
}

export type Validation<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function check(schema: JSONSchema, v: unknown, path: string, errors: string[]): unknown {
  const at = path || 'input';
  if (v === undefined && schema.default !== undefined) v = structuredClone(schema.default);
  switch (schema.type) {
    case 'object': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) { errors.push(`${at}: expected object`); return v; }
      const src = v as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      const props = schema.properties ?? {};
      for (const k of schema.required ?? []) if (src[k] === undefined || src[k] === null) errors.push(`${at}.${k}: required`);
      for (const [k, val] of Object.entries(src)) {
        if (props[k]) { if (val !== null && val !== undefined) out[k] = check(props[k], val, `${at}.${k}`, errors); }
        else if (schema.additionalProperties === false) errors.push(`${at}.${k}: unknown property`);
      }
      for (const [k, p] of Object.entries(props)) if (out[k] === undefined && p.default !== undefined) out[k] = structuredClone(p.default);
      return out;
    }
    case 'array': {
      if (!Array.isArray(v)) { errors.push(`${at}: expected array`); return v; }
      if (schema.minItems !== undefined && v.length < schema.minItems) errors.push(`${at}: at least ${schema.minItems} items`);
      if (schema.maxItems !== undefined && v.length > schema.maxItems) errors.push(`${at}: at most ${schema.maxItems} items`);
      return schema.items ? v.map((x, i) => check(schema.items!, x, `${at}[${i}]`, errors)) : v;
    }
    case 'string': {
      if (typeof v !== 'string') { errors.push(`${at}: expected string`); return v; }
      const s = v.trim();
      if (schema.minLength !== undefined && s.length < schema.minLength) errors.push(`${at}: too short`);
      if (schema.maxLength !== undefined && s.length > schema.maxLength) errors.push(`${at}: too long (max ${schema.maxLength})`);
      if (schema.pattern && !new RegExp(schema.pattern).test(s)) errors.push(`${at}: invalid format`);
      if (schema.enum && !schema.enum.includes(s)) errors.push(`${at}: must be one of ${schema.enum.join(', ')}`);
      return s;
    }
    case 'integer':
    case 'number': {
      const n = typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) ? Number(v) : v; // tolerate "3"
      if (typeof n !== 'number' || !Number.isFinite(n)) { errors.push(`${at}: expected ${schema.type}`); return v; }
      if (schema.type === 'integer' && !Number.isInteger(n)) errors.push(`${at}: expected integer`);
      if (schema.minimum !== undefined && n < schema.minimum) errors.push(`${at}: must be >= ${schema.minimum}`);
      if (schema.maximum !== undefined && n > schema.maximum) errors.push(`${at}: must be <= ${schema.maximum}`);
      if (schema.enum && !schema.enum.includes(n)) errors.push(`${at}: must be one of ${schema.enum.join(', ')}`);
      return n;
    }
    case 'boolean':
      if (typeof v !== 'boolean') errors.push(`${at}: expected boolean`);
      return v;
    default:
      return v;
  }
}

/** Validate (and normalise: trims strings, coerces numeric strings, applies defaults, drops nulls). */
export function validate<T = Record<string, unknown>>(schema: JSONSchema, input: unknown): Validation<T> {
  const errors: string[] = [];
  const value = check(schema, input, '', errors);
  return errors.length ? { ok: false, errors } : { ok: true, value: value as T };
}
