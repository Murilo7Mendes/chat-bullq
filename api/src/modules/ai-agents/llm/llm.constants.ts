/** Claude Haiku — cheap/fast for tool-call iterations. */
export const CLAUDE_SIMPLE_MODEL = 'claude-haiku-4-5-20251001';

/** Claude Sonnet — quality model for customer-facing synthesis. */
export const CLAUDE_CONVERSATION_MODEL = 'claude-sonnet-5';

// Legacy aliases kept for backward compat with ModelRouterService imports.
export const SAKANA_SIMPLE_MODEL = CLAUDE_SIMPLE_MODEL;
export const SAKANA_CONVERSATION_MODEL = CLAUDE_CONVERSATION_MODEL;
export const SAKANA_DEFAULT_BASE_URL = 'https://api.anthropic.com';
