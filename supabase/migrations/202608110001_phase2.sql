create type public.broker_import_status as enum ('processing', 'needs_mapping', 'succeeded', 'conflict', 'rejected');
create type public.trade_cost_status as enum ('provisional', 'reconciled', 'conflict');
create type public.market_data_status as enum ('fetching', 'ready', 'error', 'unavailable');

alter table public.trades
  add column allocated_fees numeric(24, 8) not null default 0,
  add column cost_status public.trade_cost_status not null default 'provisional',
  add column net_pnl numeric(24, 8) generated always as (gross_pnl - allocated_fees) stored;

create table public.broker_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_name text not null,
  file_size bigint not null check (file_size >= 0),
  sha256 text not null,
  status public.broker_import_status not null default 'processing',
  row_count integer not null default 0,
  added_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  issues jsonb not null default '[]'::jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique (user_id, sha256)
);

create table public.broker_account_mappings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_account_id uuid not null references public.broker_accounts(id) on delete cascade,
  external_account_number text not null,
  created_at timestamptz not null default now(),
  unique (user_id, external_account_number)
);

create table public.broker_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  first_import_id uuid not null references public.broker_imports(id),
  stable_key text not null,
  account_number text not null,
  transaction_id text not null,
  entry_type text not null,
  description text not null default '',
  trade_date date not null,
  settlement_date date,
  side text not null default '',
  symbol text not null default '',
  quantity numeric(24, 8) not null,
  price numeric(24, 8) not null,
  commission numeric(24, 8) not null default 0,
  ecn_fee numeric(24, 8) not null default 0,
  exchange_fee numeric(24, 8) not null default 0,
  regulatory_fee numeric(24, 8) not null default 0,
  locate_fee numeric(24, 8) not null default 0,
  other_fees numeric(24, 8) not null default 0,
  occ_fee numeric(24, 8) not null default 0,
  orf_fee numeric(24, 8) not null default 0,
  taf_fee numeric(24, 8) not null default 0,
  total_fees numeric(24, 8) not null default 0,
  gross_amount numeric(24, 8) not null default 0,
  net_amount numeric(24, 8) not null default 0,
  raw_payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, stable_key),
  unique (user_id, account_number, transaction_id)
);

create table public.trade_cost_allocations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid not null references public.trades(id) on delete cascade,
  broker_transaction_id uuid not null references public.broker_transactions(id) on delete cascade,
  cost_type text not null check (cost_type in ('trade_fee', 'locate_fee')),
  amount numeric(24, 8) not null,
  created_at timestamptz not null default now(),
  unique (trade_id, broker_transaction_id, cost_type)
);

create table public.market_data_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null check (provider = 'alpaca'),
  feed text not null check (feed = 'sip'),
  timeframe text not null check (timeframe = '1Min'),
  symbol text not null,
  session_date date not null,
  status public.market_data_status not null default 'fetching',
  storage_path text,
  bar_count integer not null default 0,
  sha256 text,
  covered_until timestamptz,
  fetched_at timestamptz,
  error_message text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, provider, feed, timeframe, symbol, session_date)
);

create index broker_imports_user_received_idx on public.broker_imports(user_id, received_at desc);
create index broker_transactions_user_date_symbol_idx on public.broker_transactions(user_id, trade_date, symbol);
create index trade_cost_allocations_user_trade_idx on public.trade_cost_allocations(user_id, trade_id);
create index market_data_sessions_user_date_symbol_idx on public.market_data_sessions(user_id, session_date, symbol);

alter table public.broker_imports enable row level security;
alter table public.broker_account_mappings enable row level security;
alter table public.broker_transactions enable row level security;
alter table public.trade_cost_allocations enable row level security;
alter table public.market_data_sessions enable row level security;

create policy "Users read own broker imports" on public.broker_imports for select using (user_id = auth.uid());
create policy "Users read own broker account mappings" on public.broker_account_mappings for select using (user_id = auth.uid());
create policy "Users read own broker transactions" on public.broker_transactions for select using (user_id = auth.uid());
create policy "Users read own trade costs" on public.trade_cost_allocations for select using (user_id = auth.uid());
create policy "Users read own market data metadata" on public.market_data_sessions for select using (user_id = auth.uid());

grant select on table
  public.broker_imports,
  public.broker_account_mappings,
  public.broker_transactions,
  public.trade_cost_allocations,
  public.market_data_sessions
to authenticated;

grant select, insert, update, delete on table
  public.broker_imports,
  public.broker_account_mappings,
  public.broker_transactions,
  public.trade_cost_allocations,
  public.market_data_sessions
to service_role;

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
  )
  on conflict (user_id, trade_key) do update set
    source_account = excluded.source_account,
    symbol = excluded.symbol,
    direction = excluded.direction,
    status = excluded.status,
    opened_at = excluded.opened_at,
    closed_at = excluded.closed_at,
    quantity = excluded.quantity,
    open_quantity = excluded.open_quantity,
    entry_vwap = excluded.entry_vwap,
    exit_vwap = excluded.exit_vwap,
    gross_pnl = excluded.gross_pnl,
    fill_count = excluded.fill_count,
    rebuilt_at = now();

  delete from public.trade_fill_allocations where user_id = p_user_id;

  delete from public.trades t
  where t.user_id = p_user_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_trades) as x(trade_key text)
      where x.trade_key = t.trade_key
    );

  insert into public.trade_fill_allocations (user_id, trade_id, fill_id, role, quantity, price)
  select p_user_id, t.id, x.fill_id, x.role::public.allocation_role, x.quantity, x.price
  from jsonb_to_recordset(p_allocations) as x(
    trade_key text, fill_id uuid, role text, quantity integer, price numeric
  )
  join public.trades t
    on t.user_id = p_user_id and t.trade_key = x.trade_key;
end;
$$;

revoke all on function public.replace_reconstructed_trades(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.replace_reconstructed_trades(uuid, jsonb, jsonb) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('market-data', 'market-data', false, 10485760, array['application/gzip', 'application/json'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
