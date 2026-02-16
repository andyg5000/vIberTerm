import type { SessionStatus } from '../../shared/types.js';

export const DEFAULT_ACTIVITY_IDLE_TIMEOUT_MS = 5000;

export type ActivityStatus = {
  isActive: boolean;
  lastActivityAt?: string;
};

export type ActivityStatusInput = {
  status: SessionStatus;
  lastOutputTimestamp?: number;
  lastInputTimestamp?: number;
  lastModified?: string;
  startedAt?: string;
  now?: number;
  idleTimeoutMs?: number;
};

const parseTimestamp = (value?: string): number | null => {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

export function computeActivityStatus(input: ActivityStatusInput): ActivityStatus {
  if (input.status !== 'running') {
    return { isActive: false };
  }

  const now = input.now ?? Date.now();
  const idleTimeoutMs = input.idleTimeoutMs ?? DEFAULT_ACTIVITY_IDLE_TIMEOUT_MS;
  const timestamps: number[] = [];
  if (typeof input.lastOutputTimestamp === 'number') {
    timestamps.push(input.lastOutputTimestamp);
  }
  if (typeof input.lastInputTimestamp === 'number') {
    timestamps.push(input.lastInputTimestamp);
  }
  const lastModified = parseTimestamp(input.lastModified);
  if (typeof lastModified === 'number') {
    timestamps.push(lastModified);
  }
  const startedAt = parseTimestamp(input.startedAt);
  if (typeof startedAt === 'number') {
    timestamps.push(startedAt);
  }

  const lastActivity = timestamps.length > 0 ? Math.max(...timestamps) : null;

  if (typeof lastActivity !== 'number') {
    return { isActive: false };
  }

  const isActive = now - lastActivity <= idleTimeoutMs;
  return {
    isActive,
    lastActivityAt: new Date(lastActivity).toISOString(),
  };
}
