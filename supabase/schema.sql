-- Tradyn database schema for Supabase (PostgreSQL).
-- Run this once: Supabase dashboard -> SQL Editor -> paste -> Run. It is safe to run again.

-- 1. Watchlists -------------------------------------------------------------------------------
create table if not exists public.watchlists (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  created_at  timestamptz not null default now()
);
create index if not exists watchlists_user_idx on public.watchlists (user_id, created_at);

create table if not exists public.watchlist_items (
  watchlist_id    uuid not null references public.watchlists (id) on delete cascade,
  instrument_key  text not null check (instrument_key ~ '^(NSE|BSE):.{1,40}$'),
  added_at        timestamptz not null default now(),
  primary key (watchlist_id, instrument_key)
);

-- Row Level Security: every user can see and change only their own watchlists.
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;

drop policy if exists "own watchlists" on public.watchlists;
create policy "own watchlists" on public.watchlists
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "own watchlist items" on public.watchlist_items;
create policy "own watchlist items" on public.watchlist_items
  for all to authenticated
  using (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid())))
  with check (exists (select 1 from public.watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid())));

-- 2. Broker session tokens (optional) -----------------------------------------------------------
-- Lets all serverless instances share one Angel One / Groww login instead of each signing in.
-- RLS is on with NO policies: only the server (service-role key) can read or write this table.
create table if not exists public.provider_sessions (
  provider    text primary key check (provider in ('angelone', 'groww')),
  token       text not null,
  expires_at  timestamptz not null,
  updated_at  timestamptz not null default now()
);
alter table public.provider_sessions enable row level security;
revoke all on public.provider_sessions from anon, authenticated;
