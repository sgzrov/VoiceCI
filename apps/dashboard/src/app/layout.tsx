import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VoiceCI Dashboard",
  description: "Behavioral regression testing for voice agents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <div className="min-h-screen">
          <nav className="border-b border-border">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-14">
                <div className="flex items-center gap-8">
                  <Link href="/runs" className="text-lg font-semibold">
                    VoiceCI
                  </Link>
                  <div className="flex gap-4">
                    <Link
                      href="/runs"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Runs
                    </Link>
                    <Link
                      href="/suites"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Suites
                    </Link>
                  </div>
                </div>
              </div>
              <Link
                href="/settings/keys"
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Settings
              </Link>
            </div>
          </nav>
          <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
