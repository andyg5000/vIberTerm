import * as path from 'path';

/**
 * Get the path to the vt script for testing
 */
export function getVtScriptPath(): string {
  return path.join(process.cwd(), 'bin', 'vt');
}

/**
 * Get the path to the vibeterm binary for testing
 */
export function getVibetermBinaryPath(): string {
  return path.join(process.cwd(), 'native', 'vibeterm');
}
