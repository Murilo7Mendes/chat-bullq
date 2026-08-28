import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingResult } from './types';

/**
 * Gera embeddings via Voyage AI (voyage-3, 1024 dims).
 * Voyage AI é o parceiro oficial de embeddings da Anthropic.
 * Docs: https://docs.voyageai.com/reference/embeddings-api
 *
 * Env var: VOYAGE_API_KEY
 */
@Injectable()
export class EmbeddingsService {
  private readonly logger = new Logger(EmbeddingsService.name);
  private readonly MODEL = 'voyage-3';
  private readonly DIMS = 1024;
  /** USD por 1M tokens — voyage-3 pricing. */
  private readonly COST_PER_1M_TOKENS = 0.06;
  private readonly apiKey: string;

  constructor(config: ConfigService) {
    const apiKey = config.get<string>('VOYAGE_API_KEY') ?? '';
    if (!apiKey) {
      this.logger.warn('No VOYAGE_API_KEY set — embeddings will fail at runtime');
    }
    this.apiKey = apiKey;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const [result] = await this.callApi([text]);
    return result;
  }

  async embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
    if (texts.length === 0) return [];
    return this.callApi(texts);
  }

  private async callApi(texts: string[]): Promise<EmbeddingResult[]> {
    const t0 = Date.now();
    const response = await fetch('https://api.voyageai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: this.MODEL, input: texts, input_type: 'document' }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(`Voyage embeddings ${response.status}: ${body.slice(0, 300)}`);
      throw new InternalServerErrorException(
        `Embeddings API error (${response.status}): ${response.statusText}`,
      );
    }

    const data = (await response.json()) as {
      data: { embedding: number[]; index: number }[];
      usage: { total_tokens: number };
    };

    const totalTokens = data.usage?.total_tokens ?? 0;
    const totalCost = (totalTokens / 1_000_000) * this.COST_PER_1M_TOKENS;
    const perCallTokens = Math.round(totalTokens / texts.length);
    const perCallCost = totalCost / texts.length;

    this.logger.log(
      `embedding_batch count=${texts.length} tokens=${totalTokens} costUsd=${totalCost.toFixed(6)} ms=${Date.now() - t0}`,
    );

    const sorted = [...data.data].sort((a, b) => a.index - b.index);
    return sorted.map((item) => ({
      vector: item.embedding,
      model: this.MODEL,
      tokensUsed: perCallTokens,
      costUsd: perCallCost,
    }));
  }
}
