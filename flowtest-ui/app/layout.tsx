import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlowTest UI",
  description: "FlowTest standalone UI with Run Center and Live Timeline"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
