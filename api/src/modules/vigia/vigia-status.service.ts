import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export type VigiaState = 'ok' | 'error' | 'disconnected';

export interface VigiaStatus {
  state: VigiaState;
  lastRunAt: string | null;
  lastError: string | null;
  lastErrorAt: string | null;
  emailsProcessedToday: number;
  emailsSkippedToday: number;
}

const DEFAULT_STATUS: VigiaStatus = {
  state: 'disconnected',
  lastRunAt: null,
  lastError: null,
  lastErrorAt: null,
  emailsProcessedToday: 0,
  emailsSkippedToday: 0,
};

const TTL_S = 60 * 60 * 48; // 48 h

@Injectable()
export class VigiaStatusService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(config: ConfigService) {
    this.redis = new Redis({
      host: config.get<string>('REDIS_HOST', 'localhost'),
      port: config.get<number>('REDIS_PORT', 6379),
      password: config.get<string>('REDIS_PASSWORD') || undefined,
      lazyConnect: true,
    });
    this.redis.connect().catch(() => {/* startup error logged by ioredis */});
  }

  async onModuleDestroy() {
    await this.redis.quit().catch(() => {});
  }

  private key(orgId: string) {
    return `vigia:status:${orgId}`;
  }

  async get(orgId: string): Promise<VigiaStatus> {
    try {
      const raw = await this.redis.get(this.key(orgId));
      if (!raw) return { ...DEFAULT_STATUS };
      return JSON.parse(raw) as VigiaStatus;
    } catch {
      return { ...DEFAULT_STATUS };
    }
  }

  async set(orgId: string, patch: Partial<VigiaStatus>): Promise<VigiaStatus> {
    const current = await this.get(orgId);
    const next: VigiaStatus = { ...current, ...patch };
    await this.redis.set(this.key(orgId), JSON.stringify(next), 'EX', TTL_S);
    return next;
  }

  async recordRun(
    orgId: string,
    processed: number,
    skipped: number,
  ): Promise<VigiaStatus> {
    const current = await this.get(orgId);
    return this.set(orgId, {
      state: 'ok',
      lastRunAt: new Date().toISOString(),
      lastError: null,
      lastErrorAt: null,
      emailsProcessedToday: current.emailsProcessedToday + processed,
      emailsSkippedToday: current.emailsSkippedToday + skipped,
    });
  }

  async recordError(orgId: string, error: string): Promise<VigiaStatus> {
    const current = await this.get(orgId);
    return this.set(orgId, {
      state: 'error',
      lastError: error,
      lastErrorAt: new Date().toISOString(),
      // keep processedToday/skippedToday
      emailsProcessedToday: current.emailsProcessedToday,
      emailsSkippedToday: current.emailsSkippedToday,
    });
  }

  async recordDisconnected(orgId: string): Promise<VigiaStatus> {
    const current = await this.get(orgId);
    return this.set(orgId, {
      state: 'disconnected',
      emailsProcessedToday: current.emailsProcessedToday,
      emailsSkippedToday: current.emailsSkippedToday,
    });
  }
}
