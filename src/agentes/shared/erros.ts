export class AgentError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = false,
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export class LLMError extends AgentError {
  constructor(message: string) {
    super(message, 'LLM_ERROR', true);
    this.name = 'LLMError';
  }
}

export class AuthError extends AgentError {
  constructor(message: string) {
    super(message, 'AUTH_ERROR', true);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends AgentError {
  constructor(message: string) {
    super(message, 'RATE_LIMIT', true);
    this.name = 'RateLimitError';
  }
}

export class ToolError extends AgentError {
  constructor(message: string) {
    super(message, 'TOOL_ERROR', false);
    this.name = 'ToolError';
  }
}
