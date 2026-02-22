// ARCH-01: Centralized LLM response parser — provider-specific wrapper unwrapping,
// JSON extraction from fenced code blocks, and per-step validation.
//
// ARCH-03: Lightweight hand-written validators (no Zod) to keep bundle size
// minimal for the Chrome extension. Each validator coerces types and returns
// sanitized parameters so applyAgentPlan() can trust the data it receives.

// ─── Constants ────────────────────────────────────────────────────────────────

const KNOWN_ACTIONS = new Set([
  'searchBookmarks', 'showAllBookmarks', 'resetSearch',
  'importBookmarks', 'exportBookmarks', 'removeDuplicates', 'help',
  'findIncludes', 'findStartsWith', 'findWithTags',
  'filterByRating', 'sortBookmarks',
  'limitResults', 'limitFirst', 'limitLast',
  'reorder', 'reorderAscending', 'reorderDescending', 'persistSortedOrder',
]);

const FIELD_VALUES      = new Set(['title', 'url', 'description', 'tags']);
const SORT_BY_VALUES    = new Set(['title', 'rating', 'url', 'folder', 'createdAt', 'updatedAt']);
const ORDER_VALUES      = new Set(['asc', 'desc']);
const DIRECTION_VALUES  = new Set(['first', 'last']);
const SCOPE_VALUES      = new Set(['current', 'all']);
const COMPARATOR_VALUES = new Set(['gte', 'lte', 'eq']);

// ─── Utility coercions ────────────────────────────────────────────────────────

function toStringArray(val) {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === 'string' && val.length > 0) return [val];
  return [];
}

function toPositiveInt(val) {
  const n = parseInt(val, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function toFiniteNumber(val) {
  const n = Number(val);
  return Number.isFinite(n) ? n : undefined;
}

// ─── ARCH-03: Schema validators ───────────────────────────────────────────────
// Each validator: (params: object) => { valid: boolean, sanitized: object, errors: string[] }

const ACTION_SCHEMAS = {
  // No-parameter actions
  showAllBookmarks: (_p) => ({ valid: true, sanitized: {}, errors: [] }),
  resetSearch:      (_p) => ({ valid: true, sanitized: {}, errors: [] }),
  importBookmarks:  (_p) => ({ valid: true, sanitized: {}, errors: [] }),
  exportBookmarks:  (_p) => ({ valid: true, sanitized: {}, errors: [] }),
  removeDuplicates: (_p) => ({ valid: true, sanitized: {}, errors: [] }),
  help:             (_p) => ({ valid: true, sanitized: {}, errors: [] }),

  searchBookmarks(p) {
    const searchTerm = p?.searchTerm != null ? String(p.searchTerm) : '';
    return { valid: true, sanitized: { searchTerm }, errors: [] };
  },

  findIncludes(p) {
    const errors = [];
    const field = FIELD_VALUES.has(p?.field) ? p.field : 'title';
    if (!FIELD_VALUES.has(p?.field)) errors.push(`Unknown field "${p?.field}", defaulting to "title"`);
    const value = p?.value != null ? String(p.value) : '';
    return { valid: true, sanitized: { field, value }, errors };
  },

  findStartsWith(p) {
    const errors = [];
    const field = FIELD_VALUES.has(p?.field) ? p.field : 'title';
    if (!FIELD_VALUES.has(p?.field)) errors.push(`Unknown field "${p?.field}", defaulting to "title"`);
    const value = p?.value != null ? String(p.value) : '';
    return { valid: true, sanitized: { field, value }, errors };
  },

  findWithTags(p) {
    const errors = [];
    if (!Array.isArray(p?.includeTags) && p?.includeTags != null) {
      errors.push(`includeTags coerced from ${typeof p.includeTags} to array`);
    }
    const includeTags = toStringArray(p?.includeTags);
    const excludeTags = toStringArray(p?.excludeTags);
    return { valid: true, sanitized: { includeTags, excludeTags }, errors };
  },

  filterByRating(p) {
    const errors = [];
    const sanitized = {};
    if (p?.minRating != null) {
      const n = toFiniteNumber(p.minRating);
      if (n === undefined) errors.push(`minRating "${p.minRating}" is not a number, ignored`);
      else sanitized.minRating = n;
    }
    if (p?.maxRating != null) {
      const n = toFiniteNumber(p.maxRating);
      if (n === undefined) errors.push(`maxRating "${p.maxRating}" is not a number, ignored`);
      else sanitized.maxRating = n;
    }
    if (p?.exact != null) {
      const n = toFiniteNumber(p.exact);
      if (n === undefined) errors.push(`exact "${p.exact}" is not a number, ignored`);
      else sanitized.exact = n;
    }
    if (p?.comparator != null) {
      if (COMPARATOR_VALUES.has(p.comparator)) sanitized.comparator = p.comparator;
      else errors.push(`Unknown comparator "${p.comparator}", ignored`);
    }
    return { valid: true, sanitized, errors };
  },

  sortBookmarks(p) {
    const errors = [];
    const sortBy = SORT_BY_VALUES.has(p?.sortBy) ? p.sortBy : 'title';
    const order  = ORDER_VALUES.has(p?.order)    ? p.order  : 'asc';
    if (!SORT_BY_VALUES.has(p?.sortBy)) errors.push(`Unknown sortBy "${p?.sortBy}", defaulting to "title"`);
    if (!ORDER_VALUES.has(p?.order))    errors.push(`Unknown order "${p?.order}", defaulting to "asc"`);
    return { valid: true, sanitized: { sortBy, order }, errors };
  },

  limitResults(p) {
    const count = toPositiveInt(p?.count);
    if (count === undefined) {
      return { valid: false, sanitized: {}, errors: [`count "${p?.count}" is not a positive integer`] };
    }
    const direction = DIRECTION_VALUES.has(p?.direction) ? p.direction : 'first';
    const scope     = SCOPE_VALUES.has(p?.scope)         ? p.scope     : 'current';
    return { valid: true, sanitized: { count, direction, scope }, errors: [] };
  },

  limitFirst(p) {
    const count = toPositiveInt(p?.count);
    if (count === undefined) {
      return { valid: false, sanitized: {}, errors: [`count "${p?.count}" is not a positive integer`] };
    }
    return { valid: true, sanitized: { count }, errors: [] };
  },

  limitLast(p) {
    const count = toPositiveInt(p?.count);
    if (count === undefined) {
      return { valid: false, sanitized: {}, errors: [`count "${p?.count}" is not a positive integer`] };
    }
    return { valid: true, sanitized: { count }, errors: [] };
  },

  reorder(p) {
    const errors = [];
    const sortBy = SORT_BY_VALUES.has(p?.sortBy) ? p.sortBy : 'title';
    const order  = ORDER_VALUES.has(p?.order)    ? p.order  : 'asc';
    if (!SORT_BY_VALUES.has(p?.sortBy)) errors.push(`Unknown sortBy "${p?.sortBy}", defaulting to "title"`);
    if (!ORDER_VALUES.has(p?.order))    errors.push(`Unknown order "${p?.order}", defaulting to "asc"`);
    return { valid: true, sanitized: { sortBy, order }, errors };
  },

  reorderAscending(p) {
    const sanitized = {};
    if (SORT_BY_VALUES.has(p?.sortBy)) sanitized.sortBy = p.sortBy;
    return { valid: true, sanitized, errors: [] };
  },

  reorderDescending(p) {
    const sanitized = {};
    if (SORT_BY_VALUES.has(p?.sortBy)) sanitized.sortBy = p.sortBy;
    return { valid: true, sanitized, errors: [] };
  },

  persistSortedOrder(p) {
    const errors = [];
    const sanitized = {};
    if (p?.sortBy != null) {
      if (SORT_BY_VALUES.has(p.sortBy)) sanitized.sortBy = p.sortBy;
      else errors.push(`Unknown sortBy "${p.sortBy}", ignored`);
    }
    const order = ORDER_VALUES.has(p?.order) ? p.order : 'asc';
    if (p?.order != null && !ORDER_VALUES.has(p.order)) {
      errors.push(`Unknown order "${p.order}", defaulting to "asc"`);
    }
    sanitized.order = order;
    return { valid: true, sanitized, errors };
  },
};

// ─── Provider-specific wrapper unwrapping (ARCH-01, ARCH-05) ─────────────────
// Maps provider name → function that extracts the text string from a raw API wrapper object.
// Used as a fallback when the provider returns an API envelope instead of plain text.

const PROVIDER_UNWRAPPERS = {
  gemini:   (raw) => raw?.candidates?.[0]?.content?.parts?.[0]?.text   || '',
  openai:   (raw) => raw?.choices?.[0]?.message?.content                || '',
  grok:     (raw) => raw?.choices?.[0]?.message?.content                || '',
  lmstudio: (raw) => raw?.choices?.[0]?.message?.content                || '',
  ollama:   (raw) => raw?.response                                       || '',
};

// ─── JSON extraction ──────────────────────────────────────────────────────────

function extractJsonFromText(text) {
  if (!text) return null;
  // Match first ```json or ``` fenced block — non-greedy to avoid multi-fence issues
  const fence = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/i);
  if (fence) return fence[1].trim();
  const trimmed = text.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) return trimmed;
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Parse a raw LLM response string into a validated, sanitized array of agent steps.
 *
 * Handles:
 *  1. Fenced code block extraction (```json ... ```)
 *  2. Provider-specific API wrapper unwrapping (ARCH-01) using `providerName`
 *  3. Step validation and parameter sanitization (ARCH-03)
 *
 * @param {string} responseText - Raw string from llm.generate()
 * @param {string} [providerName] - Provider key (e.g. 'gemini', 'openai', 'ollama')
 * @returns {Array<{ action: string, parameters: object, priority?: number }>}
 */
export function parseAgentResponse(responseText, providerName) {
  if (!responseText) return [];

  // Step 1: Try to extract JSON from the response as-is (most common case)
  let extracted = extractJsonFromText(responseText);

  // Step 2: Fallback — provider-specific wrapper unwrapping (ARCH-01)
  if (!extracted && providerName) {
    const unwrap = PROVIDER_UNWRAPPERS[providerName];
    if (unwrap) {
      try {
        const raw = JSON.parse(responseText);
        const inner = unwrap(raw);
        if (inner) extracted = extractJsonFromText(inner) || (inner.trim() ? inner : null);
      } catch {
        // responseText is not a JSON wrapper — continue
      }
    }
  }

  // Step 3: Parse JSON
  let parsed;
  try {
    parsed = JSON.parse(extracted || responseText);
  } catch {
    console.warn('[parser] Failed to parse LLM response as JSON:', responseText?.slice(0, 200));
    return [];
  }

  // Step 4: Normalise to array of step objects
  const stepsArray = Array.isArray(parsed) ? parsed : [parsed];

  // Step 5: Validate and sanitize each step (ARCH-01, ARCH-03)
  const validSteps = [];
  for (const step of stepsArray) {
    if (!step || typeof step !== 'object' || typeof step.action !== 'string') {
      console.warn('[parser] Dropping step — missing or non-string action:', step);
      continue;
    }

    const { action, parameters, priority } = step;

    if (!KNOWN_ACTIONS.has(action)) {
      console.warn(`[parser] Dropping step — unknown action "${action}"`);
      continue;
    }

    // parameters must be undefined, null, or a plain object
    if (parameters !== undefined && parameters !== null && typeof parameters !== 'object') {
      console.warn(`[parser] Dropping step "${action}" — parameters must be an object, got ${typeof parameters}:`, parameters);
      continue;
    }

    const sanitizedPriority = priority !== undefined ? Number(priority) : undefined;
    const params = (parameters && typeof parameters === 'object') ? parameters : {};

    const validator = ACTION_SCHEMAS[action];
    if (validator) {
      const result = validator(params);
      if (!result.valid) {
        console.warn(`[parser] Dropping step "${action}" — validation failed:`, result.errors);
        continue;
      }
      if (result.errors.length > 0) {
        console.warn(`[parser] Step "${action}" — sanitized with warnings:`, result.errors);
      }
      validSteps.push({
        action,
        parameters: result.sanitized,
        ...(sanitizedPriority !== undefined && { priority: sanitizedPriority }),
      });
    } else {
      validSteps.push({
        action,
        parameters: params,
        ...(sanitizedPriority !== undefined && { priority: sanitizedPriority }),
      });
    }
  }

  return validSteps;
}
