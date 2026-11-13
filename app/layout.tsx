import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "IKPM Visit Planner",
  description: "IKPM operations visit planner",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning className={geist.variable}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
