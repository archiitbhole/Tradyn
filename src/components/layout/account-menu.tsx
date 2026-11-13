"use client";
import { LogIn, LogOut, Settings, Smartphone, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useSWRConfig } from "swr";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-market";
import { AuthDialog } from "./auth-dialog";

export function AccountMenu() {
  const { session, reload } = useSession();
  const { mutate } = useSWRConfig();
  const [auth, setAuth] = useState(false);
  const user = session?.user;

  async function signOut() {
    try {
      await apiFetch("/api/auth/sign-out", { method: "POST", json: {} });
    } finally {
      await reload();
      await mutate("/api/watchlists", undefined, { revalidate: false });
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={user ? `Account: ${user.email}` : "Account"}>
            {user ? <span className="grid size-7 place-items-center rounded-full bg-brand-soft text-xs font-semibold uppercase text-brand ring-1 ring-brand/30">{user.email.slice(0, 1)}</span> : <UserRound />}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          {user ? (
            <>
              <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href="/settings#account"><Settings /> Account settings</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={signOut}><LogOut /> Sign out</DropdownMenuItem>
            </>
          ) : session?.accountsEnabled ? (
            <>
              <DropdownMenuLabel>Watchlists are saved on this device</DropdownMenuLabel>
              <DropdownMenuItem onSelect={() => setAuth(true)}><LogIn /> Sign in or create account</DropdownMenuItem>
            </>
          ) : (
            <>
              <DropdownMenuLabel className="flex items-start gap-2 leading-5"><Smartphone className="mt-0.5 size-4 shrink-0" /> Accounts are not set up on this deployment. Watchlists are saved on this device.</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <Link href="/settings#account"><Settings /> How to enable accounts</Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <AuthDialog open={auth} onOpenChange={setAuth} />
    </>
  );
}
