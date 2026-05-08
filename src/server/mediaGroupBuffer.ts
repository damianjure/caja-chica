export interface MediaGroupEntry<T> {
  items: T[];
  timerId: ReturnType<typeof setTimeout>;
}

export interface MediaGroupBufferOptions {
  debounceMs?: number; // default: 1500
}

export class MediaGroupBuffer<T> {
  private buffer: Map<string, MediaGroupEntry<T>>;
  private debounceMs: number;

  constructor(options?: MediaGroupBufferOptions) {
    this.buffer = new Map();
    this.debounceMs = options?.debounceMs ?? 1500;
  }

  add(groupId: string, item: T, onFlush: (items: T[]) => void): void {
    const existing = this.buffer.get(groupId);

    if (existing) {
      // Clear existing timer and push item
      clearTimeout(existing.timerId);
      existing.items.push(item);
    } else {
      // Create new entry
      this.buffer.set(groupId, {
        items: [item],
        timerId: undefined as any, // placeholder, will be set below
      });
    }

    // Set new timer (for both new and existing entries)
    const entry = this.buffer.get(groupId)!;
    entry.timerId = setTimeout(() => {
      this.flushInternal(groupId, onFlush);
    }, this.debounceMs);
  }

  flush(groupId: string, onFlush: (items: T[]) => void): void {
    this.flushInternal(groupId, onFlush);
  }

  private flushInternal(groupId: string, onFlush: (items: T[]) => void): void {
    const entry = this.buffer.get(groupId);
    if (!entry) {
      return;
    }

    clearTimeout(entry.timerId);
    const items = entry.items;
    this.buffer.delete(groupId);
    onFlush(items);
  }

  size(): number {
    return this.buffer.size;
  }

  /** Cancel all pending timers and clear the buffer. Call on graceful shutdown. */
  destroy(): void {
    for (const entry of this.buffer.values()) {
      clearTimeout(entry.timerId);
    }
    this.buffer.clear();
  }
}
