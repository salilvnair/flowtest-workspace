import * as vscode from 'vscode';
import { AiTaskRequest } from './types';

export interface AiExecutionDetails {
  provider: 'openai' | 'copilot';
  model: string;
  taskType: string;
  calledAt: string;
  completedAt: string;
  durationMs: number;
  systemPrompt: string;
  userPrompt: string;
  requestPayload: Record<string, unknown>;
  responseText: string;
}

function getConfig() {
  const cfg = vscode.workspace.getConfiguration('flowtest');
  return {
    provider: String(cfg.get<string>('aiProvider', 'copilot')).toLowerCase(),
    openaiApiKey: String(cfg.get<string>('openaiApiKey', '')),
    openaiModel: String(cfg.get<string>('openaiModel', 'gpt-5.4-mini'))
  };
}

export async function executeAiTask(task: AiTaskRequest): Promise<string> {
  const details = await executeAiTaskDetailed(task);
  return details.responseText;
}

export async function executeAiTaskDetailed(task: AiTaskRequest): Promise<AiExecutionDetails> {
  const config = getConfig();
  if (config.provider === 'openai') {
    return executeOpenAi(task, config.openaiApiKey, config.openaiModel);
  }
  return executeCopilot(task);
}

function buildSystemPrompt(task: AiTaskRequest): string {
  return [
    'You are FlowTest AI Orchestrator.',
    `Task Type: ${task.taskType}`,
    'Output rules:',
    '- Prefer strict JSON when the task expects structured output.',
    '- Keep content deterministic and implementation-ready.',
    '- Do not add unrelated commentary.'
  ].join('\n');
}

async function executeOpenAi(task: AiTaskRequest, apiKey: string, model: string): Promise<AiExecutionDetails> {
  if (!apiKey) {
    throw new Error('OpenAI API key is empty. Configure flowtest.openaiApiKey in VS Code settings.');
  }
  const calledAt = new Date().toISOString();
  const startedMs = Date.now();
  const systemPrompt = buildSystemPrompt(task);
  const userPrompt = task.prompt;
  const requestPayload: Record<string, unknown> = {
    model,
    instructions: systemPrompt,
    input: userPrompt
  };

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestPayload)
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${body}`);
  }

  const json = (await response.json()) as { output_text?: string };
  const responseText = json.output_text ?? JSON.stringify(json);
  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startedMs;
  return {
    provider: 'openai',
    model,
    taskType: task.taskType,
    calledAt,
    completedAt,
    durationMs,
    systemPrompt,
    userPrompt,
    requestPayload,
    responseText
  };
}

async function executeCopilot(task: AiTaskRequest): Promise<AiExecutionDetails> {
  const vsc = vscode as unknown as {
    lm?: {
      selectChatModels?: (options?: Record<string, unknown>) => Promise<any[]>;
    };
    LanguageModelChatMessage?: {
      User: (text: string) => unknown;
    };
  };

  const selector = vsc.lm?.selectChatModels;
  const msgFactory = vsc.LanguageModelChatMessage;
  if (!selector || !msgFactory) {
    throw new Error('VS Code Language Model API is not available. Update VS Code and ensure Copilot access.');
  }

  const models = await selector({});
  if (!models.length) {
    throw new Error('No copilot/language model available in this VS Code session.');
  }

  const model = models[0];
  const calledAt = new Date().toISOString();
  const startedMs = Date.now();
  const systemPrompt = buildSystemPrompt(task);
  const userPrompt = task.prompt;
  const modelName = String(model?.id ?? model?.name ?? model?.family ?? 'copilot-default');
  const requestPayload: Record<string, unknown> = {
    model: modelName,
    transport: 'vscode.lm',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]
  };
  const prompt = [
    '[SYSTEM]',
    systemPrompt,
    '',
    '[USER]',
    userPrompt
  ].join('\n');

  const request = await model.sendRequest([msgFactory.User(prompt)], {}, new vscode.CancellationTokenSource().token);
  let output = '';
  for await (const part of request.text) {
    output += String(part);
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - startedMs;
  return {
    provider: 'copilot',
    model: modelName,
    taskType: task.taskType,
    calledAt,
    completedAt,
    durationMs,
    systemPrompt,
    userPrompt,
    requestPayload,
    responseText: output.trim()
  };
}
