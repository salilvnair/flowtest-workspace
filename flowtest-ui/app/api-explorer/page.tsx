"use client";

export default function ApiExplorerPage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 12,
        background:
          "radial-gradient(820px 420px at -10% -20%, color-mix(in srgb, #60d394 16%, transparent), transparent 66%), radial-gradient(980px 520px at 120% 120%, color-mix(in srgb, #3794ff 12%, transparent), transparent 68%), var(--vscode-editor-background, #1e1e1e)"
      }}
    >
      <div
        style={{
          border: "1px solid color-mix(in srgb, var(--vscode-panel-border, #3a3f4b) 85%, transparent)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 12px 28px rgba(0,0,0,0.22)",
          background: "color-mix(in srgb, var(--vscode-editorWidget-background, #1f242d) 92%, transparent)"
        }}
      >
        <iframe
          title="API Explorer"
          src="/api/wiremock/reference"
          style={{ width: "100%", height: "calc(100vh - 24px)", border: "none", display: "block" }}
        />
      </div>
    </main>
  );
}

