#!/usr/bin/env node
// Entry point for the VibeTerm server

import { startVibeTermServer } from './server/server.js';
import { closeLogger, createLogger, initLogger, VerbosityLevel } from './server/utils/logger.js';
import { parseVerbosityFromEnv } from './server/utils/verbosity-parser.js';
import { VERSION } from './server/version.js';

// Check for version command early - before logger initialization
if (process.argv[2] === 'version') {
  console.log(`VibeTerm Server v${VERSION}`);
  process.exit(0);
}

// Initialize logger before anything else
const verbosityLevel = parseVerbosityFromEnv();
const debugMode = process.env.VIBETERM_DEBUG === '1' || process.env.VIBETERM_DEBUG === 'true';

initLogger(debugMode, verbosityLevel);
const logger = createLogger('cli');

// Prevent double execution
interface GlobalWithVibeterm {
  __vibetermStarted?: boolean;
}

const globalWithVibeterm = global as unknown as GlobalWithVibeterm;

if (globalWithVibeterm.__vibetermStarted) {
  process.exit(0);
}
globalWithVibeterm.__vibetermStarted = true;

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  logger.error('Stack trace:', error.stack);
  closeLogger();
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection at:', promise, 'reason:', reason);
  if (reason instanceof Error) {
    logger.error('Stack trace:', reason.stack);
  }
  closeLogger();
  process.exit(1);
});

function printHelp(): void {
  console.log(`VibeTerm Server v${VERSION}`);
  console.log('');
  console.log('Usage:');
  console.log('  vibeterm [options]                    Start VibeTerm server');
  console.log('  vibeterm systemd [action]             Manage systemd service (Linux)');
  console.log('  vibeterm version                      Show version');
  console.log('  vibeterm help                         Show this help');
  console.log('');
  console.log('Systemd Service Actions:');
  console.log('  install   - Install VibeTerm as systemd service (default)');
  console.log('  uninstall - Remove VibeTerm systemd service');
  console.log('  status    - Check systemd service status');
  console.log('');
  console.log('Examples:');
  console.log('  vibeterm --port 8080 --no-auth');
  console.log('  vibeterm systemd');
  console.log('  vibeterm systemd uninstall');
  console.log('');
  console.log('For more options, run: vibeterm --help');
}

function printVersion(): void {
  console.log(`VibeTerm Server v${VERSION}`);
}

async function handleSystemdService(): Promise<void> {
  try {
    const { installSystemdService } = await import('./server/services/systemd-installer.js');
    const action = process.argv[3] || 'install';
    installSystemdService(action);
  } catch (error) {
    logger.error('Failed to load systemd installer:', error);
    closeLogger();
    process.exit(1);
  }
}

function handleStartServer(): void {
  if (verbosityLevel !== undefined && verbosityLevel >= VerbosityLevel.INFO) {
    logger.log('Starting VibeTerm server...');
  }
  startVibeTermServer();
}

async function parseCommandAndExecute(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case 'version':
      printVersion();
      process.exit(0);
      break;

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      process.exit(0);
      break;

    case 'systemd':
      await handleSystemdService();
      break;

    default:
      // No command provided - start the server
      handleStartServer();
      break;
  }
}

function isMainModule(): boolean {
  return (
    !module.parent &&
    (require.main === module ||
      require.main === undefined ||
      (require.main?.filename?.endsWith('/vibeterm-cli') ?? false))
  );
}

// Main execution
if (isMainModule()) {
  parseCommandAndExecute().catch((error) => {
    logger.error('Unhandled error in main execution:', error);
    if (error instanceof Error) {
      logger.error('Stack trace:', error.stack);
    }
    closeLogger();
    process.exit(1);
  });
}
