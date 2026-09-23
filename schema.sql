create table if not exists public.maple_income_sync (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null,
  version bigint not null default 1 check (version > 0),
  state_updated_at timestamptz not null,
  updated_at timestamptz not null default now(),
  client_id text not null,
  content_hash text not null
);

alter table public.maple_income_sync enable row level security;

drop policy if exists "Users can read their maple income data" on public.maple_income_sync;
create policy "Users can read their maple income data"
on public.maple_income_sync for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their maple income data" on public.maple_income_sync;
create policy "Users can insert their maple income data"
on public.maple_income_sync for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their maple income data" on public.maple_income_sync;
create policy "Users can update their maple income data"
on public.maple_income_sync for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.set_maple_income_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_maple_income_sync_updated_at on public.maple_income_sync;
create trigger set_maple_income_sync_updated_at
before update on public.maple_income_sync
for each row execute function public.set_maple_income_updated_at();

revoke all on public.maple_income_sync from anon;
grant select, insert, update on public.maple_income_sync to authenticated;
