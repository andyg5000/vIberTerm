// VibeTerm server entry point
import chalk from 'chalk';
import compression from 'compression';
import type { Response as ExpressResponse } from 'express';
import express from 'express';
import * as fs from 'fs';
import helmet from 'helmet';
import type * as http from 'http';
import { createServer } from 'http';
import * as os from 'os';
import * as path from 'path';
import { WebSocketServer } from 'ws';
import { ServerEventType } from '../shared/types.js';
import type { AuthenticatedRequest } from './middleware/auth.js';
import { createAuthMiddleware } from './middleware/auth.js';
import { PtyManager } from './pty/index.js';
import { createAuthRoutes } from './routes/auth.js';
import { createConfigRoutes } from './routes/config.js';
import { createFileRoutes } from './routes/files.js';
import { createFilesystemRoutes } from './routes/filesystem.js';
import { createGitRoutes } from './routes/git.js';
import { createLogRoutes } from './routes/logs.js';
import { createMultiplexerRoutes } from './routes/multiplexer.js';
import { createPushRoutes } from './routes/push.js';
import { createRepositoryRoutes } from './routes/repositories.js';
import { createSessionRoutes } from './routes/sessions.js';
import { createTmuxRoutes } from './routes/tmux.js';
import { createWorktreeRoutes } from './routes/worktrees.js';
import { AuthService } from './services/auth-service.js';
import { CastOutputHub } from './services/cast-output-hub.js';
import { ConfigService } from './services/config-service.js';
import { ControlDirWatcher } from './services/control-dir-watcher.js';
import { GitStatusHub } from './services/git-status-hub.js';
import { PushNotificationService } from './services/push-notification-service.js';
import { SessionMonitor } from './services/session-monitor.js';
import { TerminalManager } from './services/terminal-manager.js';
import { WsV3Hub } from './services/ws-v3-hub.js';
import { closeLogger, createLogger, initLogger, setDebugMode } from './utils/logger.js';
import { VapidManager } from './utils/vapid-manager.js';
import { getVersionInfo, printVersionBanner } from './version.js';

// Extended WebSocket request with authentication and routing info
interface WebSocketRequest extends http.IncomingMessage {
  pathname?: string;
  searchParams?: URLSearchParams;
  userId?: string;
  authMethod?: string;
}

interface ConnectionInfo {
  http: {
    port: number | null;
    url: string;
  };
  port: number | null;
}

const logger = createLogger('server');

// Global shutdown state management
let shuttingDown = false;

export function isShuttingDown(): boolean {
  return shuttingDown;
}

export function setShuttingDown(value: boolean): void {
  shuttingDown = value;
}

interface Config {
  port: number | null;
  bind: string | null;
  enableSSHKeys: boolean;
  disallowUserPassword: boolean;
  noAuth: boolean;
  showHelp: boolean;
  showVersion: boolean;
  debug: boolean;
  // Push notification configuration
  pushEnabled: boolean;
  vapidEmail: string | null;
  generateVapidKeys: boolean;
  bellNotificationsEnabled: boolean;
  // Local bypass configuration
  allowLocalBypass: boolean;
  localAuthToken: string | null;
}

// Show help message
function showHelp() {
  console.log(`
VibeTerm Server - Terminal Multiplexer

Usage: vibeterm-server [options]

Options:
  --help                Show this help message
  --version             Show version information
  --port <number>       Server port (default: 4020 or PORT env var)
  --bind <address>      Bind address (default: 0.0.0.0, all interfaces)
  --enable-ssh-keys     Enable SSH key authentication UI and functionality
  --disallow-user-password  Disable password auth, SSH keys only (auto-enables --enable-ssh-keys)
  --no-auth             Disable authentication (auto-login as current user)
  --allow-local-bypass  Allow localhost connections to bypass authentication
  --local-auth-token <token>  Token for localhost authentication bypass
  --debug               Enable debug logging

Push Notification Options:
  --push-enabled        Enable push notifications (default: enabled)
  --push-disabled       Disable push notifications
  --vapid-email <email> Contact email for VAPID (or PUSH_CONTACT_EMAIL env var)
  --generate-vapid-keys Generate new VAPID keys if none exist

Environment Variables:
  PORT                  Default port if --port not specified
  VIBETERM_USERNAME     Default username if --username not specified
  VIBETERM_PASSWORD     Default password if --password not specified
  VIBETERM_CONTROL_DIR  Control directory for session data
  PUSH_CONTACT_EMAIL    Contact email for VAPID configuration

Examples:
  # Run a simple server with authentication
  vibeterm-server --username admin --password secret

  # Run with no auth
  vibeterm-server --no-auth
`);
}

// Parse command line arguments
function parseArgs(): Config {
  const args = process.argv.slice(2);
  const config = {
    port: null as number | null,
    bind: null as string | null,
    enableSSHKeys: false,
    disallowUserPassword: false,
    noAuth: false,
    showHelp: false,
    showVersion: false,
    debug: false,
    // Push notification configuration
    pushEnabled: true, // Enable by default with auto-generation
    vapidEmail: null as string | null,
    generateVapidKeys: true, // Generate keys automatically
    bellNotificationsEnabled: true, // Enable bell notifications by default
    // Local bypass configuration
    allowLocalBypass: false,
    localAuthToken: null as string | null,
  };

  // Check for help flag first
  if (args.includes('--help') || args.includes('-h')) {
    config.showHelp = true;
    return config;
  }

  // Check for version flag
  if (args.includes('--version') || args.includes('-v')) {
    config.showVersion = true;
    return config;
  }

  // Check for command line arguments
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && i + 1 < args.length) {
      config.port = Number.parseInt(args[i + 1], 10);
      i++; // Skip the port value in next iteration
    } else if (args[i] === '--bind' && i + 1 < args.length) {
      config.bind = args[i + 1];
      i++; // Skip the bind value in next iteration
    } else if (args[i] === '--enable-ssh-keys') {
      config.enableSSHKeys = true;
    } else if (args[i] === '--disallow-user-password') {
      config.disallowUserPassword = true;
      config.enableSSHKeys = true; // Auto-enable SSH keys
    } else if (args[i] === '--no-auth') {
      config.noAuth = true;
    } else if (args[i] === '--debug') {
      config.debug = true;
    } else if (args[i] === '--push-enabled') {
      config.pushEnabled = true;
    } else if (args[i] === '--push-disabled') {
      config.pushEnabled = false;
    } else if (args[i] === '--vapid-email' && i + 1 < args.length) {
      config.vapidEmail = args[i + 1];
      i++; // Skip the email value in next iteration
    } else if (args[i] === '--generate-vapid-keys') {
      config.generateVapidKeys = true;
    } else if (args[i] === '--allow-local-bypass') {
      config.allowLocalBypass = true;
    } else if (args[i] === '--local-auth-token' && i + 1 < args.length) {
      config.localAuthToken = args[i + 1];
      i++; // Skip the token value in next iteration
    } else if (args[i].startsWith('--')) {
      // Unknown argument
      logger.error(`Unknown argument: ${args[i]}`);
      logger.error('Use --help to see available options');
      process.exit(1);
    }
  }

  // Check environment variables for push notifications
  if (!config.vapidEmail && process.env.PUSH_CONTACT_EMAIL) {
    config.vapidEmail = process.env.PUSH_CONTACT_EMAIL;
  }

  return config;
}

// Validate configuration
function validateConfig(config: ReturnType<typeof parseArgs>) {
  // Validate auth configuration
  if (config.noAuth && (config.enableSSHKeys || config.disallowUserPassword)) {
    logger.warn(
      '--no-auth overrides all other authentication settings (authentication is disabled)'
    );
  }

  if (config.disallowUserPassword && !config.enableSSHKeys) {
    logger.warn('--disallow-user-password requires SSH keys, auto-enabling --enable-ssh-keys');
    config.enableSSHKeys = true;
  }
}

interface AppInstance {
  app: express.Application;
  server: ReturnType<typeof createServer>;
  wss: WebSocketServer;
  startServer: () => void;
  config: Config;
  configService: ConfigService;
  ptyManager: PtyManager;
  terminalManager: TerminalManager;
  controlDirWatcher: ControlDirWatcher | null;
  pushNotificationService: PushNotificationService | null;
}

// Track if app has been created
let appCreated = false;

export async function createApp(): Promise<AppInstance> {
  // Prevent multiple app instances
  if (appCreated) {
    logger.error('App already created, preventing duplicate instance');
    throw new Error('Duplicate app creation detected');
  }
  appCreated = true;

  const config = parseArgs();

  // Check if help was requested
  if (config.showHelp) {
    showHelp();
    process.exit(0);
  }

  // Check if version was requested
  if (config.showVersion) {
    const versionInfo = getVersionInfo();
    console.log(`VibeTerm Server v${versionInfo.version}`);
    console.log(`Built: ${versionInfo.buildDate}`);
    console.log(`Platform: ${versionInfo.platform}/${versionInfo.arch}`);
    console.log(`Node: ${versionInfo.nodeVersion}`);
    process.exit(0);
  }

  // Print version banner on startup
  printVersionBanner();

  validateConfig(config);

  logger.log('Initializing VibeTerm server components');
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true });

  // Add security headers with Helmet
  app.use(
    helmet({
      contentSecurityPolicy: false, // We handle CSP ourselves for the web terminal
      crossOriginEmbedderPolicy: false, // Allow embedding in iframes for integrations
    })
  );
  logger.debug('Configured security headers with helmet');

  // Add compression middleware with Brotli support
  app.use(
    compression({
      // Enable Brotli compression with highest priority
      level: 6, // Balanced compression level
    })
  );
  logger.debug('Configured compression middleware');

  // Add JSON body parser middleware with size limit
  app.use(express.json({ limit: '10mb' }));
  logger.debug('Configured express middleware');

  // Control directory for session data
  const CONTROL_DIR =
    process.env.VIBETERM_CONTROL_DIR || path.join(os.homedir(), '.vibeterm/control');

  // Ensure control directory exists
  if (!fs.existsSync(CONTROL_DIR)) {
    fs.mkdirSync(CONTROL_DIR, { recursive: true });
    logger.log(chalk.green(`Created control directory: ${CONTROL_DIR}`));
  } else {
    logger.debug(`Using existing control directory: ${CONTROL_DIR}`);
  }

  // Initialize PTY manager with fallback support
  await PtyManager.initialize();
  const ptyManager = new PtyManager(CONTROL_DIR);
  logger.debug('Initialized PTY manager');

  // Clean up sessions from old VibeTerm versions
  const sessionManager = ptyManager.getSessionManager();
  const cleanupResult = sessionManager.cleanupOldVersionSessions();
  if (cleanupResult.versionChanged) {
    logger.log(
      chalk.yellow(
        `Version change detected - cleaned up ${cleanupResult.cleanedCount} sessions from previous version`
      )
    );
  } else if (cleanupResult.cleanedCount > 0) {
    logger.log(
      chalk.yellow(
        `Cleaned up ${cleanupResult.cleanedCount} legacy sessions without version information`
      )
    );
  }

  // Initialize Terminal Manager for server-side terminal state
  const terminalManager = new TerminalManager(CONTROL_DIR);
  logger.debug('Initialized terminal manager');

  // Initialize cast output hub + git status hub for WebSocket v3
  const castOutputHub = new CastOutputHub(sessionManager);
  const gitStatusHub = new GitStatusHub();
  logger.debug('Initialized v3 cast output + git status hubs');

  // Initialize session monitor with PTY manager
  const sessionMonitor = new SessionMonitor(ptyManager);
  await sessionMonitor.initialize();

  // Set the session monitor on PTY manager for data tracking
  ptyManager.setSessionMonitor(sessionMonitor);
  logger.debug('Initialized session monitor');

  // Initialize configuration service
  const configService = new ConfigService();
  configService.startWatching();
  logger.debug('Initialized configuration service');

  // Initialize push notification services
  let vapidManager: VapidManager | null = null;
  let pushNotificationService: PushNotificationService | null = null;

  if (config.pushEnabled) {
    try {
      logger.log('Initializing push notification services');

      // Initialize VAPID manager with auto-generation
      vapidManager = new VapidManager();
      await vapidManager.initialize({
        contactEmail: config.vapidEmail || 'noreply@vibeterm.local',
        generateIfMissing: true, // Auto-generate keys if none exist
      });

      logger.log('VAPID keys initialized successfully');

      // Initialize push notification service
      pushNotificationService = new PushNotificationService(vapidManager);
      await pushNotificationService.initialize();

      logger.log(chalk.green('Push notification services initialized'));
    } catch (error) {
      logger.error('Failed to initialize push notification services:', error);
      logger.warn('Continuing without push notifications');
      vapidManager = null;
      pushNotificationService = null;
    }
  } else {
    logger.debug('Push notifications disabled');
  }

  // Connect SessionMonitor to push notification service
  if (sessionMonitor && pushNotificationService) {
    logger.info('Connecting SessionMonitor to push notification service');

    // Listen for session monitor notifications and send push notifications
    sessionMonitor.on('notification', async (event) => {
      try {
        // Map event types to push notification data
        let pushPayload = null;

        switch (event.type) {
          case ServerEventType.SessionStart:
            pushPayload = {
              type: 'session-start',
              title: 'Session Started',
              body: event.sessionName || 'Terminal Session',
            };
            break;

          case ServerEventType.SessionExit:
            pushPayload = {
              type: 'session-exit',
              title: 'Session Ended',
              body: event.sessionName || 'Terminal Session',
              data: { exitCode: event.exitCode },
            };
            break;

          case ServerEventType.CommandFinished:
            pushPayload = {
              type: 'command-finished',
              title: 'Your Turn',
              body: event.command || 'Command completed',
              data: { duration: event.duration },
            };
            break;

          case ServerEventType.CommandError:
            pushPayload = {
              type: 'command-error',
              title: 'Command Failed',
              body: event.command || 'Command failed',
              data: { exitCode: event.exitCode },
            };
            break;

          case ServerEventType.Bell:
            pushPayload = {
              type: 'bell',
              title: 'Terminal Bell',
              body: event.sessionName || 'Terminal',
            };
            break;

          case ServerEventType.TestNotification:
            // Test notifications are already handled by the test endpoint
            return;

          default:
            return; // Skip unknown event types
        }

        if (pushPayload) {
          // Send push notification
          const result = await pushNotificationService.sendNotification({
            ...pushPayload,
            icon: '/apple-touch-icon.png',
            badge: '/favicon-32.png',
            tag: `vibeterm-${pushPayload.type}`,
            requireInteraction: pushPayload.type === 'command-error',
            actions: [
              {
                action: 'view-session',
                title: 'View Session',
              },
              {
                action: 'dismiss',
                title: 'Dismiss',
              },
            ],
            data: {
              ...pushPayload.data,
              type: pushPayload.type,
              sessionId: event.sessionId,
              timestamp: event.timestamp,
            },
          });

          logger.debug(
            `Push notification sent for ${event.type}: ${result.sent} successful, ${result.failed} failed`
          );
        }
      } catch (error) {
        logger.error('Failed to send push notification for SessionMonitor event:', error);
      }
    });
  }

  // Initialize authentication service
  const authService = new AuthService();
  logger.debug('Initialized authentication service');

  // Initialize v3 WebSocket hub (single-socket terminal transport)
  const wsV3Hub = new WsV3Hub({
    ptyManager,
    terminalManager,
    castOutputHub,
    gitStatusHub,
    sessionMonitor,
  });
  logger.debug('Initialized WebSocket v3 hub');

  // Set up authentication
  const authMiddleware = createAuthMiddleware({
    enableSSHKeys: config.enableSSHKeys,
    disallowUserPassword: config.disallowUserPassword,
    noAuth: config.noAuth,
    isHQMode: false,
    authService, // Add enhanced auth service for JWT tokens
    allowLocalBypass: config.allowLocalBypass,
    localAuthToken: config.localAuthToken || undefined,
  });

  // Serve static files with .html extension handling and caching headers
  // In production/bundled mode, use the package directory; in development, use cwd
  const getPublicPath = () => {
    // First check if BUILD_PUBLIC_PATH is set
    if (process.env.BUILD_PUBLIC_PATH) {
      logger.info(`Using BUILD_PUBLIC_PATH: ${process.env.BUILD_PUBLIC_PATH}`);
      return process.env.BUILD_PUBLIC_PATH;
    }
    // More precise npm package detection:
    // 1. Check if we're explicitly in an npm package structure
    // 2. The file should be in node_modules/vibeterm/lib/
    // 3. Or check for our specific package markers
    const isNpmPackage = (() => {
      // Most reliable: check if we're in node_modules/vibeterm structure
      if (__filename.includes(path.join('node_modules', 'vibeterm', 'lib'))) {
        return true;
      }

      // Check for Windows path variant
      if (__filename.includes('node_modules\\vibeterm\\lib')) {
        return true;
      }

      // Secondary check: if we're in a lib directory, verify it's actually an npm package
      // by checking for the existence of package.json in the parent directory
      if (path.basename(__dirname) === 'lib') {
        const parentDir = path.dirname(__dirname);
        const packageJsonPath = path.join(parentDir, 'package.json');
        try {
          const packageJson = require(packageJsonPath);
          // Verify this is actually our package
          return packageJson.name === 'vibeterm';
        } catch {
          // Not a valid npm package structure
          return false;
        }
      }

      return false;
    })();

    if (process.env.VIBETERM_BUNDLED === 'true' || process.env.BUILD_DATE || isNpmPackage) {
      // In bundled/production/npm mode, find package root
      // When bundled, __dirname is /path/to/package/dist, so go up one level
      // When globally installed, we need to find the package root
      let packageRoot = __dirname;

      // If we're in the dist directory, go up one level
      if (path.basename(packageRoot) === 'dist') {
        packageRoot = path.dirname(packageRoot);
      }

      // For npm package context, if we're in lib directory, go up one level
      if (path.basename(packageRoot) === 'lib') {
        packageRoot = path.dirname(packageRoot);
      }

      // Look for package.json to confirm we're in the right place
      const publicPath = path.join(packageRoot, 'public');
      const indexPath = path.join(publicPath, 'index.html');

      // If index.html exists, we found the right path
      if (require('fs').existsSync(indexPath)) {
        return publicPath;
      }

      // Fallback: try going up from the bundled CLI location
      return path.join(__dirname, '..', 'public');
    } else {
      // In development mode, use current working directory
      return path.join(process.cwd(), 'public');
    }
  };

  const publicPath = getPublicPath();
  const isDevelopment = !process.env.BUILD_DATE || process.env.NODE_ENV === 'development';

  app.use(
    express.static(publicPath, {
      extensions: ['html'], // This allows /logs to resolve to /logs.html
      maxAge: isDevelopment ? 0 : '1d', // No cache in dev, 1 day in production
      etag: !isDevelopment, // Disable ETag in development
      lastModified: !isDevelopment, // Disable Last-Modified in development
      setHeaders: (res, filePath) => {
        if (isDevelopment) {
          // Disable all caching in development
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Pragma', 'no-cache');
          res.setHeader('Expires', '0');
        } else {
          // Production caching rules
          // Set longer cache for immutable assets
          if (filePath.match(/\.(js|css|woff2?|ttf|eot|svg|png|jpg|jpeg|gif|ico)$/)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
          // Shorter cache for HTML files
          else if (filePath.endsWith('.html')) {
            res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
          }
        }
      },
    })
  );
  logger.debug(
    `Serving static files from: ${publicPath} ${isDevelopment ? 'with caching disabled (dev mode)' : 'with caching headers'}`
  );

  // Health check endpoint (no auth required)
  app.get('/api/health', async (_req, res) => {
    const versionInfo = getVersionInfo();

    // Get connection information
    const connections: ConnectionInfo = {
      http: {
        port: config.port,
        url: `http://localhost:${config.port}`,
      },
      // Legacy fields for older clients
      port: config.port,
    };

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      mode: 'standalone',
      version: versionInfo.version,
      buildDate: versionInfo.buildDate,
      uptime: versionInfo.uptime,
      pid: versionInfo.pid,
      connections,
    });
  });

  // Connect session exit notifications if push notifications are enabled
  if (pushNotificationService) {
    ptyManager.on('sessionExited', (sessionId: string) => {
      // Load session info to get details
      const sessionInfo = sessionManager.loadSessionInfo(sessionId);
      const exitCode = sessionInfo?.exitCode ?? 0;
      const sessionName = sessionInfo?.name || `Session ${sessionId}`;

      // Determine notification type based on exit code
      const notificationType = exitCode === 0 ? 'session-exit' : 'session-error';
      const title = exitCode === 0 ? 'Session Ended' : 'Session Ended with Errors';
      const body =
        exitCode === 0
          ? `${sessionName} has finished.`
          : `${sessionName} exited with code ${exitCode}.`;

      pushNotificationService
        .sendNotification({
          type: notificationType,
          title,
          body,
          icon: '/apple-touch-icon.png',
          badge: '/favicon-32.png',
          tag: `vibeterm-${notificationType}-${sessionId}`,
          requireInteraction: false,
          data: {
            type: notificationType,
            sessionId,
            sessionName,
            exitCode,
            timestamp: new Date().toISOString(),
          },
          actions: [
            { action: 'view-logs', title: 'View Logs' },
            { action: 'dismiss', title: 'Dismiss' },
          ],
        })
        .catch((error) => {
          logger.error('Failed to send session exit notification:', error);
        });
    });
    logger.debug('Connected session exit notifications to PTY manager');

    // Connect command finished notifications
    ptyManager.on('commandFinished', ({ sessionId, command, exitCode, duration, timestamp }) => {
      const isClaudeCommand = command.toLowerCase().includes('claude');

      // Enhanced logging for Claude commands
      if (isClaudeCommand) {
        logger.log(
          chalk.magenta(
            `Server received Claude commandFinished event: sessionId=${sessionId}, command="${command}", exitCode=${exitCode}, duration=${duration}ms`
          )
        );
      } else {
        logger.debug(
          `Server received commandFinished event for session ${sessionId}: "${command}"`
        );
      }

      // Determine notification type based on exit code
      const notificationType = exitCode === 0 ? 'command-finished' : 'command-error';
      const title = exitCode === 0 ? 'Command Completed' : 'Command Failed';
      const body =
        exitCode === 0
          ? `${command} completed successfully`
          : `${command} failed with exit code ${exitCode}`;

      // Format duration for display
      const durationStr =
        duration > 60000
          ? `${Math.round(duration / 60000)}m ${Math.round((duration % 60000) / 1000)}s`
          : `${Math.round(duration / 1000)}s`;

      logger.debug(
        `Sending push notification: type=${notificationType}, title="${title}", body="${body} (${durationStr})"`
      );

      pushNotificationService
        .sendNotification({
          type: notificationType,
          title,
          body: `${body} (${durationStr})`,
          icon: '/apple-touch-icon.png',
          badge: '/favicon-32.png',
          tag: `vibeterm-command-${sessionId}-${Date.now()}`,
          requireInteraction: false,
          data: {
            type: notificationType,
            sessionId,
            command,
            exitCode,
            duration,
            timestamp,
          },
          actions: [
            { action: 'view-session', title: 'View Session' },
            { action: 'dismiss', title: 'Dismiss' },
          ],
        })
        .catch((error) => {
          logger.error('Failed to send command finished notification:', error);
        });
    });
    logger.debug('Connected command finished notifications to PTY manager');
  }

  // Apply auth middleware to all API routes
  app.use('/api', authMiddleware);
  logger.debug('Applied authentication middleware to /api routes');

  // Mount authentication routes
  app.use(
    '/api/auth',
    createAuthRoutes({
      authService,
      enableSSHKeys: config.enableSSHKeys,
      disallowUserPassword: config.disallowUserPassword,
      noAuth: config.noAuth,
    })
  );
  logger.debug('Mounted authentication routes');

  // Mount routes
  app.use(
    '/api',
    createSessionRoutes({
      ptyManager,
      terminalManager,
    })
  );
  logger.debug('Mounted session routes');

  // Mount filesystem routes
  app.use('/api', createFilesystemRoutes());
  logger.debug('Mounted filesystem routes');

  // Mount log routes
  app.use('/api', createLogRoutes());
  logger.debug('Mounted log routes');

  // Mount file routes
  app.use('/api', createFileRoutes());
  logger.debug('Mounted file routes');

  // Mount repository routes
  app.use('/api', createRepositoryRoutes());
  logger.debug('Mounted repository routes');

  // Mount config routes
  app.use(
    '/api',
    createConfigRoutes({
      configService,
    })
  );
  logger.debug('Mounted config routes');

  // Mount Git routes
  app.use('/api', createGitRoutes());
  logger.debug('Mounted Git routes');

  // Mount worktree routes
  app.use('/api', createWorktreeRoutes());
  logger.debug('Mounted worktree routes');

  // Mount tmux routes
  app.use('/api/tmux', createTmuxRoutes({ ptyManager }));
  logger.debug('Mounted tmux routes');

  // Mount multiplexer routes (unified tmux/zellij interface)
  app.use('/api/multiplexer', createMultiplexerRoutes({ ptyManager }));
  logger.debug('Mounted multiplexer routes');

  // Mount push notification routes - always mount even if VAPID is not initialized
  // This ensures proper error responses instead of 404s
  app.use(
    '/api',
    createPushRoutes({
      vapidManager: vapidManager || new VapidManager(), // Pass a dummy instance if null
      pushNotificationService,
      sessionMonitor,
    })
  );
  logger.debug('Mounted push notification routes');

  // Handle WebSocket upgrade with authentication
  server.on('upgrade', async (request, socket, head) => {
    // Parse the URL to extract path and query parameters
    const parsedUrl = new URL(request.url || '', `http://${request.headers.host || 'localhost'}`);

    // Handle WebSocket paths
    if (parsedUrl.pathname !== '/ws') {
      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
      return;
    }

    // Check authentication and capture user info
    const authResult = await new Promise<{
      authenticated: boolean;
      userId?: string;
      authMethod?: string;
    }>((resolve) => {
      // Track if promise has been resolved to prevent multiple resolutions
      let resolved = false;
      const safeResolve = (value: {
        authenticated: boolean;
        userId?: string;
        authMethod?: string;
      }) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      // Convert URLSearchParams to plain object for query parameters
      const query: Record<string, string> = {};
      parsedUrl.searchParams.forEach((value, key) => {
        query[key] = value;
      });

      // Create a mock Express request/response to use auth middleware
      const req = {
        ...request,
        url: request.url,
        path: parsedUrl.pathname,
        userId: undefined as string | undefined,
        authMethod: undefined as string | undefined,
        query, // Include parsed query parameters for token-based auth
        headers: request.headers,
        ip: (request.socket as unknown as { remoteAddress?: string }).remoteAddress || '',
        socket: request.socket,
        hostname: request.headers.host?.split(':')[0] || 'localhost',
        // Add minimal Express-like methods needed by auth middleware
        get: (header: string) => request.headers[header.toLowerCase()],
        header: (header: string) => request.headers[header.toLowerCase()],
        accepts: () => false,
        acceptsCharsets: () => false,
        acceptsEncodings: () => false,
        acceptsLanguages: () => false,
      } as unknown as AuthenticatedRequest;

      let authFailed = false;
      const res = {
        status: (code: number) => {
          // Only consider it a failure if it's an error status code
          if (code >= 400) {
            authFailed = true;
            safeResolve({ authenticated: false });
          }
          return {
            json: () => {},
            send: () => {},
            end: () => {},
          };
        },
        setHeader: () => {},
        send: () => {},
        json: () => {},
        end: () => {},
      } as unknown as ExpressResponse;

      const next = (error?: unknown) => {
        // Authentication succeeds if next() is called without error and no auth failure was recorded
        const authenticated = !error && !authFailed;
        safeResolve({
          authenticated,
          userId: req.userId,
          authMethod: req.authMethod,
        });
      };

      // Add a timeout to prevent indefinite hanging
      const timeoutId = setTimeout(() => {
        logger.error('WebSocket auth timeout - auth middleware did not complete in time');
        safeResolve({ authenticated: false });
      }, 5000); // 5 second timeout

      // Call authMiddleware and handle potential async errors
      Promise.resolve(authMiddleware(req, res, next))
        .then(() => {
          clearTimeout(timeoutId);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          logger.error('Auth middleware error:', error);
          safeResolve({ authenticated: false });
        });
    });

    if (!authResult.authenticated) {
      logger.debug('WebSocket connection rejected: unauthorized');
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // Handle the upgrade
    wss.handleUpgrade(request, socket, head, (ws) => {
      // Add path and auth information to the request for routing
      const wsRequest = request as WebSocketRequest;
      wsRequest.pathname = parsedUrl.pathname;
      wsRequest.searchParams = parsedUrl.searchParams;
      wsRequest.userId = authResult.userId;
      wsRequest.authMethod = authResult.authMethod;
      wss.emit('connection', ws, wsRequest);
    });
  });

  // WebSocket connection router
  wss.on('connection', (ws, req) => {
    const wsReq = req as WebSocketRequest;
    const pathname = wsReq.pathname;

    logger.log(`WebSocket connection to path: ${pathname}`);
    logger.log(`User ID: ${wsReq.userId || 'unknown'}`);
    logger.log(`Auth method: ${wsReq.authMethod || 'unknown'}`);

    if (pathname === '/ws') {
      logger.log('Handling v3 WebSocket connection');
      wsV3Hub.handleClientConnection(ws, wsReq);
    } else {
      logger.error(`Unknown WebSocket path: ${pathname}`);
      ws.close();
    }
  });

  // Serve index.html for client-side routes (but not API routes)
  app.get('/', (_req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  // Handle /session/:id routes by serving the same index.html
  app.get('/session/:id', (_req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });

  // 404 handler for all other routes
  app.use((req, res) => {
    if (req.path.startsWith('/api/')) {
      res.status(404).json({ error: 'API endpoint not found' });
    } else {
      res.status(404).sendFile(path.join(publicPath, '404.html'), (err) => {
        if (err) {
          res.status(404).send('404 - Page not found');
        }
      });
    }
  });

  // Start server function
  let controlDirWatcher: ControlDirWatcher | null = null;

  const startServer = () => {
    const requestedPort = config.port !== null ? config.port : Number(process.env.PORT) || 4020;

    logger.log(`Starting server on port ${requestedPort}`);

    // Remove all existing error listeners first to prevent duplicates
    server.removeAllListeners('error');

    // Add error handler for port already in use
    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${requestedPort} is already in use`);

        // Provide more helpful error message in development mode
        const isDevelopment = !process.env.BUILD_DATE || process.env.NODE_ENV === 'development';
        if (isDevelopment) {
          logger.error(chalk.yellow('\nDevelopment mode options:'));
          logger.error(
            `  1. Run server on different port: ${chalk.cyan('pnpm run dev:server --port 4021')}`
          );
          logger.error(`  2. Use environment variable: ${chalk.cyan('PORT=4021 pnpm run dev')}`);
          logger.error(
            '  3. Stop the existing server (check for vibeterm processes)'
          );
        } else {
          logger.error(
            'Please use a different port with --port <number> or stop the existing server'
          );
        }
        process.exit(9); // Exit with code 9 to indicate port conflict
      } else {
        logger.error('Server error:', error);
        process.exit(1);
      }
    });

    // Regular TCP mode
    const bindAddress = config.bind || '0.0.0.0';
    server.listen(requestedPort, bindAddress, () => {
      const address = server.address();
      const actualPort =
        typeof address === 'string' ? requestedPort : address?.port || requestedPort;
      const displayAddress = bindAddress === '0.0.0.0' ? 'localhost' : bindAddress;
      logger.log(
        chalk.green(`VibeTerm Server running on http://${displayAddress}:${actualPort}`)
      );

      if (config.noAuth) {
        logger.warn(chalk.yellow('Authentication: DISABLED (--no-auth)'));
        logger.warn('Anyone can access this server without authentication');
      } else if (config.disallowUserPassword) {
        logger.log(chalk.green('Authentication: SSH KEYS ONLY (--disallow-user-password)'));
        logger.log(chalk.gray('Password authentication is disabled'));
      } else {
        logger.log(chalk.green('Authentication: SYSTEM USER PASSWORD'));
        if (config.enableSSHKeys) {
          logger.log(chalk.green('SSH Key Authentication: ENABLED'));
        } else {
          logger.log(
            chalk.gray('SSH Key Authentication: DISABLED (use --enable-ssh-keys to enable)')
          );
        }
      }

      // Log local bypass status
      if (config.allowLocalBypass) {
        logger.log(chalk.yellow('Local Bypass: ENABLED'));
        if (config.localAuthToken) {
          logger.log(chalk.gray('Local connections require auth token'));
        } else {
          logger.log(chalk.gray('Local connections bypass authentication without token'));
        }
      }

      // Send message to parent process if running as child (for testing)
      // Skip in vitest environment to avoid channel conflicts
      if (process.send && !process.env.VITEST) {
        process.send({ type: 'server-started', port: actualPort });
      }

      // Start control directory watcher
      controlDirWatcher = new ControlDirWatcher({
        controlDir: CONTROL_DIR,
        remoteRegistry: null,
        isHQMode: false,
        hqClient: null,
        ptyManager,
        pushNotificationService: pushNotificationService || undefined,
      });
      controlDirWatcher.start();
      logger.debug('Started control directory watcher');
    });
  };

  return {
    app,
    server,
    wss,
    startServer,
    config,
    configService,
    ptyManager,
    terminalManager,
    controlDirWatcher,
    pushNotificationService,
  };
}

// Track if server has been started
let serverStarted = false;

// Export a function to start the server
export async function startVibeTermServer() {
  // Initialize logger if not already initialized (preserves debug mode from CLI)
  initLogger();

  // Log diagnostic info if debug mode
  if (process.env.DEBUG === 'true' || process.argv.includes('--debug')) {
  }

  // Prevent multiple server instances
  if (serverStarted) {
    logger.error('Server already started, preventing duplicate instance');
    logger.error('This should not happen - duplicate server startup detected');
    process.exit(1);
  }
  serverStarted = true;

  logger.debug('Creating VibeTerm application instance');
  // Create and configure the app
  const appInstance = await createApp();
  const {
    startServer,
    server,
    terminalManager,
    config,
    configService,
  } = appInstance;

  // Update debug mode based on config or environment variable
  if (config.debug || process.env.DEBUG === 'true') {
    setDebugMode(true);
    logger.log(chalk.gray('Debug logging enabled'));
  }

  startServer();

  // Cleanup old terminals every 5 minutes
  const _terminalCleanupInterval = setInterval(
    () => {
      terminalManager.cleanup(5 * 60 * 1000); // 5 minutes
    },
    5 * 60 * 1000
  );
  logger.debug('Started terminal cleanup interval (5 minutes)');

  // Cleanup inactive push subscriptions every 30 minutes
  let _subscriptionCleanupInterval: NodeJS.Timeout | null = null;
  if (appInstance.pushNotificationService) {
    _subscriptionCleanupInterval = setInterval(
      () => {
        appInstance.pushNotificationService?.cleanupInactiveSubscriptions().catch((error) => {
          logger.error('Failed to cleanup inactive subscriptions:', error);
        });
      },
      30 * 60 * 1000 // 30 minutes
    );
    logger.debug('Started subscription cleanup interval (30 minutes)');
  }

  // Graceful shutdown
  let localShuttingDown = false;

  const shutdown = async () => {
    if (localShuttingDown) {
      logger.warn('Force exit...');
      process.exit(1);
    }

    localShuttingDown = true;
    setShuttingDown(true);
    logger.log(chalk.yellow('\nShutting down...'));

    try {
      // Clear cleanup intervals
      clearInterval(_terminalCleanupInterval);
      if (_subscriptionCleanupInterval) {
        clearInterval(_subscriptionCleanupInterval);
      }
      logger.debug('Cleared cleanup intervals');

      // Stop configuration service watcher
      configService.stopWatching();
      logger.debug('Stopped configuration service watcher');

      // Stop control directory watcher
      if (appInstance.controlDirWatcher) {
        appInstance.controlDirWatcher.stop();
        logger.debug('Stopped control directory watcher');
      }

      server.close(() => {
        logger.log(chalk.green('Server closed successfully'));
        closeLogger();
        process.exit(0);
      });

      // Force exit after 5 seconds if graceful shutdown fails
      setTimeout(() => {
        logger.warn('Graceful shutdown timeout, forcing exit...');
        closeLogger();
        process.exit(1);
      }, 5000);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      closeLogger();
      process.exit(1);
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  logger.debug('Registered signal handlers for graceful shutdown');
}

// Export for testing
export * from './version.js';
