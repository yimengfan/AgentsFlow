import type { AgentEvent, AgentEventType, EventSchemaVersion } from "@agentsflow/agent-contracts";

type EventListener = (event: AgentEvent) => void;

/**
 * EventBus — centralized event dispatch for the flow engine.
 *
 * All engine events flow through this bus. UI, persistence,
 * and monitoring layers subscribe here.
 *
 * Invariants:
 *   - Events are dispatched synchronously to all listeners
 *   - Listeners must not throw (errors are logged, not propagated)
 *   - Event order is guaranteed within a single emit call
 */
export class EventBus {
  private listeners: Map<AgentEventType | "*", Set<EventListener>> = new Map();
  private eventCounter = 0;

  /**
   * Subscribe to events of a specific type, or "*" for all events.
   * Returns an unsubscribe function.
   */
  on(eventType: AgentEventType | "*", listener: EventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  /**
   * Emit an event to all matching listeners.
   * Optional fields (nodeId, agentId, invocationId) are only included if defined.
   */
  emit(event: Partial<Omit<AgentEvent, "eventId" | "timestamp" | "schemaVersion">> & { eventType: AgentEventType; runId: string; payload: Record<string, unknown> }): AgentEvent {
    const fullEvent: AgentEvent = {
      eventId: `evt-${++this.eventCounter}`,
      eventType: event.eventType,
      runId: event.runId,
      timestamp: Date.now(),
      schemaVersion: "1.0" as EventSchemaVersion,
      payload: event.payload,
      ...((event.nodeId !== undefined) ? { nodeId: event.nodeId } : {}),
      ...((event.agentId !== undefined) ? { agentId: event.agentId } : {}),
      ...((event.invocationId !== undefined) ? { invocationId: event.invocationId } : {}),
      ...((event.metadata !== undefined) ? { metadata: event.metadata } : {}),
    };

    // Notify specific listeners
    const specific = this.listeners.get(event.eventType);
    if (specific) {
      for (const listener of specific) {
        try {
          listener(fullEvent);
        } catch {
          // Listener errors must not disrupt event dispatch
        }
      }
    }

    // Notify wildcard listeners
    const wildcard = this.listeners.get("*");
    if (wildcard) {
      for (const listener of wildcard) {
        try {
          listener(fullEvent);
        } catch {
          // Listener errors must not disrupt event dispatch
        }
      }
    }

    return fullEvent;
  }

  /**
   * Remove all listeners.
   */
  clear(): void {
    this.listeners.clear();
  }
}
