create type public.trade_review_status as enum ('unreviewed', 'draft', 'reviewed');
create type public.journal_tag_category as enum ('setup', 'mistake', 'emotion', 'custom');

create table public.trade_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_id uuid references public.trades(id) on delete set null,
  trade_key text not null,
  source_account text not null,
  symbol text not null,
  trade_opened_at timestamptz not null,
  notes text not null default '' check (char_length(notes) <= 20000),
  rating smallint check (rating between 1 and 5),
  followed_plan boolean,
  status public.trade_review_status not null default 'unreviewed',
  version integer not null default 1 check (version > 0),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, trade_key)
);

create unique index trade_reviews_trade_id_idx
  on public.trade_reviews(trade_id)
  where trade_id is not null;
create index trade_reviews_user_status_idx
  on public.trade_reviews(user_id, status, trade_opened_at desc);
create index trade_reviews_user_symbol_idx
  on public.trade_reviews(user_id, symbol, trade_opened_at desc);

create table public.journal_tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 40),
  category public.journal_tag_category not null,
  color text not null default '#00e7f2' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);

create unique index journal_tags_user_category_name_idx
  on public.journal_tags(user_id, category, lower(name));
create index journal_tags_user_category_idx
  on public.journal_tags(user_id, category, name);

create table public.trade_review_tags (
  user_id uuid not null references auth.users(id) on delete cascade,
  review_id uuid not null references public.trade_reviews(id) on delete cascade,
  tag_id uuid not null references public.journal_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (review_id, tag_id)
);

create index trade_review_tags_user_tag_idx
  on public.trade_review_tags(user_id, tag_id);

alter table public.trade_reviews enable row level security;
alter table public.journal_tags enable row level security;
alter table public.trade_review_tags enable row level security;

create policy "Users manage own trade reviews"
  on public.trade_reviews for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "Users manage own journal tags"
  on public.journal_tags for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
create policy "Users manage own trade review tags"
  on public.trade_review_tags for all
  using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.trade_reviews r where r.id = review_id and r.user_id = auth.uid())
    and exists (select 1 from public.journal_tags t where t.id = tag_id and t.user_id = auth.uid())
  );

grant select, insert, update, delete on table
  public.trade_reviews,
  public.journal_tags,
  public.trade_review_tags
to authenticated, service_role;

create or replace function public.save_trade_review(
  p_trade_id uuid,
  p_notes text,
  p_rating smallint,
  p_followed_plan boolean,
  p_status public.trade_review_status,
  p_expected_version integer,
  p_tag_ids uuid[]
)
returns public.trade_reviews
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_trade public.trades;
  v_review public.trade_reviews;
begin
  if v_user_id is null then
    raise exception 'authentication required';
  end if;
  if char_length(coalesce(p_notes, '')) > 20000 then
    raise exception 'notes exceed 20000 characters';
  end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then
    raise exception 'rating must be between 1 and 5';
  end if;

  select * into v_trade
  from public.trades
  where id = p_trade_id and user_id = v_user_id;
  if not found then
    raise exception 'trade not found';
  end if;

  select * into v_review
  from public.trade_reviews
  where user_id = v_user_id and trade_key = v_trade.trade_key
  for update;

  if not found then
    if p_expected_version <> 0 then
      raise exception 'review version conflict';
    end if;
    insert into public.trade_reviews (
      user_id, trade_id, trade_key, source_account, symbol, trade_opened_at,
      notes, rating, followed_plan, status, reviewed_at
    ) values (
      v_user_id, v_trade.id, v_trade.trade_key, v_trade.source_account, v_trade.symbol, v_trade.opened_at,
      coalesce(p_notes, ''), p_rating, p_followed_plan, p_status,
      case when p_status = 'reviewed' then now() else null end
    ) returning * into v_review;
  else
    if v_review.version <> p_expected_version then
      raise exception 'review version conflict';
    end if;
    update public.trade_reviews set
      trade_id = v_trade.id,
      source_account = v_trade.source_account,
      symbol = v_trade.symbol,
      trade_opened_at = v_trade.opened_at,
      notes = coalesce(p_notes, ''),
      rating = p_rating,
      followed_plan = p_followed_plan,
      status = p_status,
      reviewed_at = case
        when p_status = 'reviewed' and v_review.status <> 'reviewed' then now()
        when p_status <> 'reviewed' then null
        else v_review.reviewed_at
      end,
      version = version + 1,
      updated_at = now()
    where id = v_review.id
    returning * into v_review;
  end if;

  delete from public.trade_review_tags
  where review_id = v_review.id and user_id = v_user_id;

  insert into public.trade_review_tags(user_id, review_id, tag_id)
  select v_user_id, v_review.id, t.id
  from public.journal_tags t
  where t.user_id = v_user_id and t.id = any(coalesce(p_tag_ids, array[]::uuid[]))
  on conflict do nothing;

  return v_review;
end;
$$;

revoke all on function public.save_trade_review(uuid, text, smallint, boolean, public.trade_review_status, integer, uuid[]) from public, anon;
grant execute on function public.save_trade_review(uuid, text, smallint, boolean, public.trade_review_status, integer, uuid[]) to authenticated;

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

  update public.trade_reviews r
  set trade_id = t.id,
      source_account = t.source_account,
      symbol = t.symbol,
      trade_opened_at = t.opened_at,
      updated_at = now()
  from public.trades t
  where r.user_id = p_user_id
    and t.user_id = p_user_id
    and r.trade_key = t.trade_key
    and r.trade_id is distinct from t.id;

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
