import { parseVerbosityLevel, VerbosityLevel } from './logger.js';

/**
 * Parse verbosity level from environment variables
 * Checks VIBETERM_LOG_LEVEL first, then falls back to VIBETERM_DEBUG for backward compatibility
 * @returns The parsed verbosity level or undefined if not set
 */
export function parseVerbosityFromEnv(): VerbosityLevel | undefined {
  // Check VIBETERM_LOG_LEVEL first
  if (process.env.VIBETERM_LOG_LEVEL) {
    const parsed = parseVerbosityLevel(process.env.VIBETERM_LOG_LEVEL);
    if (parsed !== undefined) {
      return parsed;
    }
    // Warn about invalid value
    console.warn(`Invalid VIBETERM_LOG_LEVEL: ${process.env.VIBETERM_LOG_LEVEL}`);
    console.warn('Valid levels: silent, error, warn, info, verbose, debug');
  }

  // Check legacy VIBETERM_DEBUG for backward compatibility
  if (process.env.VIBETERM_DEBUG === '1' || process.env.VIBETERM_DEBUG === 'true') {
    return VerbosityLevel.DEBUG;
  }

  return undefined;
}
