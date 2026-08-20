import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MessagingModule } from '../messaging/messaging.module';
import { VigiaImapService } from './vigia-imap.service';
import { VigiaDispatchService } from './vigia-dispatch.service';
import { VigiaCronService } from './vigia-cron.service';
import { VIGIA_QUEUE } from './vigia.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: VIGIA_QUEUE }),
    BullModule.registerQueue({ name: 'outbound-messages' }),
    MessagingModule,
  ],
  providers: [VigiaImapService, VigiaDispatchService, VigiaCronService],
})
export class VigiaModule {}
