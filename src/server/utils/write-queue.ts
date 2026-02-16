/**
 * Simple queue for serializing async write operations
 */
export class WriteQueue {
  private queue = Promise.resolve();

  enqueue(writeFn: () => Promise<void> | void): void {
    this.queue = this.queue
      .then(() => writeFn())
      .catch((error) => {
        // Log but don't break the queue
        console.error('WriteQueue error:', error);
      });
  }

  /**
   * Wait for all queued operations to complete
   */
  async drain(): Promise<void> {
    await this.queue;
  }
}
