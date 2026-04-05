import type { Metadata } from "next";
import "./globals.css";
import { GlobalSideNav } from "@/components/global-side-nav";

export const metadata: Metadata = {
  title: "FlowTest UI",
  description: "FlowTest standalone UI with Run Center and Live Timeline"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="ftAppShell">{children}</div>
        <GlobalSideNav />
      </body>
    </html>
  );
}
