import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMResponse } from '../types.js';

export class AnthropicProvider implements LLMProvider {
  name = 'anthropic';
  private client: Anthropic;
  private model: string;

  constructor(opts: { apiKey: string; model: string }) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model = opts.model;
  }

  async complete(prompt: string, opts: { maxTokens?: number; temperature?: number } = {}): Promise<LLMResponse> {
    const start = Date.now();
    const res = await this.client.messages.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 2048,
      temperature: opts.temperature ?? 0,
      messages: [{ role: 'user', content: prompt }],
    });
    const latency_ms = Date.now() - start;
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    return {
      text,
      tokens_in: res.usage?.input_tokens,
      tokens_out: res.usage?.output_tokens,
      latency_ms,
    };
  }
}
