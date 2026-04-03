import { FlowtestExecutionEvent } from './types';

export class EventStore {
  private readonly events: FlowtestExecutionEvent[] = [];
  private readonly subscribers = new Set<(events: FlowtestExecutionEvent[]) => void>();

  add(event: FlowtestExecutionEvent): void {
    this.events.unshift(event);
    if (this.events.length > 200) {
      this.events.pop();
    }
    this.emit();
  }

  all(): FlowtestExecutionEvent[] {
    return [...this.events];
  }

  subscribe(handler: (events: FlowtestExecutionEvent[]) => void): () => void {
    this.subscribers.add(handler);
    handler(this.all());
    return () => this.subscribers.delete(handler);
  }

  private emit(): void {
    const snapshot = this.all();
    this.subscribers.forEach((handler) => handler(snapshot));
  }
}
