import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';

import {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmContent,
  LlmContentPart,
  LlmMessage,
  LlmTextPart,
  LlmToolCall,
  LlmToolDefinition,
  LlmUsage,
} from './llm.types';
import { CLAUDE_SIMPLE_MODEL, CLAUDE_CONVERSATION_MODEL } from './llm.constants';

type AnthropicUsage = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
};

/**
 * Cliente LLM normalizado para Anthropic Claude.
 *
 * Mantém o mesmo contrato público (complete / LlmMessage / LlmToolDefinition)
 * usado pelo runner, classifier, memória, RAG e evals. Modelos legados Sakana
 * (sakana/fugu, fugu-ultra-*) são mapeados automaticamente para os equivalentes
 * Claude mais próximos.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);
  private readonly client: Anthropic;
  private readonly hasApiKey: boolean;

  constructor(config: ConfigService) {
    const apiKey =
      config.get<string>('ANTHROPIC_API_KEY') ??
      config.get<string>('SAKANA_API_KEY');

    this.hasApiKey =
      !!apiKey &&
      !apiKey.startsWith('sk-sakana') &&
      apiKey !== 'your-anthropic-key-here';

    if (!this.hasApiKey) {
      this.logger.warn(
        'ANTHROPIC_API_KEY not set — AI agents will fail at runtime',
      );
    }

    this.client = new Anthropic({ apiKey: apiKey ?? 'missing' });
  }

  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
    if (!this.hasApiKey) {
      throw new InternalServerErrorException('ANTHROPIC_API_KEY not set');
    }

    const modelId = this.normalizeModelId(req.modelId);
    const { system, messages } = this.toAnthropicMessages(req.messages);
    const tools = req.tools?.length
      ? this.toAnthropicTools(req.tools)
      : undefined;

    let response: Anthropic.Message;

    const baseParams = {
      model: modelId,
      max_tokens: req.maxTokens ?? 2048,
      temperature: req.temperature ?? 0.7,
      ...(system ? { system } : {}),
      ...(tools?.length ? { tools } : {}),
      ...this.sanitizeModelParams(req.modelParams),
    };

    try {
      response = await this.client.messages.create({
        ...baseParams,
        messages,
        stream: false,
      });
    } catch (err: unknown) {
      // On 400 with images in payload, retry without them.
      if ((err as { status?: number })?.status === 400) {
        const stripped = this.stripImages(messages);
        if (stripped !== messages) {
          this.logger.warn(
            `Anthropic 400 with images — retrying without image blocks [${modelId}]`,
          );
          try {
            response = await this.client.messages.create({
              ...baseParams,
              messages: stripped,
              stream: false,
            });
          } catch (retryErr: unknown) {
            throw new InternalServerErrorException(
              `LLM provider error: ${this.errorMessage(retryErr)}`,
            );
          }
        } else {
          throw new InternalServerErrorException(
            `LLM provider error: ${this.errorMessage(err)}`,
          );
        }
      } else {
        throw new InternalServerErrorException(
          `LLM provider error: ${this.errorMessage(err)}`,
        );
      }
    }

    return this.fromAnthropicResponse(response, modelId);
  }

  // ─── normalização de modelo ──────────────────────────────────────────────

  private normalizeModelId(id: string): string {
    const m = (id ?? '').trim();
    if (!m) return CLAUDE_CONVERSATION_MODEL;

    // Já é um modelo Claude — passa direto.
    if (m.startsWith('claude-')) return m;

    // Mapeia aliases legados Sakana → Claude.
    if (m.startsWith('sakana/')) {
      const sub = m.slice('sakana/'.length);
      if (sub === 'fugu') return CLAUDE_SIMPLE_MODEL;
      if (sub.startsWith('fugu-ultra')) return CLAUDE_CONVERSATION_MODEL;
      return CLAUDE_CONVERSATION_MODEL;
    }
    if (m === 'fugu') return CLAUDE_SIMPLE_MODEL;
    if (m.startsWith('fugu-ultra')) return CLAUDE_CONVERSATION_MODEL;

    this.logger.warn(
      `Unknown model "${m}" — falling back to ${CLAUDE_CONVERSATION_MODEL}`,
    );
    return CLAUDE_CONVERSATION_MODEL;
  }

  // ─── conversão: LlmMessage[] → Anthropic ────────────────────────────────

  private toAnthropicMessages(input: LlmMessage[]): {
    system: string;
    messages: Anthropic.MessageParam[];
  } {
    // Separa mensagens de sistema (Anthropic recebe `system` como parâmetro separado).
    const systemTexts: string[] = [];
    const rest: LlmMessage[] = [];
    for (const m of input) {
      if (m.role === 'system') {
        const t = this.textOnly(m.content);
        if (t) systemTexts.push(t);
      } else {
        rest.push(m);
      }
    }
    const system = systemTexts.join('\n\n');

    const out: Anthropic.MessageParam[] = [];

    for (const m of rest) {
      if (m.role === 'user') {
        const content = this.toAnthropicUserContent(m.content);
        if (!this.isEmpty(content)) {
          out.push({ role: 'user', content: content as any });
        }
        continue;
      }

      if (m.role === 'assistant') {
        const blocks: Anthropic.ContentBlockParam[] = [];
        const text = this.textOnly(m.content);
        if (text) blocks.push({ type: 'text', text });
        for (const tc of m.toolCalls ?? []) {
          blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.arguments });
        }
        if (blocks.length > 0) out.push({ role: 'assistant', content: blocks });
        continue;
      }

      if (m.role === 'tool') {
        // Tool results pertencem a mensagens de user no formato Anthropic.
        const toolResult: Anthropic.ToolResultBlockParam = {
          type: 'tool_result',
          tool_use_id: m.toolCallId ?? m.name ?? 'unknown',
          content: this.textOnly(m.content) || '(empty)',
        };
        const last = out[out.length - 1];
        if (last?.role === 'user' && Array.isArray(last.content)) {
          (last.content as Anthropic.ContentBlockParam[]).push(toolResult);
        } else {
          out.push({ role: 'user', content: [toolResult] });
        }
      }
    }

    // Anthropic requer que a primeira mensagem seja do user.
    if (out.length === 0 || out[0].role !== 'user') {
      out.unshift({ role: 'user', content: '...' });
    }

    return { system, messages: out };
  }

  private toAnthropicUserContent(
    content: LlmContent,
  ): string | Anthropic.ContentBlockParam[] {
    if (typeof content === 'string') return content;

    const parts: Anthropic.ContentBlockParam[] = [];
    for (const p of content) {
      if (p.type === 'text' && p.text) {
        parts.push({ type: 'text', text: p.text });
      } else if (p.type === 'image') {
        if (p.url) {
          parts.push({ type: 'image', source: { type: 'url', url: p.url } });
        } else if (p.base64) {
          parts.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: p.base64.mediaType as Anthropic.Base64ImageSource['media_type'],
              data: p.base64.data,
            },
          });
        }
      }
    }
    if (parts.length === 0) return '';
    if (parts.every((b) => b.type === 'text')) {
      return parts.map((b) => (b as Anthropic.TextBlockParam).text).join('\n');
    }
    return parts;
  }

  private toAnthropicTools(tools: LlmToolDefinition[]): Anthropic.Tool[] {
    return tools
      .filter((t) => t.name && t.description)
      .map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool['input_schema'],
      }));
  }

  // ─── conversão: Anthropic → LlmCompletionResponse ───────────────────────

  private fromAnthropicResponse(
    response: Anthropic.Message,
    modelId: string,
  ): LlmCompletionResponse {
    const textParts: string[] = [];
    const toolCalls: LlmToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') textParts.push(block.text);
      else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input as Record<string, unknown>,
        });
      }
    }

    const message: LlmMessage = {
      role: 'assistant',
      content: textParts.join(''),
      ...(toolCalls.length > 0 ? { toolCalls } : {}),
    };

    return {
      message,
      stopReason: this.normalizeStopReason(response.stop_reason),
      usage: this.extractUsage(response.usage as AnthropicUsage | undefined, modelId),
      rawModelId: response.model ?? modelId,
    };
  }

  private normalizeStopReason(
    reason: string | null | undefined,
  ): LlmCompletionResponse['stopReason'] {
    switch (reason) {
      case 'end_turn':
        return 'stop';
      case 'tool_use':
        return 'tool_calls';
      case 'max_tokens':
        return 'length';
      default:
        return 'stop';
    }
  }

  private extractUsage(
    usage: AnthropicUsage | undefined,
    modelId: string,
  ): LlmUsage {
    const inputTokens = usage?.input_tokens ?? 0;
    const outputTokens = usage?.output_tokens ?? 0;
    const cacheReadTokens = usage?.cache_read_input_tokens ?? 0;
    const cacheWriteTokens = usage?.cache_creation_input_tokens ?? 0;
    const costUsd = this.estimateCost(modelId, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens);
    return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, costUsd };
  }

  private estimateCost(
    modelId: string,
    input: number,
    output: number,
    cacheRead: number,
    cacheWrite: number,
  ): number {
    const isHaiku = modelId.includes('haiku');
    // USD per 1M tokens (approximate Anthropic pricing)
    const inputPer1M = isHaiku ? 0.8 : 3.0;
    const outputPer1M = isHaiku ? 4.0 : 15.0;
    const cacheReadPer1M = inputPer1M * 0.1;
    const cacheWritePer1M = inputPer1M * 1.25;
    return (
      (input * inputPer1M +
        output * outputPer1M +
        cacheRead * cacheReadPer1M +
        cacheWrite * cacheWritePer1M) /
      1_000_000
    );
  }

  // ─── helpers ─────────────────────────────────────────────────────────────

  private textOnly(content: LlmContent): string {
    if (typeof content === 'string') return content;
    return content
      .filter((p): p is LlmTextPart => p.type === 'text')
      .map((p) => p.text)
      .join('');
  }

  private isEmpty(content: string | Anthropic.ContentBlockParam[]): boolean {
    if (typeof content === 'string') return content.length === 0;
    return content.length === 0;
  }

  private stripImages(
    messages: Anthropic.MessageParam[],
  ): Anthropic.MessageParam[] {
    let changed = false;
    const stripped = messages.map((m) => {
      if (!Array.isArray(m.content)) return m;
      const filtered = (m.content as Anthropic.ContentBlockParam[]).filter(
        (b) => b.type !== 'image',
      );
      if (filtered.length === m.content.length) return m;
      changed = true;
      return { ...m, content: filtered.length > 0 ? filtered : [{ type: 'text' as const, text: '(media removed)' }] };
    });
    return changed ? stripped : messages;
  }

  private sanitizeModelParams(
    params?: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!params) return {};
    // Remove Sakana-specific / OpenAI-specific params not valid for Anthropic.
    const {
      routing,
      prompt_cache_key,
      prompt_cache_retention,
      frequency_penalty,
      presence_penalty,
      logit_bias,
      n,
      stream,
      ...rest
    } = params as any;
    return rest;
  }

  private errorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'object' && err !== null) {
      const e = err as any;
      return e.message ?? e.error?.message ?? JSON.stringify(e).slice(0, 200);
    }
    return String(err);
  }
}
