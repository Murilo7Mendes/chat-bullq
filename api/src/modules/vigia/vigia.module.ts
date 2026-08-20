import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { VigiaImapService } from './vigia-imap.service';
import { VigiaDispatchService } from './vigia-dispatch.service';
import { VigiaCronService } from './vigia-cron.service';
import { VigiaSettingsService } from './vigia-settings.service';
import { VigiaSettingsController } from './vigia-settings.controller';
import { VIGIA_QUEUE } from './vigia.constants';

@Module({
  imports: [
    BullModule.registerQueue({ name: VIGIA_QUEUE }),
    BullModule.registerQueue({ name: 'outbound-messages' }),
  ],
  controllers: [VigiaSettingsController],
  providers: [VigiaImapService, VigiaDispatchService, VigiaCronService, VigiaSettingsService],
})
export class VigiaModule {}
