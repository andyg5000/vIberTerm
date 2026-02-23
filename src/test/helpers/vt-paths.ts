import * as path from 'path';

/**
 * Get the path to the vt script for testing
 */
export function getVtScriptPath(): string {
  return path.join(process.cwd(), 'bin', 'vt');
}

/**
 * Get the path to the vibetmux binary for testing
 */
export function getVibetmuxBinaryPath(): string {
  return path.join(process.cwd(), 'native', 'vibetmux');
}
