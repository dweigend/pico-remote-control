/**
 * Purpose: Bridge Bun's synchronous fake-timer controls with asynchronous service callbacks.
 * Context: ADB recovery tests advance timers whose callbacks await injected command promises.
 * Responsibilities: Advance Bun fake timers and then drain the resulting microtask work.
 * Boundaries: Production scheduling remains owned by the tested services.
 */

import { vi } from "bun:test";

export async function advanceTimersByTime(milliseconds: number): Promise<void> {
  vi.advanceTimersByTime(milliseconds);
  await drainMicrotasks();
}

export async function runAllTimers(): Promise<void> {
  vi.runAllTimers();
  await drainMicrotasks();
}

async function drainMicrotasks(): Promise<void> {
  for (let pending = 0; pending < 8; pending += 1) await Promise.resolve();
}
