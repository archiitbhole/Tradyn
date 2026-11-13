"use client";
import { CheckCircle2, CircleDashed, Database, ExternalLink, FlaskConical, KeyRound, Monitor, Moon, Palette, RefreshCw, Settings, ShieldCheck, Sun, Timer, UserRound } from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useState } from "react";
import { FullLogo } from "@/components/brand/logo";
import { AuthDialog } from "@/components/layout/auth-dialog";
import { PageHeader } from "@/components/shared/page-header";
import { ErrorPanel, RowsSkeleton } from "@/components/shared/states";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IconTile, type Tone } from "@/components/ui/icon-tile";
import { Segmented } from "@/components/ui/segmented";
import { apiFetch, useApi } from "@/hooks/use-api";
import { useSession, type RefreshPref } from "@/hooks/use-market";
import { useMounted } from "@/hooks/use-mounted";
import { usePref } from "@/hooks/use-pref";
import { cn } from "@/lib/utils/cn";
import type { ProviderId, SettingsPayload } from "@/types/market";
import type { LucideIcon } from "lucide-react";

const DOCS: Record<ProviderId, { href: string; label: string }> = {
  angelone: { href: "https://smartapi.angelone.in", label: "smartapi.angelone.in" },
  groww: { href: "https://groww.in/trade-api", label: "groww.in/trade-api" },
  yahoo: { href: "https://finance.yahoo.com", label: "finance.yahoo.com" },
};

function Section({ id, icon, tone = "brand", title, description, children, aside }: { id: string; icon: LucideIcon; tone?: Tone; title: string; description: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-20">
      <CardHeader>
        <div className="group/tile flex items-center gap-2.5">
          <IconTile icon={icon} tone={tone} size="sm" />
          <div>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
        {aside}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

const Env = ({ name }: { name: string }) => <code className="num mx-0.5 rounded-md border bg-surface-2 px-1.5 py-0.5 text-xs text-foreground [overflow-wrap:anywhere]">{name}</code>;

export function SettingsPage() {
  const { data, error, reload, refreshing } = useApi<SettingsPayload>("/api/settings");
  const { session, reload: reloadSession } = useSession();
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();
  const [refresh, setRefresh] = usePref<RefreshPref>("tradyn.refresh", "auto");
  const [auth, setAuth] = useState(false);

  return (
    <>
      <PageHeader icon={Settings} tone="neutral" title="Settings" description="Appearance, price updates, data sources and your account." />
      <div className="grid gap-4 xl:grid-cols-2">
        <Section id="appearance" icon={Palette} title="Appearance" description="Saved in this browser.">
          <p id="theme-label" className="mb-2 text-[13px] font-medium text-muted">Theme</p>
          <div role="group" aria-labelledby="theme-label" className="grid grid-cols-3 gap-2 text-center text-[13px]">
            {([{ value: "light", icon: Sun, label: "Light" }, { value: "dark", icon: Moon, label: "Dark" }, { value: "system", icon: Monitor, label: "Match device" }] as const).map((o) => {
              const on = mounted && theme === o.value;
              return (
                <button
                  key={o.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setTheme(o.value)}
                  className={cn(
                    "group/tile flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 font-medium transition-colors",
                    on ? "border-brand/45 bg-brand-soft text-foreground" : "bg-surface-2/40 text-muted hover:border-border-strong hover:text-foreground",
                  )}
                >
                  <IconTile icon={o.icon} size="sm" tone={on ? "brand" : "neutral"} active={on} />
                  {o.label}
                </button>
              );
            })}
          </div>
        </Section>

        <Section id="updates" icon={Timer} tone="info" title="Price updates" description="Tradyn asks for new prices on a timer (polling), and pauses while this tab is in the background.">
          <Segmented label="Price updates" value={refresh} onChange={setRefresh} options={[{ value: "auto", label: "Automatic" }, { value: "slow", label: "Slower" }, { value: "off", label: "Off" }]} />
          <ul className="mt-3 space-y-1.5 text-[13px] leading-5 text-muted">
            <li><span className="font-medium text-foreground">Automatic</span> — quotes about every 10 seconds and lists every 20 while the market is open; every few minutes when it is closed.</li>
            <li><span className="font-medium text-foreground">Slower</span> — a third as often, to use less data.</li>
            <li><span className="font-medium text-foreground">Off</span> — prices change only when you reload a page.</li>
          </ul>
        </Section>

        <Section
          id="data"
          icon={Database}
          title="Market data sources"
          description="Keys are read on the server only. This page shows which settings are present — never their values."
          aside={<Button size="sm" onClick={reload} disabled={refreshing}><RefreshCw className={refreshing ? "animate-spin" : ""} /> Check again</Button>}
        >
          {error && !data ? <ErrorPanel error={error} onRetry={reload} compact /> : !data ? <RowsSkeleton rows={6} /> : (
            <>
              {data.problem ? <p role="alert" className="mb-3 rounded-lg border border-down/35 bg-down-soft px-3 py-2 text-[13px] text-down">{data.problem}</p> : null}
              <ul className="space-y-2.5">
                {data.providers.map((p) => {
                  const selected = data.selected === p.id;
                  return (
                    <li key={p.id} className={`rounded-xl border p-3.5 ${selected ? "border-brand/45 bg-brand-soft/40" : "bg-surface-2/40"}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        {p.configured ? <CheckCircle2 className="size-4 text-up" aria-hidden /> : <CircleDashed className="size-4 text-faint" aria-hidden />}
                        <span className="text-sm font-semibold">{p.name}</span>
                        {selected ? <Badge tone="brand">In use{data.selectionMode === "auto" ? " (chosen automatically)" : ""}</Badge> : null}
                        <Badge tone={p.official ? "up" : "warn"}>{p.official ? <><ShieldCheck /> Official broker API</> : "Unofficial · may be delayed"}</Badge>
                        <Badge tone={p.configured ? "neutral" : "warn"}>{p.configured ? (p.id === "yahoo" ? "No keys needed" : "Keys present") : p.id === "yahoo" ? "Switched off" : "Not set up"}</Badge>
                      </div>
                      <p className="mt-1.5 text-[13px] leading-5 text-muted">{p.note}</p>
                      {p.missing.length ? <p className="mt-1.5 text-[13px] leading-6 text-muted">Add to the environment: {p.missing.map((m) => <Env key={m} name={m} />)}</p> : null}
                      <a href={DOCS[p.id].href} target="_blank" rel="noopener noreferrer" className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-foreground underline underline-offset-2">{DOCS[p.id].label} <ExternalLink className="size-3" aria-hidden /></a>
                    </li>
                  );
                })}
              </ul>
              <div className="mt-3 space-y-1.5 text-[13px] leading-5 text-muted">
                <p>Choose a source with <Env name="MARKET_DATA_PROVIDER" /> (<span className="num">angelone</span>, <span className="num">groww</span> or <span className="num">yahoo</span>). Without it Tradyn uses Angel One if its keys are present, then Groww, then Yahoo.</p>
                <p>Yahoo fallback is <span className="font-medium text-foreground">{data.yahooFallback ? "on" : "off"}</span>: {data.yahooFallback ? "if the broker API fails, Yahoo answers and every affected page says so." : "if the broker API fails, pages show the error instead of other prices."} Change it with <Env name="YAHOO_FALLBACK" />.</p>
                <p>Tradyn never shows simulated or estimated prices as market data. When no source can answer, you see the reason.</p>
              </div>
              <div className="mt-4 rounded-xl border bg-surface-2/40 p-3.5 text-[13px] leading-5">
                <p className="font-medium">Share list</p>
                <p className="mt-1 text-muted">
                  {data.universe.full
                    ? <>{data.universe.nse.toLocaleString("en-IN")} NSE and {data.universe.bse.toLocaleString("en-IN")} BSE shares from the {data.universe.source}, downloaded {data.universe.generatedAt ? new Date(data.universe.generatedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "at build time"}.</>
                    : <>Using the built-in {data.universe.trackedLabel} list ({data.universe.trackedCount} companies). The full NSE/BSE list is downloaded when the app is built; run <Env name="npm run instruments:sync" /> if the build could not reach it.</>}
                </p>
              </div>
            </>
          )}
        </Section>

        <Section id="account" icon={UserRound} tone="info" title="Account" description="An account saves your watchlists to the cloud. Everything else works without one.">
          {!session ? <RowsSkeleton rows={2} /> : session.user ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{session.user.email}</p>
                <p className="text-[13px] text-muted">Watchlists are saved to your account.</p>
              </div>
              <Button onClick={async () => { await apiFetch("/api/auth/sign-out", { method: "POST", json: {} }).catch(() => undefined); await reloadSession(); }}>Sign out</Button>
            </div>
          ) : session.accountsEnabled ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] leading-5 text-muted">You are not signed in. Watchlists are kept in this browser.</p>
              <Button variant="primary" onClick={() => setAuth(true)}>Sign in or create account</Button>
            </div>
          ) : (
            <div className="space-y-2 text-[13px] leading-6 text-muted">
              <p className="flex items-start gap-2"><KeyRound className="mt-1 size-4 shrink-0 text-warn" aria-hidden /><span>Accounts are not set up on this deployment. Watchlists are kept in this browser until they are.</span></p>
              <p>To enable them, create a Supabase project, run <Env name="supabase/schema.sql" /> in its SQL editor, and add {session.missing.map((m) => <Env key={m} name={m} />)} to the environment. Adding <Env name="SUPABASE_SERVICE_ROLE_KEY" /> also lets server instances share one broker login.</p>
            </div>
          )}
          {data ? <p className="mt-3 border-t pt-3 text-xs text-faint">Broker login sharing between server instances: {data.accounts.tokenSharing ? "on" : "off (each instance signs in for itself)"}.</p> : null}
        </Section>

        <Section id="about" icon={FlaskConical} tone="sim" title="About Tradyn" description={`Version ${data?.version ?? "…"}`}>
          <div className="flex flex-wrap items-center gap-5">
            <div className="grid place-items-center rounded-2xl border bg-surface-2/50 p-4">
              <FullLogo height={132} />
            </div>
            <div className="min-w-[15rem] flex-1 space-y-2 text-[13px] leading-5 text-muted">
              <p>Tradyn shows NSE and BSE market data from the source configured above, and includes a separate rule-based market simulator for learning.</p>
              <p>It is a research and education tool. It does not place orders and does not give investment advice.</p>
              <div className="pt-1">
                <Button size="sm" variant="sim" asChild><Link href="/simulator"><FlaskConical /> Open the simulator</Link></Button>
              </div>
            </div>
          </div>
        </Section>
      </div>
      <AuthDialog open={auth} onOpenChange={setAuth} />
    </>
  );
}
