import { ApiReference } from "@scalar/nextjs-api-reference";

export const GET = ApiReference({
  sources: [
    {
      url: "/api/wiremock/openapi",
      title: "WireMock Runtime API",
      default: true,
      agent: {
        disabled: true
      }
    }
  ],
  theme: "purple",
  layout: "modern",
  darkMode: true,
  hideDownloadButton: false,
  searchHotKey: "k"
});
