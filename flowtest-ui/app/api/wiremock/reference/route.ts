import { ApiReference } from "@scalar/nextjs-api-reference";

export const GET = ApiReference({
  sources: [
    {
      url: "/api/wiremock/openapi",
      title: "Merged Runtime + API Spec",
      default: true,
      agent: {
        disabled: true
      }
    },
    {
      url: "/api/openapi/latest",
      title: "Generated API Spec",
      agent: {
        disabled: true
      }
    }
  ],
  theme: "purple",
  layout: "modern",
  darkMode: true,
  proxyUrl: "/api/wiremock/proxy",
  hideDownloadButton: false,
  hideClientButton: false,
  hideTestRequestButton: false,
  showSidebar: true,
  showDeveloperTools: "always",
  hideDarkModeToggle: true,
  hideSearch: false,
  mcp: {
    disabled: true
  },
  searchHotKey: "k",
  onLoaded: () => {
    const hideToolbarActions = () => {
      const toolbar = document.querySelector(".api-reference-toolbar");
      if (!toolbar) return;
      const nodes = Array.from(toolbar.querySelectorAll("button, a, [role='button']"));
      for (const node of nodes) {
        const text = (node.textContent || "").trim().toLowerCase();
        if (text === "share" || text === "deploy") {
          (node as HTMLElement).style.display = "none";
          const parent = (node as HTMLElement).parentElement as HTMLElement | null;
          if (parent) parent.style.display = "none";
        }
      }
    };

    hideToolbarActions();
    setTimeout(hideToolbarActions, 150);
    setTimeout(hideToolbarActions, 600);
    setTimeout(hideToolbarActions, 1500);
  },
  customCss: `
    a[href*="scalar.com"],
    .scalar-footer,
    [class*="scalar-footer"],
    [data-testid*="powered-by"],
    [aria-label*="Powered by Scalar"] {
      display: none !important;
      visibility: hidden !important;
    }
    .api-reference-toolbar [aria-label*="Share"],
    .api-reference-toolbar [aria-label*="Deploy"],
    .api-reference-toolbar [title*="Share"],
    .api-reference-toolbar [title*="Deploy"] {
      display: none !important;
      visibility: hidden !important;
    }
  `
});
