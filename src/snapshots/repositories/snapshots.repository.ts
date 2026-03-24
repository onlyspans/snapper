import { Injectable } from '@nestjs/common';
import { DatabaseService } from '@database/database.service';
import { Prisma, Snapshot, SnapshotStatus } from '@database/generated/client';
import { Pagination } from '@common/interfaces/pagination.interface';
import { SnapshotQueryDto } from '../dto';

@Injectable()
export class SnapshotsRepository {
  constructor(private readonly db: DatabaseService) {}

  async findById(id: string): Promise<Snapshot | null> {
    return this.db.snapshot.findUnique({ where: { id } });
  }

  async findByProjectAndVersion(projectId: string, version: string): Promise<Snapshot | null> {
    return this.db.snapshot.findUnique({
      where: {
        projectId_version: {
          projectId,
          version,
        },
      },
    });
  }

  async findAll(query: SnapshotQueryDto): Promise<Pagination<Snapshot>> {
    const { page = 1, pageSize = 20, projectId, status, version } = query;
    const skip = (page - 1) * pageSize;

    const where: Prisma.SnapshotWhereInput = {
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
      ...(version ? { version: { contains: version, mode: 'insensitive' } } : {}),
    };

    const [items, total] = await this.db.$transaction([
      this.db.snapshot.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
      }),
      this.db.snapshot.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async create(data: Prisma.SnapshotCreateInput): Promise<Snapshot> {
    return this.db.snapshot.create({ data });
  }

  async updateById(id: string, data: Prisma.SnapshotUpdateInput): Promise<Snapshot> {
    return this.db.snapshot.update({
      where: { id },
      data,
    });
  }

  async updateStatus(id: string, status: SnapshotStatus): Promise<Snapshot> {
    return this.updateById(id, { status });
  }

  async removeById(id: string): Promise<Snapshot> {
    return this.db.snapshot.delete({ where: { id } });
  }

  async findExpired(now = new Date()): Promise<Snapshot[]> {
    return this.db.snapshot.findMany({
      where: {
        expiresAt: { lt: now },
        status: { not: SnapshotStatus.ARCHIVED },
      },
      orderBy: { expiresAt: 'asc' },
    });
  }
}
