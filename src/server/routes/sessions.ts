import chalk from 'chalk';
import { Router } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { cellsToText } from '../../shared/terminal-text-formatter.js';
import type { ServerStatus } from '../../shared/types.js';
import { PtyError, type PtyManager } from '../pty/index.js';
import type { TerminalManager } from '../services/terminal-manager.js';
import { detectGitInfo } from '../utils/git-info.js';
import { getDetailedGitStatus } from '../utils/git-status.js';
import { createLogger } from '../utils/logger.js';
import { resolveAbsolutePath } from '../utils/path-utils.js';
import { generateSessionName } from '../utils/session-naming.js';

const logger = createLogger('sessions');

interface SessionRoutesConfig {
  ptyManager: PtyManager;
  terminalManager: TerminalManager;
}

// Helper function to resolve path with default fallback
function resolvePath(inputPath: string, defaultPath: string): string {
  if (!inputPath || inputPath.trim() === '') {
    return defaultPath;
  }

  // Use our utility function to handle tilde expansion and absolute path resolution
  const expanded = resolveAbsolutePath(inputPath);

  // If the input was relative (not starting with / or ~), resolve it relative to defaultPath
  if (!inputPath.startsWith('/') && !inputPath.startsWith('~')) {
    return path.join(defaultPath, inputPath);
  }

  return expanded;
}

export function createSessionRoutes(config: SessionRoutesConfig): Router {
  const router = Router();
  const { ptyManager, terminalManager } = config;

  // Server status endpoint
  router.get('/server/status', async (_req, res) => {
    logger.debug('[GET /server/status] Getting server status');
    try {
      const status: ServerStatus = {
        version: process.env.VERSION || 'unknown',
      };
      res.json(status);
    } catch (error) {
      logger.error('Failed to get server status:', error);
      res.status(500).json({ error: 'Failed to get server status' });
    }
  });

  // List all sessions
  router.get('/sessions', async (_req, res) => {
    logger.debug('[GET /sessions] Listing all sessions');
    try {
      let allSessions = [];

      // Get local sessions
      const localSessions = ptyManager.listSessions();
      logger.debug(`[GET /sessions] Found ${localSessions.length} local sessions`);

      // Log session names for debugging
      // localSessions.forEach((session) => {
      //   logger.debug(
      //     `[GET /sessions] Session ${session.id}: name="${session.name || 'null'}", workingDir="${session.workingDir}"`
      //   );
      // });

      // Add source info to local sessions and detect Git info if missing
      const localSessionsWithSource = await Promise.all(
        localSessions.map(async (session) => {
          // If session doesn't have Git info, try to detect it
          if (!session.gitRepoPath && session.workingDir) {
            try {
              const gitInfo = await detectGitInfo(session.workingDir);
              // logger.debug(
              //   `[GET /sessions] Detected Git info for session ${session.id}: repo=${gitInfo.gitRepoPath}, branch=${gitInfo.gitBranch}`
              // );
              return {
                ...session,
                ...gitInfo,
                source: 'local' as const,
              };
            } catch (error) {
              // If Git detection fails, just return session as-is
              logger.debug(
                `[GET /sessions] Could not detect Git info for session ${session.id}: ${error}`
              );
            }
          }

          return {
            ...session,
            source: 'local' as const,
          };
        })
      );

      allSessions = [...localSessionsWithSource];

      logger.debug(`returning ${allSessions.length} total sessions`);
      res.json(allSessions);
    } catch (error) {
      logger.error('error listing sessions:', error);
      res.status(500).json({ error: 'Failed to list sessions' });
    }
  });

  // Create new session
  router.post('/sessions', async (req, res) => {
    const { command, workingDir, name, cols, rows, titleMode } = req.body;
    logger.debug(
      `creating new session: command=${JSON.stringify(command)}, cols=${cols}, rows=${rows}`
    );

    if (!command || !Array.isArray(command) || command.length === 0) {
      logger.warn('session creation failed: invalid command array');
      return res.status(400).json({ error: 'Command array is required' });
    }

    try {
      // Create local session
      let cwd = resolvePath(workingDir, process.cwd());

      // Check if the working directory exists, fall back to process.cwd() if not
      if (!fs.existsSync(cwd)) {
        logger.warn(
          `Working directory '${cwd}' does not exist, using current directory as fallback`
        );
        cwd = process.cwd();
      }

      const sessionName = name || generateSessionName(command, cwd);

      // Detect Git information
      const gitInfo = await detectGitInfo(cwd);

      logger.log(
        chalk.blue(
          `creating session: ${command.join(' ')} in ${cwd}`
        )
      );

      const result = await ptyManager.createSession(command, {
        name: sessionName,
        workingDir: cwd,
        cols,
        rows,
        titleMode,
        gitRepoPath: gitInfo.gitRepoPath,
        gitBranch: gitInfo.gitBranch,
        gitAheadCount: gitInfo.gitAheadCount,
        gitBehindCount: gitInfo.gitBehindCount,
        gitHasChanges: gitInfo.gitHasChanges,
        gitIsWorktree: gitInfo.gitIsWorktree,
        gitMainRepoPath: gitInfo.gitMainRepoPath,
      });

      const { sessionId, sessionInfo } = result;
      logger.log(chalk.green(`session ${sessionId} created (PID: ${sessionInfo.pid})`));

      // Stream watcher is set up when clients connect to the stream endpoint

      res.json({ sessionId, createdAt: new Date().toISOString() });
    } catch (error) {
      logger.error('error creating session:', error);
      if (error instanceof PtyError) {
        res.status(500).json({ error: 'Failed to create session', details: error.message });
      } else {
        res.status(500).json({ error: 'Failed to create session' });
      }
    }
  });

  // Get git status for a specific session
  router.get('/sessions/:sessionId/git-status', async (req, res) => {
    const sessionId = req.params.sessionId;

    try {
      const session = ptyManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Get detailed git status for the session's working directory
      const gitStatus = await getDetailedGitStatus(session.workingDir);

      res.json(gitStatus);
    } catch (error) {
      logger.error(`error getting git status for session ${sessionId}:`, error);
      res.status(500).json({ error: 'Failed to get git status' });
    }
  });

  // Get single session info
  router.get('/sessions/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    logger.debug(`getting info for session ${sessionId}`);

    try {
      const session = ptyManager.getSession(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // If session doesn't have Git info, try to detect it
      if (!session.gitRepoPath && session.workingDir) {
        try {
          const gitInfo = await detectGitInfo(session.workingDir);
          // logger.debug(
          //   `[GET /sessions/:id] Detected Git info for session ${session.id}: repo=${gitInfo.gitRepoPath}, branch=${gitInfo.gitBranch}`
          // );
          res.json({ ...session, ...gitInfo });
          return;
        } catch (error) {
          // If Git detection fails, just return session as-is
          logger.debug(
            `[GET /sessions/:id] Could not detect Git info for session ${session.id}: ${error}`
          );
        }
      }

      res.json(session);
    } catch (error) {
      logger.error('error getting session info:', error);
      res.status(500).json({ error: 'Failed to get session info' });
    }
  });

  // Kill session (just kill the process)
  router.delete('/sessions/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    logger.debug(`killing session ${sessionId}`);

    try {
      const session = ptyManager.getSession(sessionId);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // If session is already exited, clean it up instead of trying to kill it
      if (session.status === 'exited') {
        ptyManager.cleanupSession(sessionId);
        logger.log(chalk.yellow(`local session ${sessionId} cleaned up`));
        res.json({ success: true, message: 'Session cleaned up' });
      } else {
        // Check if this is a tmux attachment before killing
        const isTmuxAttachment =
          session.name?.startsWith('tmux:') || session.command?.includes('tmux attach');

        await ptyManager.killSession(sessionId, 'SIGTERM');

        if (isTmuxAttachment) {
          logger.log(chalk.yellow(`local session ${sessionId} detached from tmux`));
          res.json({ success: true, message: 'Detached from tmux session' });
        } else {
          logger.log(chalk.yellow(`local session ${sessionId} killed`));
          res.json({ success: true, message: 'Session killed' });
        }
      }
    } catch (error) {
      logger.error('error killing session:', error);
      if (error instanceof PtyError) {
        res.status(500).json({ error: 'Failed to kill session', details: error.message });
      } else {
        res.status(500).json({ error: 'Failed to kill session' });
      }
    }
  });

  // Cleanup session files
  router.delete('/sessions/:sessionId/cleanup', async (req, res) => {
    const sessionId = req.params.sessionId;
    logger.debug(`cleaning up session ${sessionId} files`);

    try {
      ptyManager.cleanupSession(sessionId);
      logger.log(chalk.yellow(`local session ${sessionId} cleaned up`));

      res.json({ success: true, message: 'Session cleaned up' });
    } catch (error) {
      logger.error('error cleaning up session:', error);
      if (error instanceof PtyError) {
        res.status(500).json({ error: 'Failed to cleanup session', details: error.message });
      } else {
        res.status(500).json({ error: 'Failed to cleanup session' });
      }
    }
  });

  // Cleanup all exited sessions
  router.post('/cleanup-exited', async (_req, res) => {
    logger.log(chalk.blue('cleaning up all exited sessions'));
    try {
      const cleanedSessions = ptyManager.cleanupExitedSessions();
      logger.log(chalk.green(`cleaned up ${cleanedSessions.length} exited sessions`));

      res.json({
        success: true,
        message: `${cleanedSessions.length} exited sessions cleaned up`,
        cleanedSessions: cleanedSessions.length,
      });
    } catch (error) {
      logger.error('error cleaning up exited sessions:', error);
      if (error instanceof PtyError) {
        res
          .status(500)
          .json({ error: 'Failed to cleanup exited sessions', details: error.message });
      } else {
        res.status(500).json({ error: 'Failed to cleanup exited sessions' });
      }
    }
  });

  // Get session plain text
  router.get('/sessions/:sessionId/text', async (req, res) => {
    const sessionId = req.params.sessionId;
    const includeStyles = req.query.styles !== undefined;
    logger.debug(`getting plain text for session ${sessionId}, styles=${includeStyles}`);

    try {
      const session = ptyManager.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      // Get terminal buffer snapshot
      const snapshot = await terminalManager.getBufferSnapshot(sessionId);

      // Use shared formatter to convert cells to text
      const plainText = cellsToText(snapshot.cells, includeStyles);

      // Send as plain text
      res.setHeader('Content-Type', 'text/plain');
      res.send(plainText);
    } catch (error) {
      logger.error('error getting plain text:', error);
      res.status(500).json({ error: 'Failed to get terminal text' });
    }
  });

  // Send input to session
  router.post('/sessions/:sessionId/input', async (req, res) => {
    const sessionId = req.params.sessionId;
    const { text, key } = req.body;

    // Validate that only one of text or key is provided
    if ((text === undefined && key === undefined) || (text !== undefined && key !== undefined)) {
      logger.warn(
        `invalid input request for session ${sessionId}: both or neither text/key provided`
      );
      return res.status(400).json({ error: 'Either text or key must be provided, but not both' });
    }

    if (text !== undefined && typeof text !== 'string') {
      logger.warn(`invalid input request for session ${sessionId}: text is not a string`);
      return res.status(400).json({ error: 'Text must be a string' });
    }

    if (key !== undefined && typeof key !== 'string') {
      logger.warn(`invalid input request for session ${sessionId}: key is not a string`);
      return res.status(400).json({ error: 'Key must be a string' });
    }

    try {
      const session = ptyManager.getSession(sessionId);
      if (!session) {
        logger.error(`session ${sessionId} not found for input`);
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.status !== 'running') {
        logger.error(`session ${sessionId} is not running (status: ${session.status})`);
        return res.status(400).json({ error: 'Session is not running' });
      }

      const inputData = text !== undefined ? { text } : { key };
      logger.debug(`sending input to session ${sessionId}: ${JSON.stringify(inputData)}`);

      ptyManager.sendInput(sessionId, inputData);
      res.json({ success: true });
    } catch (error) {
      logger.error('error sending input:', error);
      if (error instanceof PtyError) {
        res.status(500).json({ error: 'Failed to send input', details: error.message });
      } else {
        res.status(500).json({ error: 'Failed to send input' });
      }
    }
  });

  // Resize session
  router.post('/sessions/:sessionId/resize', async (req, res) => {
    const sessionId = req.params.sessionId;
    const { cols, rows } = req.body;

    if (typeof cols !== 'number' || typeof rows !== 'number') {
      logger.warn(`invalid resize request for session ${sessionId}: cols/rows not numbers`);
      return res.status(400).json({ error: 'Cols and rows must be numbers' });
    }

    if (cols < 1 || rows < 1 || cols > 1000 || rows > 1000) {
      logger.warn(
        `invalid resize request for session ${sessionId}: cols=${cols}, rows=${rows} out of range`
      );
      return res.status(400).json({ error: 'Cols and rows must be between 1 and 1000' });
    }

    // Log resize requests at debug level
    logger.debug(`Resizing session ${sessionId} to ${cols}x${rows}`);

    try {
      const session = ptyManager.getSession(sessionId);
      if (!session) {
        logger.warn(`session ${sessionId} not found for resize`);
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.status !== 'running') {
        logger.warn(`session ${sessionId} is not running (status: ${session.status})`);
        return res.status(400).json({ error: 'Session is not running' });
      }

      // Resize the session
      ptyManager.resizeSession(sessionId, cols, rows);
      logger.log(chalk.green(`session ${sessionId} resized to ${cols}x${rows}`));

      res.json({ success: true, cols, rows });
    } catch (error) {
      logger.error('error resizing session via PTY service:', error);
      if (error instanceof PtyError) {
        res.status(500).json({ error: 'Failed to resize session', details: error.message });
      } else {
        res.status(500).json({ error: 'Failed to resize session' });
      }
    }
  });

  // Update session name
  router.patch('/sessions/:sessionId', async (req, res) => {
    const sessionId = req.params.sessionId;
    logger.log(chalk.yellow(`[PATCH] Received rename request for session ${sessionId}`));
    logger.debug(`[PATCH] Request body:`, req.body);
    logger.debug(`[PATCH] Request headers:`, req.headers);

    const { name } = req.body;

    if (typeof name !== 'string' || name.trim() === '') {
      logger.warn(`[PATCH] Invalid name provided: ${JSON.stringify(name)}`);
      return res.status(400).json({ error: 'Name must be a non-empty string' });
    }

    logger.log(chalk.blue(`[PATCH] Updating session ${sessionId} name to: ${name}`));

    try {
      logger.debug(`[PATCH] Handling local session update`);

      const session = ptyManager.getSession(sessionId);
      if (!session) {
        logger.warn(`[PATCH] Session ${sessionId} not found for name update`);
        return res.status(404).json({ error: 'Session not found' });
      }

      logger.debug(`[PATCH] Found session: ${JSON.stringify(session)}`);

      // Update the session name
      logger.debug(`[PATCH] Calling ptyManager.updateSessionName(${sessionId}, ${name})`);
      const uniqueName = ptyManager.updateSessionName(sessionId, name);
      logger.log(chalk.green(`[PATCH] Session ${sessionId} name updated to: ${uniqueName}`));

      res.json({ success: true, name: uniqueName });
    } catch (error) {
      logger.error('error updating session name:', error);
      if (error instanceof PtyError) {
        res.status(500).json({ error: 'Failed to update session name', details: error.message });
      } else {
        res.status(500).json({ error: 'Failed to update session name' });
      }
    }
  });

  // Reset terminal size (for external terminals)
  router.post('/sessions/:sessionId/reset-size', async (req, res) => {
    const { sessionId } = req.params;

    try {
      logger.log(chalk.cyan(`resetting terminal size for session ${sessionId}`));

      // Check if session exists
      const session = ptyManager.getSession(sessionId);
      if (!session) {
        logger.error(`session ${sessionId} not found for reset-size`);
        return res.status(404).json({ error: 'Session not found' });
      }

      // Check if session is running
      if (session.status !== 'running') {
        logger.error(`session ${sessionId} is not running (status: ${session.status})`);
        return res.status(400).json({ error: 'Session is not running' });
      }

      // Reset the session size
      ptyManager.resetSessionSize(sessionId);
      logger.log(chalk.green(`session ${sessionId} size reset to terminal size`));

      res.json({ success: true });
    } catch (error) {
      logger.error('error resetting session size via PTY service:', error);
      if (error instanceof PtyError) {
        res.status(500).json({ error: 'Failed to reset session size', details: error.message });
      } else {
        res.status(500).json({ error: 'Failed to reset session size' });
      }
    }
  });

  return router;
}

