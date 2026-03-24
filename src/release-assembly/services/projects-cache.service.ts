import { Injectable } from '@nestjs/common';
import { ProjectReleaseStructure } from '@integrations/projects';

const DEFAULT_TTL_MS = 5 * 60 * 1000;
const DEFAULT_MAX_SIZE = 1000;

type CacheEntry = {
  expiresAt: number;
  value: ProjectReleaseStructure;
};

@Injectable()
export class ProjectsCacheService {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = Number(process.env.PROJECTS_CACHE_TTL_MS ?? DEFAULT_TTL_MS);
  private readonly maxSize = Number(process.env.PROJECTS_CACHE_MAX_SIZE ?? DEFAULT_MAX_SIZE);

  async getReleaseStructure(
    projectId: string,
    fetcher: () => Promise<ProjectReleaseStructure>,
  ): Promise<ProjectReleaseStructure> {
    const now = Date.now();
    this.evictExpired(now);

    const cached = this.cache.get(projectId);
    if (cached && cached.expiresAt > now) {
      // Refresh key insertion order for LRU behavior.
      this.cache.delete(projectId);
      this.cache.set(projectId, cached);
      return cached.value;
    }

    const value = await fetcher();
    this.evictIfNeeded();
    this.cache.set(projectId, {
      value,
      expiresAt: now + this.ttlMs,
    });
    return value;
  }

  invalidate(projectId: string): void {
    this.cache.delete(projectId);
  }

  clear(): void {
    this.cache.clear();
  }

  private evictExpired(now: number): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  private evictIfNeeded(): void {
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }
      this.cache.delete(oldestKey);
    }
  }
}
