/**
 * Control Unix Handler - Stub for Mac app Unix socket communication
 */

import type { ControlEvent } from './control-protocol.js';

class ControlUnixHandler {
  isMacAppConnected(): boolean {
    return false;
  }

  sendToMac(_event: ControlEvent): void {
    // No-op when Mac app is not available
  }
}

export const controlUnixHandler = new ControlUnixHandler();
