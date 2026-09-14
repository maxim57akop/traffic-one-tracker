import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const gilroy = localFont({
  variable: "--font-gilroy",
  display: "swap",
  src: [
    {
      path: "./fonts/Gilroy-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/Gilroy-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "./fonts/Gilroy-Semibold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "./fonts/Gilroy-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
});

const monoFallback = localFont({
  variable: "--font-geist-mono",
  display: "swap",
  src: "./fonts/Gilroy-Regular.woff2",
});

export const metadata: Metadata = {
  title: {
    default: "TrafficOne",
    template: "%s - TrafficOne",
  },
  description: "Affiliate traffic tracking panel",
  icons: {
    icon: "/logo.jpg",
    shortcut: "/logo.jpg",
    apple: "/logo.jpg",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${gilroy.variable} ${monoFallback.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
