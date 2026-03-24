import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SnapshotStatus } from '@database/generated/client';
import { SnapshotsRepository } from '../repositories';

@Injectable()
export class SnapshotCleanupService {
  private readonly logger = new Logger(SnapshotCleanupService.name);
  private readonly cleanupEnabled = process.env.SNAPSHOT_CLEANUP_ENABLED !== 'false';

  constructor(private readonly snapshotsRepository: SnapshotsRepository) {}

  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupExpiredSnapshots(): Promise<void> {
    if (!this.cleanupEnabled) {
      return;
    }

    const expiredSnapshots = await this.snapshotsRepository.findExpired();
    if (expiredSnapshots.length === 0) {
      return;
    }

    let archivedCount = 0;

    for (const snapshot of expiredSnapshots) {
      try {
        await this.snapshotsRepository.updateStatus(snapshot.id, SnapshotStatus.ARCHIVED);
        archivedCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed to archive expired snapshot ${snapshot.id}: ${message}`);
      }
    }

    this.logger.log(`Expired snapshots cleanup completed: archived ${archivedCount} of ${expiredSnapshots.length}`);
  }
}
