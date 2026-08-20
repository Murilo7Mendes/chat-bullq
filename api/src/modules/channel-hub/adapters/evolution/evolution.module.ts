import { Module } from '@nestjs/common';
import { EvolutionHttpClient } from './evolution.http-client';
import { EvolutionMessageMapper } from './evolution.message-mapper';
import { EvolutionInboundAdapter } from './evolution.inbound-adapter';
import { EvolutionOutboundAdapter } from './evolution.outbound-adapter';

@Module({
  providers: [
    EvolutionHttpClient,
    EvolutionMessageMapper,
    EvolutionInboundAdapter,
    EvolutionOutboundAdapter,
  ],
  exports: [EvolutionInboundAdapter, EvolutionOutboundAdapter, EvolutionHttpClient],
})
export class EvolutionModule {}
