"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import { FlaskConical, KeyRound, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarNavProps {
  userEmail: string;
  signOutAction: () => Promise<void>;
}

const groups = [
  {
    label: "Testing",
    items: [{ href: "/runs", label: "Runs", icon: FlaskConical }],
  },
  {
    label: "Settings",
    items: [{ href: "/settings/keys", label: "API Keys", icon: KeyRound }],
  },
];

export function SidebarNav({ userEmail, signOutAction }: SidebarNavProps) {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 left-0 h-screen w-60 border-r bg-background flex flex-col z-40">
      <div className="px-5 py-5">
        <Link
          href="/runs"
          className="text-[15px] font-semibold tracking-tight"
        >
          VoiceCI
        </Link>
      </div>

      <nav className="flex-1 px-3 space-y-6 mt-2">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-2 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-2 py-1.5 rounded-md text-sm transition-colors",
                      isActive
                        ? "bg-accent text-foreground font-medium"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t px-3 py-3">
        <p className="text-xs text-muted-foreground truncate px-2 mb-1">
          {userEmail}
        </p>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex items-center gap-3 px-2 py-1.5 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors w-full"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}
