"use client";

import { useEffect, useState } from "react";

function readLastResponse() {
  try {
    const raw = window.localStorage.getItem("flowtest:lastIntakeResponse");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function pretty(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      style={{
        width: 14,
        height: 14,
        stroke: "#a9c3e7",
        fill: "none",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        transform: `rotate(${open ? 0 : 180}deg)`,
        transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1)"
      }}
    >
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

function CollapsibleCard({
  title,
  defaultOpen = false,
  children,
  extra,
  copyText
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  extra?: React.ReactNode;
  copyText?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [copied, setCopied] = useState(false);
  return (
    <section
      style={{
        border: "1px solid color-mix(in srgb, var(--vscode-panel-border, #3a3f4b) 85%, transparent)",
        borderRadius: 12,
        background: "color-mix(in srgb, var(--vscode-editorWidget-background, #1f242d) 90%, transparent)",
        overflow: "hidden",
        boxShadow: "0 10px 22px rgba(0,0,0,0.22)"
      }}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          border: "none",
          background: "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "10px 12px",
          borderBottom: open ? "1px solid color-mix(in srgb, var(--vscode-panel-border, #3a3f4b) 80%, transparent)" : "none",
          color: "#b7c6df",
          fontWeight: 800,
          letterSpacing: 0.3,
          textTransform: "uppercase",
          fontSize: 11,
          cursor: "pointer"
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <Chevron open={open} />
          {title}
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          {copyText ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                void navigator.clipboard.writeText(copyText);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 900);
              }}
              style={{
                border: "1px solid color-mix(in srgb, var(--vscode-panel-border, #3a3f4b) 85%, transparent)",
                borderRadius: 999,
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: 800,
                color: copied ? "#a9efb9" : "#9fd1ff",
                background: copied ? "color-mix(in srgb, #89d185 16%, transparent)" : "transparent",
                cursor: "pointer",
                transition: "all 180ms ease"
              }}
              title="Copy"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          ) : null}
          {extra}
        </span>
      </button>
      <div
        style={{
          maxHeight: open ? 1200 : 0,
          opacity: open ? 1 : 0,
          overflow: "hidden",
          transition: "max-height 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 240ms ease"
        }}
      >
        {open ? children : null}
      </div>
    </section>
  );
}

function JsonBlock({ body }: { body: string }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        maxHeight: 420,
        overflow: "auto",
        fontSize: 12,
        lineHeight: 1.5,
        color: "var(--vscode-editor-foreground, #d4d4d4)",
        fontFamily: "var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)"
      }}
    >
      {body || "-"}
    </pre>
  );
}

export default function AiGeneratedDataPage() {
  const [mounted, setMounted] = useState(false);
  const [response, setResponse] = useState<any>(null);
  const [runtimeOpenApi, setRuntimeOpenApi] = useState<any>(null);
  const [runtimeMappings, setRuntimeMappings] = useState<any>(null);

  useEffect(() => {
    setMounted(true);
    setResponse(readLastResponse());
  }, []);

  useEffect(() => {
    if (!mounted) return;
    void (async () => {
      try {
        const [o, m] = await Promise.all([
          fetch("/api/wiremock/openapi", { cache: "no-store" }),
          fetch("/api/wiremock/mappings", { cache: "no-store" })
        ]);
        const openapiJson = await o.json().catch(() => null);
        const mappingsJson = await m.json().catch(() => null);
        setRuntimeOpenApi(openapiJson);
        setRuntimeMappings(mappingsJson);
      } catch {
        setRuntimeOpenApi(null);
        setRuntimeMappings(null);
      }
    })();
  }, [mounted]);

  const traces = response?.chain?.traces ?? {};
  const parsed = response?.chain?.parsed ?? {};
  const outputs = response?.chain?.outputs ?? {};

  if (!mounted) {
    return (
      <main
        style={{
          minHeight: "100vh",
          padding: 16,
          background: "var(--vscode-editor-background, #1e1e1e)"
        }}
      />
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 16,
        background:
          "radial-gradient(900px 500px at -10% -20%, color-mix(in srgb, #3794ff 14%, transparent), transparent 65%), radial-gradient(1000px 520px at 120% 120%, color-mix(in srgb, #89d185 10%, transparent), transparent 65%), var(--vscode-editor-background, #1e1e1e)",
        color: "var(--vscode-editor-foreground, #d4d4d4)",
        fontFamily: "var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif)"
      }}
    >
      <div
        style={{
          border: "1px solid color-mix(in srgb, var(--vscode-panel-border, #3a3f4b) 85%, transparent)",
          borderRadius: 14,
          background: "color-mix(in srgb, var(--vscode-editorWidget-background, #1f242d) 86%, transparent)",
          padding: 14,
          boxShadow: "0 14px 28px rgba(0,0,0,0.24)"
        }}
      >
        <h1 style={{ margin: 0, fontSize: 18, fontWeight: 900, letterSpacing: 0.2 }}>AI Generated Data</h1>
        <p style={{ margin: "8px 0 0", color: "#9fb1c9", fontSize: 12 }}>
          Collapsed by default. Expand sections to inspect traces and try live WireMock APIs.
        </p>
      </div>

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        <CollapsibleCard title="Runtime WireMock OpenAPI" copyText={pretty(runtimeOpenApi ?? {})}>
          <JsonBlock body={pretty(runtimeOpenApi ?? {})} />
        </CollapsibleCard>
        <CollapsibleCard title="Runtime WireMock Mappings" copyText={pretty(runtimeMappings ?? {})}>
          <JsonBlock body={pretty(runtimeMappings ?? {})} />
        </CollapsibleCard>
        <CollapsibleCard title="API Spec Trace" copyText={pretty(traces?.apiSpec ?? {})}>
          <JsonBlock body={pretty(traces?.apiSpec ?? {})} />
        </CollapsibleCard>
        <CollapsibleCard title="WireMock Trace" copyText={pretty(traces?.wiremock ?? {})}>
          <JsonBlock body={pretty(traces?.wiremock ?? {})} />
        </CollapsibleCard>
        <CollapsibleCard title="Scenario DSL Trace" copyText={pretty(traces?.scenario ?? {})}>
          <JsonBlock body={pretty(traces?.scenario ?? {})} />
        </CollapsibleCard>
        <CollapsibleCard title="Parsed Chain State" copyText={pretty(parsed)}>
          <JsonBlock body={pretty(parsed)} />
        </CollapsibleCard>
        <CollapsibleCard title="Raw Outputs" copyText={pretty(outputs)}>
          <JsonBlock body={pretty(outputs)} />
        </CollapsibleCard>
      </div>
    </main>
  );
}
