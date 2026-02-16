/**
 * Global shutdown state management for the server.
 * This module tracks whether the server is currently shutting down
 * to allow various components to handle shutdown gracefully.
 */

let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function setShuttingDown(value: boolean): void {
  shuttingDown = value;
}
