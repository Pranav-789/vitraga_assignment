import { WebSocketServer, WebSocket } from 'ws';

/**
 * WebSocket streaming service for real-time itinerary delivery and agent status updates.
 */
class WebSocketStreamer {
  constructor() {
    this.wss = null;
    this.subscribers = new Map(); // sessionId -> Set<WebSocket>
  }

  init(server) {
    if (this.wss) {
      return this.wss;
    }

    this.wss = new WebSocketServer({ server, path: '/ws/itinerary' });

    this.wss.on('connection', (ws, req) => {
      let currentSessionId = null;

      // Extract sessionId from URL query params if present: /ws/itinerary?sessionId=xyz
      try {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        const qSession = url.searchParams.get('sessionId');
        if (qSession) {
          currentSessionId = qSession;
          this.subscribe(currentSessionId, ws);
        }
      } catch (err) {
        // Ignored, client can send subscribe message
      }

      ws.on('message', (raw) => {
        try {
          const payload = JSON.parse(raw.toString());
          if (payload.type === 'subscribe' && payload.sessionId) {
            if (currentSessionId && currentSessionId !== payload.sessionId) {
              this.unsubscribe(currentSessionId, ws);
            }
            currentSessionId = payload.sessionId;
            this.subscribe(currentSessionId, ws);
            ws.send(JSON.stringify({
              event: 'subscribed',
              sessionId: currentSessionId,
              timestamp: Date.now()
            }));
          } else if (payload.type === 'ping') {
            ws.send(JSON.stringify({ event: 'pong', timestamp: Date.now() }));
          }
        } catch (e) {
          // Ignore invalid JSON payloads
        }
      });

      ws.on('close', () => {
        if (currentSessionId) {
          this.unsubscribe(currentSessionId, ws);
        }
      });

      ws.on('error', () => {
        if (currentSessionId) {
          this.unsubscribe(currentSessionId, ws);
        }
      });
    });

    return this.wss;
  }

  subscribe(sessionId, ws) {
    if (!this.subscribers.has(sessionId)) {
      this.subscribers.set(sessionId, new Set());
    }
    this.subscribers.get(sessionId).add(ws);
  }

  unsubscribe(sessionId, ws) {
    const clients = this.subscribers.get(sessionId);
    if (clients) {
      clients.delete(ws);
      if (clients.size === 0) {
        this.subscribers.delete(sessionId);
      }
    }
  }

  broadcast(sessionId, event, payload = {}) {
    const clients = this.subscribers.get(sessionId);
    if (!clients || clients.size === 0) return 0;

    const message = JSON.stringify({
      event,
      sessionId,
      timestamp: Date.now(),
      ...payload
    });

    let sentCount = 0;
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        sentCount++;
      }
    }
    return sentCount;
  }

  getSubscriberCount(sessionId) {
    return this.subscribers.get(sessionId)?.size || 0;
  }

  close() {
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.subscribers.clear();
  }
}

export const websocketStreamer = new WebSocketStreamer();
export default websocketStreamer;
