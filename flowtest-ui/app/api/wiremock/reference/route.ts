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
  layout: "classic",
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
  customCss: `
    a[href*="scalar.com"],
    .scalar-footer,
    [class*="scalar-footer"],
    [data-testid*="powered-by"],
    [aria-label*="Powered by Scalar"] {
      display: none !important;
      visibility: hidden !important;
    }
  `
});
