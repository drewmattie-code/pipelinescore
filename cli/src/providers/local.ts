import { OpenAIProvider } from './openai.js';

/**
 * Local OpenAI-compatible provider (LiteLLM, Ollama, vLLM, MLX, etc.).
 * Defaults to http://localhost:8080/v1 if no endpoint is provided.
 */
export class LocalProvider extends OpenAIProvider {
  constructor(opts: { model: string; baseURL?: string; apiKey?: string }) {
    super({
      apiKey: opts.apiKey ?? 'local-no-key',
      model: opts.model,
      baseURL: opts.baseURL ?? 'http://localhost:8080/v1',
      name: 'local',
    });
  }
}
