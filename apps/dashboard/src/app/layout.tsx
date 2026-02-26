import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { withAuth, signOut } from "@workos-inc/authkit-nextjs";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VoiceCI Dashboard",
  description: "Behavioral regression testing for voice agents",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user: { email: string } | null = null;
  try {
    const auth = await withAuth({ ensureSignedIn: true });
    user = auth.user;
    console.log("[layout] withAuth success, user:", user?.email);
  } catch (err) {
    console.log("[layout] withAuth failed:", err);
  }

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
                    <Link
                      href="/settings/keys"
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Settings
                    </Link>
                  </div>
                </div>
                {user && (
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-muted-foreground">
                      {user.email}
                    </span>
                    <form
                      action={async () => {
                        "use server";
                        await signOut();
                      }}
                    >
                      <button
                        type="submit"
                        className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Sign out
                      </button>
                    </form>
                  </div>
                )}
              </div>
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
