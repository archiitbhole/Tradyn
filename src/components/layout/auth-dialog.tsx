"use client";
import { Loader2, MailCheck } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ApiClientError, apiFetch } from "@/hooks/use-api";
import { useSession } from "@/hooks/use-market";

/** Sign in / create account. The password goes to this app's own server route; the session is an httpOnly cookie. */
export function AuthDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { reload } = useSession();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { data } = await apiFetch<{ user: unknown; confirmEmail?: boolean }>(`/api/auth/${mode}`, { method: "POST", json: { email: email.trim(), password } });
      if (data.confirmEmail) setConfirm(true);
      else {
        await reload();
        setPassword("");
        onOpenChange(false);
      }
    } catch (err) {
      setError(err instanceof ApiClientError ? err.error.message : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) {
          setError(null);
          setConfirm(false);
        }
      }}
    >
      <DialogContent>
        <DialogHeader title={mode === "sign-in" ? "Sign in to Tradyn" : "Create your Tradyn account"} description="An account keeps your watchlists on every device. Market data works without one." />
        {confirm ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <MailCheck className="size-9 text-brand" aria-hidden />
            <p className="text-sm leading-6">
              We sent a confirmation link to <span className="font-medium">{email}</span>. Open it to finish creating the account, then sign in.
            </p>
            <Button onClick={() => { setConfirm(false); setMode("sign-in"); }}>Back to sign in</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Tabs value={mode} onValueChange={(v) => { setMode(v as typeof mode); setError(null); }}>
              <TabsList className="w-full">
                <TabsTrigger value="sign-in" className="flex-1 justify-center">Sign in</TabsTrigger>
                <TabsTrigger value="sign-up" className="flex-1 justify-center">Create account</TabsTrigger>
              </TabsList>
            </Tabs>
            <div>
              <Label htmlFor="auth-email">Email</Label>
              <Input id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="auth-password">Password {mode === "sign-up" ? <span className="font-normal text-faint">(at least 8 characters)</span> : null}</Label>
              <Input id="auth-password" type="password" autoComplete={mode === "sign-in" ? "current-password" : "new-password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error ? <p role="alert" className="rounded-lg border border-down/35 bg-down-soft px-3 py-2 text-[13px] text-down">{error}</p> : null}
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || !email || password.length < 8}>
              {busy ? <Loader2 className="animate-spin" /> : null}
              {mode === "sign-in" ? "Sign in" : "Create account"}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
