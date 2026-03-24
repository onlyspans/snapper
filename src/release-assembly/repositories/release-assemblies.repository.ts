import { Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '@database/database.service';
import { AssemblyStatus, Prisma, ReleaseAssembly } from '@database/generated/client';
import { AssemblyStep } from '../interfaces';

@Injectable()
export class ReleaseAssembliesRepository {
  constructor(private readonly db: DatabaseService) {}

  async create(data: Prisma.ReleaseAssemblyCreateInput): Promise<ReleaseAssembly> {
    return this.db.releaseAssembly.create({ data });
  }

  async findById(id: string): Promise<ReleaseAssembly | null> {
    return this.db.releaseAssembly.findUnique({ where: { id } });
  }

  async findByProjectAndVersion(projectId: string, version: string): Promise<ReleaseAssembly | null> {
    return this.db.releaseAssembly.findFirst({
      where: { projectId, version },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateStatus(id: string, status: AssemblyStatus, errorMessage?: string): Promise<ReleaseAssembly> {
    return this.db.releaseAssembly.update({
      where: { id },
      data: {
        status,
        errorMessage,
        completedAt: status === AssemblyStatus.COMPLETED ? new Date() : undefined,
      },
    });
  }

  async updateStep(
    id: string,
    stepName: string,
    status: AssemblyStep['status'],
    message?: string,
  ): Promise<ReleaseAssembly> {
    return this.db.$transaction(
      async (tx) => {
        const assembly = await tx.releaseAssembly.findUnique({ where: { id } });
        if (!assembly) {
          throw new NotFoundException(`Release assembly "${id}" not found`);
        }

        const currentSteps = (assembly.steps as unknown as AssemblyStep[]) ?? [];
        const updatedAt = new Date().toISOString();
        const nextSteps = currentSteps.map((step) =>
          step.name === stepName ? { ...step, status, message, updatedAt } : step,
        );

        return tx.releaseAssembly.update({
          where: { id },
          data: { steps: nextSteps as unknown as Prisma.InputJsonValue },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  async updateSnapshotId(id: string, snapshotId: string): Promise<ReleaseAssembly> {
    return this.db.releaseAssembly.update({
      where: { id },
      data: { snapshotId },
    });
  }
}
