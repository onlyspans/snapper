import { Injectable } from '@nestjs/common';
import { Counter, Histogram, Registry, collectDefaultMetrics, exponentialBuckets } from 'prom-client';

@Injectable()
export class MetricsService {
  readonly registry: Registry;

  private readonly snapshotCreatedTotal: Counter;
  private readonly assemblyStatusTotal: Counter<'status'>;
  private readonly pipelineStepDurationSeconds: Histogram<'step'>;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry, prefix: 'snapper_' });

    this.snapshotCreatedTotal = new Counter({
      name: 'snapper_snapshot_created_total',
      help: 'Total number of created snapshots',
      registers: [this.registry],
    });

    this.assemblyStatusTotal = new Counter({
      name: 'snapper_assembly_total',
      help: 'Total number of completed or failed release assemblies',
      labelNames: ['status'],
      registers: [this.registry],
    });

    this.pipelineStepDurationSeconds = new Histogram({
      name: 'snapper_pipeline_step_duration_seconds',
      help: 'Duration of release assembly pipeline step in seconds',
      labelNames: ['step'],
      buckets: exponentialBuckets(0.01, 2, 12),
      registers: [this.registry],
    });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  recordSnapshotCreated(): void {
    this.snapshotCreatedTotal.inc();
  }

  recordAssemblyCompleted(): void {
    this.assemblyStatusTotal.inc({ status: 'completed' });
  }

  recordAssemblyFailed(): void {
    this.assemblyStatusTotal.inc({ status: 'failed' });
  }

  startPipelineStepTimer(step: string): () => void {
    return this.pipelineStepDurationSeconds.startTimer({ step });
  }
}
