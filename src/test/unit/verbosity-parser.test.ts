import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VerbosityLevel } from '../../server/utils/logger';
import { parseVerbosityFromEnv } from '../../server/utils/verbosity-parser';

describe('Verbosity Parser', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment variables before each test
    process.env = { ...originalEnv };
    delete process.env.VIBETMUX_LOG_LEVEL;
    delete process.env.VIBETMUX_DEBUG;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('parseVerbosityFromEnv', () => {
    it('should return undefined when no environment variables are set', () => {
      expect(parseVerbosityFromEnv()).toBeUndefined();
    });

    it('should parse VIBETMUX_LOG_LEVEL correctly', () => {
      process.env.VIBETMUX_LOG_LEVEL = 'info';
      expect(parseVerbosityFromEnv()).toBe(VerbosityLevel.INFO);

      process.env.VIBETMUX_LOG_LEVEL = 'DEBUG';
      expect(parseVerbosityFromEnv()).toBe(VerbosityLevel.DEBUG);

      process.env.VIBETMUX_LOG_LEVEL = 'silent';
      expect(parseVerbosityFromEnv()).toBe(VerbosityLevel.SILENT);
    });

    it('should return undefined for invalid VIBETMUX_LOG_LEVEL', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      process.env.VIBETMUX_LOG_LEVEL = 'invalid';
      expect(parseVerbosityFromEnv()).toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid VIBETMUX_LOG_LEVEL: invalid');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Valid levels: silent, error, warn, info, verbose, debug'
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle VIBETMUX_DEBUG=1', () => {
      process.env.VIBETMUX_DEBUG = '1';
      expect(parseVerbosityFromEnv()).toBe(VerbosityLevel.DEBUG);
    });

    it('should handle VIBETMUX_DEBUG=true', () => {
      process.env.VIBETMUX_DEBUG = 'true';
      expect(parseVerbosityFromEnv()).toBe(VerbosityLevel.DEBUG);
    });

    it('should ignore VIBETMUX_DEBUG when set to other values', () => {
      process.env.VIBETMUX_DEBUG = '0';
      expect(parseVerbosityFromEnv()).toBeUndefined();

      process.env.VIBETMUX_DEBUG = 'false';
      expect(parseVerbosityFromEnv()).toBeUndefined();

      process.env.VIBETMUX_DEBUG = 'yes';
      expect(parseVerbosityFromEnv()).toBeUndefined();
    });

    it('should prioritize VIBETMUX_LOG_LEVEL over VIBETMUX_DEBUG', () => {
      process.env.VIBETMUX_LOG_LEVEL = 'warn';
      process.env.VIBETMUX_DEBUG = '1';
      expect(parseVerbosityFromEnv()).toBe(VerbosityLevel.WARN);
    });

    it('should return DEBUG when VIBETMUX_LOG_LEVEL is invalid but VIBETMUX_DEBUG is set', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      process.env.VIBETMUX_LOG_LEVEL = 'invalid';
      process.env.VIBETMUX_DEBUG = '1';
      expect(parseVerbosityFromEnv()).toBe(VerbosityLevel.DEBUG);

      expect(consoleWarnSpy).toHaveBeenCalledTimes(2);
      expect(consoleWarnSpy).toHaveBeenCalledWith('Invalid VIBETMUX_LOG_LEVEL: invalid');

      consoleWarnSpy.mockRestore();
    });
  });
});
