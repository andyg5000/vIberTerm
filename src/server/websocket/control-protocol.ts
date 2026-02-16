/**
 * Control Protocol - Creates control events for Mac app communication
 */

export interface ControlEvent {
  type: string;
  action: string;
  data: unknown;
  timestamp: number;
}

export function createControlEvent(type: string, action: string, data: unknown): ControlEvent {
  return {
    type,
    action,
    data,
    timestamp: Date.now(),
  };
}
