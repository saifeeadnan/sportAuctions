import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { auth } from "@/auth";
import { Nav } from "@/components/Nav";
import { AnalyticsHeartbeat } from "@/components/analytics/AnalyticsHeartbeat";

// Runs before paint so the page never flashes the wrong theme: honors an
// explicit choice from the toggle (localStorage), or falls back to the OS
// preference on a first visit.
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem("theme");
    var isDark = stored === "dark" || (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", isDark);
    // Set directly as an inline style (highest cascade priority, no
    // build-tool CSS transform involved) so native form controls — select
    // dropdowns, checkboxes, date pickers — actually render in the right
    // theme instead of the OS default.
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  } catch (e) {}
})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LeagueForge",
  description: "Form leagues, run the auction, forge the team.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <Nav />
        <main className="flex-1">{children}</main>
        {session?.user && <AnalyticsHeartbeat />}
      </body>
    </html>
  );
}
