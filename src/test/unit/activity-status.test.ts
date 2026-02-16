import { describe, expect, it } from 'vitest';
import {
  computeActivityStatus,
  DEFAULT_ACTIVITY_IDLE_TIMEOUT_MS,
} from '../../server/pty/activity-status';

describe('computeActivityStatus', () => {
  const now = Date.UTC(2025, 0, 1, 12, 0, 0);

  it('marks running session active when output is recent', () => {
    const result = computeActivityStatus({
      status: 'running',
      lastOutputTimestamp: now - DEFAULT_ACTIVITY_IDLE_TIMEOUT_MS + 100,
      now,
    });

    expect(result.isActive).toBe(true);
    expect(result.lastActivityAt).toBe(
      new Date(now - DEFAULT_ACTIVITY_IDLE_TIMEOUT_MS + 100).toISOString()
    );
  });

  it('marks running session idle when output is stale', () => {
    const result = computeActivityStatus({
      status: 'running',
      lastOutputTimestamp: now - DEFAULT_ACTIVITY_IDLE_TIMEOUT_MS - 1,
      now,
    });

    expect(result.isActive).toBe(false);
    expect(result.lastActivityAt).toBe(
      new Date(now - DEFAULT_ACTIVITY_IDLE_TIMEOUT_MS - 1).toISOString()
    );
  });

  it('falls back to lastModified when no output timestamp exists', () => {
    const lastModified = new Date(now - 500).toISOString();
    const result = computeActivityStatus({
      status: 'running',
      lastModified,
      now,
    });

    expect(result.isActive).toBe(true);
    expect(result.lastActivityAt).toBe(lastModified);
  });

  it('marks running session active when input is recent', () => {
    const result = computeActivityStatus({
      status: 'running',
      lastInputTimestamp: now - 200,
      now,
    });

    expect(result.isActive).toBe(true);
    expect(result.lastActivityAt).toBe(new Date(now - 200).toISOString());
  });

  it('uses the most recent activity timestamp', () => {
    const result = computeActivityStatus({
      status: 'running',
      lastOutputTimestamp: now - 800,
      lastInputTimestamp: now - 100,
      lastModified: new Date(now - 50).toISOString(),
      now,
    });

    expect(result.isActive).toBe(true);
    expect(result.lastActivityAt).toBe(new Date(now - 50).toISOString());
  });

  it('never marks exited sessions active', () => {
    const result = computeActivityStatus({
      status: 'exited',
      lastOutputTimestamp: now,
      now,
    });

    expect(result.isActive).toBe(false);
  });
});
