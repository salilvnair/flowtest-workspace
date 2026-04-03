import * as vscode from "vscode";
import { FlowtestBridgeServer } from "./bridgeServer";
import { chatRequestHandler } from "./flowtest-chat-handler";
import { EventStore } from "./state";

let bridgeServer: FlowtestBridgeServer | undefined;

export async function activate(context: vscode.ExtensionContext) {
  const events = new EventStore();
  bridgeServer = new FlowtestBridgeServer(events);

  try {
    await bridgeServer.start();
  } catch (e: any) {
    vscode.window.showWarningMessage(`FlowTest bridge did not auto-start: ${e?.message ?? String(e)}`);
  }

  const handler = chatRequestHandler({ extensionUri: context.extensionUri });
  const participant = vscode.chat.createChatParticipant("salilvnair.copilot.flowtest", handler);

  participant.iconPath = vscode.Uri.joinPath(context.extensionUri, "images", "flowtest_bot.svg");
  participant.followupProvider = {
    provideFollowups(result: vscode.ChatResult) {
      const meta = result.metadata as any;
      const followups = meta?.flowtest_followups;
      return Array.isArray(followups) ? followups : [];
    }
  };

  const startCmd = vscode.commands.registerCommand("flowtest.startBridge", async () => {
    await bridgeServer?.start();
    vscode.window.showInformationMessage(`FlowTest bridge started at ${bridgeServer?.address()}`);
  });

  const stopCmd = vscode.commands.registerCommand("flowtest.stopBridge", async () => {
    await bridgeServer?.stop();
    vscode.window.showInformationMessage("FlowTest bridge stopped");
  });

  const formsCmd = vscode.commands.registerCommand("flowtest.openControlCenter", async () => {
    await vscode.commands.executeCommand("workbench.action.chat.open", "@flowtest forms");
  });

  context.subscriptions.push(participant, startCmd, stopCmd, formsCmd, {
    dispose: () => {
      bridgeServer?.stop().catch(() => undefined);
    }
  });
}

export function deactivate() {
  if (bridgeServer) {
    return bridgeServer.stop();
  }
}
