import type { ReactNode } from "react";

import "./globals.css";

export const metadata = {
  title: "pdx-connect",
  description: "Hyperlocal partner discovery + outreach drafts (hackathon MVP)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
