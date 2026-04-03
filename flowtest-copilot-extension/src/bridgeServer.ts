import * as http from 'http';
import * as vscode from 'vscode';
import { executeAiTask } from './aiService';
import { EventStore } from './state';
import { AiTaskRequest, FlowtestExecutionEvent } from './types';

export class FlowtestBridgeServer {
  private server?: http.Server;

  constructor(private readonly events: EventStore) {}

  isRunning(): boolean {
    return Boolean(this.server?.listening);
  }

  address(): string {
    const cfg = vscode.workspace.getConfiguration('flowtest');
    const host = cfg.get<string>('bridgeHost', '127.0.0.1');
    const port = cfg.get<number>('bridgePort', 7171);
    return `http://${host}:${port}`;
  }

  async start(): Promise<void> {
    if (this.server?.listening) {
      return;
    }

    const cfg = vscode.workspace.getConfiguration('flowtest');
    const host = cfg.get<string>('bridgeHost', '127.0.0.1');
    const port = cfg.get<number>('bridgePort', 7171);

    this.server = http.createServer(async (req, res) => {
      try {
        if (!req.url || !req.method) {
          this.respond(res, 400, { error: 'Invalid request' });
          return;
        }

        if (req.method === 'GET' && req.url === '/flowtest/health') {
          this.respond(res, 200, { ok: true });
          return;
        }

        if (req.method === 'POST' && req.url === '/flowtest/ai/execute') {
          const body = await this.readJson<AiTaskRequest>(req);
          const content = await executeAiTask(body);
          this.respond(res, 200, {
            success: true,
            provider: vscode.workspace.getConfiguration('flowtest').get<string>('aiProvider', 'copilot'),
            content
          });
          return;
        }

        if (req.method === 'POST' && req.url === '/flowtest/events') {
          const body = await this.readJson<FlowtestExecutionEvent>(req);
          this.events.add({
            ...body,
            at: body.at ?? new Date().toISOString()
          });
          this.respond(res, 202, { accepted: true });
          return;
        }

        this.respond(res, 404, { error: 'Not found' });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.respond(res, 500, { error: message });
      }
    });

    await new Promise<void>((resolve, reject) => {
      this.server?.once('error', reject);
      this.server?.listen(port, host, () => resolve());
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      this.server?.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });

    this.server = undefined;
  }

  private respond(res: http.ServerResponse, code: number, body: unknown): void {
    const text = JSON.stringify(body);
    res.writeHead(code, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(text)
    });
    res.end(text);
  }

  private readJson<T>(req: http.IncomingMessage): Promise<T> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      req.on('end', () => {
        try {
          const raw = Buffer.concat(chunks).toString('utf8');
          resolve((raw ? JSON.parse(raw) : {}) as T);
        } catch (error) {
          reject(error);
        }
      });
      req.on('error', reject);
    });
  }
}
