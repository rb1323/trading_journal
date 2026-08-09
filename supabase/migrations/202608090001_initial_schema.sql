create extension if not exists pgcrypto;

create type public.snapshot_status as enum ('processing', 'succeeded', 'rejected', 'conflict');
create type public.trade_direction as enum ('long', 'short');
create type public.trade_status as enum ('open', 'closed');
create type public.allocation_role as enum ('entry', 'exit');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  default_timezone text not null default 'America/New_York',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.broker_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_account text not null,
  display_name text,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  unique (user_id, source_account)
);

create table public.sync_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  version text not null,
  token_hash text not null unique,
  last_seen_at timestamptz,
  local_state jsonb not null default '{}'::jsonb,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.pairing_codes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.sync_sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.sync_devices(id) on delete cascade,
  source_type text not null check (source_type = 'das_trades_csv'),
  timezone text not null default 'America/New_York',
  last_snapshot_at timestamptz,
  created_at timestamptz not null default now(),
  unique (device_id, source_type)
);

create table public.sync_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sync_sources(id) on delete cascade,
  file_name text not null,
  file_size bigint not null check (file_size >= 0),
  file_last_modified_at timestamptz not null,
  sha256 text not null,
  status public.snapshot_status not null default 'processing',
  added_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  trade_count integer not null default 0,
  open_position_count integer not null default 0,
  issues jsonb not null default '[]'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (source_id, sha256)
);

create table public.execution_fills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_id uuid not null references public.sync_sources(id) on delete cascade,
  first_snapshot_id uuid not null references public.sync_snapshots(id),
  stable_key text not null,
  source_trade_id text not null,
  source_order_id text not null default '',
  trader text not null default '',
  source_account text not null,
  branch text not null default '',
  route text not null default '',
  broker_symbol text not null default '',
  rrno text not null default '',
  side text not null check (side in ('B', 'S')),
  short_flag boolean not null default false,
  market text not null default '',
  symbol text not null,
  quantity integer not null check (quantity > 0),
  price numeric(24, 8) not null check (price > 0),
  executed_at timestamptz not null,
  execution_date date not null,
  raw_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (source_id, stable_key)
);

create table public.trades (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_key text not null,
  source_account text not null,
  symbol text not null,
  direction public.trade_direction not null,
  status public.trade_status not null,
  opened_at timestamptz not null,
  closed_at timestamptz,
  quantity integer not null check (quantity > 0),
  open_quantity integer not null check (open_quantity >= 0),
  entry_vwap numeric(24, 8) not null,
  exit_vwap numeric(24, 8),
  gross_pnl numeric(24, 8) not null default 0,
  fill_count integer not null default 0,
  rebuilt_at timestamptz not null default now(),
  unique (user_id, trade_key)
);

create table public.trade_fill_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  fill_id uuid not null references public.execution_fills(id) on delete cascade,
  role public.allocation_role not null,
  quantity integer not null check (quantity > 0),
  price numeric(24, 8) not null check (price > 0),
  unique (trade_id, fill_id, role)
);

create index execution_fills_user_account_symbol_time_idx on public.execution_fills(user_id, source_account, symbol, executed_at);
create index trades_user_opened_idx on public.trades(user_id, opened_at desc);
create index snapshots_user_received_idx on public.sync_snapshots(user_id, received_at desc);
create index devices_user_idx on public.sync_devices(user_id);

alter table public.profiles enable row level security;
alter table public.broker_accounts enable row level security;
alter table public.sync_devices enable row level security;
alter table public.pairing_codes enable row level security;
alter table public.sync_sources enable row level security;
alter table public.sync_snapshots enable row level security;
alter table public.execution_fills enable row level security;
alter table public.trades enable row level security;
alter table public.trade_fill_allocations enable row level security;

create policy "Users manage own profiles" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());
create policy "Users manage own broker accounts" on public.broker_accounts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users read own devices" on public.sync_devices for select using (user_id = auth.uid());
create policy "Users revoke own devices" on public.sync_devices for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own pairing codes" on public.pairing_codes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users read own sources" on public.sync_sources for select using (user_id = auth.uid());
create policy "Users read own snapshots" on public.sync_snapshots for select using (user_id = auth.uid());
create policy "Users read own fills" on public.execution_fills for select using (user_id = auth.uid());
create policy "Users read own trades" on public.trades for select using (user_id = auth.uid());
create policy "Users read own allocations" on public.trade_fill_allocations for select using (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

create trigger on_auth_user_created
after insert or update on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.replace_reconstructed_trades(
  p_user_id uuid,
  p_trades jsonb,
  p_allocations jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required';
  end if;

  delete from public.trade_fill_allocations where user_id = p_user_id;
  delete from public.trades where user_id = p_user_id;

  insert into public.trades (
    id, user_id, trade_key, source_account, symbol, direction, status,
    opened_at, closed_at, quantity, open_quantity, entry_vwap, exit_vwap,
    gross_pnl, fill_count
  )
  select
    x.id, p_user_id, x.trade_key, x.source_account, x.symbol,
    x.direction::public.trade_direction, x.status::public.trade_status,
    x.opened_at, x.closed_at, x.quantity, x.open_quantity, x.entry_vwap,
    x.exit_vwap, x.gross_pnl, x.fill_count
  from jsonb_to_recordset(p_trades) as x(
    id uuid, trade_key text, source_account text, symbol text, direction text,
    status text, opened_at timestamptz, closed_at timestamptz, quantity integer,
    open_quantity integer, entry_vwap numeric, exit_vwap numeric,
    gross_pnl numeric, fill_count integer
  );

  insert into public.trade_fill_allocations (user_id, trade_id, fill_id, role, quantity, price)
  select p_user_id, x.trade_id, x.fill_id, x.role::public.allocation_role, x.quantity, x.price
  from jsonb_to_recordset(p_allocations) as x(
    trade_id uuid, fill_id uuid, role text, quantity integer, price numeric
  );
end;
$$;

revoke all on function public.replace_reconstructed_trades(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_reconstructed_trades(uuid, jsonb, jsonb) to service_role;

-- Data API access: authenticated web user
grant select on table
  public.profiles,
  public.broker_accounts,
  public.sync_devices,
  public.sync_sources,
  public.sync_snapshots,
  public.execution_fills,
  public.trades,
  public.trade_fill_allocations
to authenticated;

grant update on table
  public.profiles,
  public.sync_devices
to authenticated;

grant insert, delete on table
  public.pairing_codes
to authenticated;

-- Server-side Supabase client
grant select, insert, update, delete on all tables in schema public
to service_role;
