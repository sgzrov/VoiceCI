import Link from "next/link";
import { redirect } from "next/navigation";
import { withAuth, getSignInUrl, getSignUpUrl } from "@workos-inc/authkit-nextjs";
import { Button } from "@/components/ui/button";

export default async function LandingPage() {
  const { user } = await withAuth();

  if (user) {
    redirect("/runs");
  }

  const signInUrl = await getSignInUrl();
  const signUpUrl = await getSignUpUrl();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex items-center justify-between h-14">
            <span className="text-[15px] font-semibold tracking-tight">VoiceCI</span>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" asChild>
                <Link href={signInUrl}>Log in</Link>
              </Button>
              <Button size="sm" asChild>
                <Link href={signUpUrl}>Sign up</Link>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            Behavioral regression testing for voice agents
          </h1>
          <p className="mt-4 text-lg text-muted-foreground max-w-lg mx-auto">
            Ship voice AI with confidence. Run audio and conversation tests against your agent on every change.
          </p>
          <div className="mt-8 flex items-center justify-center gap-4">
            <Button size="lg" asChild>
              <Link href={signUpUrl}>Get started</Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <Link href={signInUrl}>Log in</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
