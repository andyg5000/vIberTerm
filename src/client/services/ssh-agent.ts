/**
 * Browser SSH Agent - Stub for SSH key management in browser
 */

export class BrowserSSHAgent {
  constructor() {}

  async getKeys(): Promise<string[]> {
    return [];
  }

  async addKey(_key: string): Promise<void> {}

  async removeKey(_key: string): Promise<void> {}
}
