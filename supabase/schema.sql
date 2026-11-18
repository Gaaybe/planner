-- Planner: run this once in your Supabase project (SQL Editor → New query → paste → Run).
-- It creates the table that stores your tasks, notes, daily notes, whiteboards and tags,
-- a private storage bucket for images, and rules so only you can read or change your data.

-- 1. Records table -------------------------------------------------------------
create table if not exists public.records (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  id         text    not null,
  type       text    not null,
  data       jsonb   not null default '{}'::jsonb,
  updated_at bigint  not null,              -- when the edit was made (device clock, ms)
  deleted    boolean not null default false,
  server_ts  timestamptz not null default now(),  -- when the server received it
  primary key (user_id, id)
);

create index if not exists records_user_server_ts on public.records (user_id, server_ts);

-- Newest edit wins: ignore an incoming update that is older than what is stored,
-- and stamp the server time on every accepted write.
create or replace function public.records_newest_wins()
returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_ts := clock_timestamp();
  return new;
end $$;

drop trigger if exists records_newest_wins on public.records;
create trigger records_newest_wins
  before insert or update on public.records
  for each row execute function public.records_newest_wins();

-- 2. Row-level security: each person sees only their own rows -----------------
alter table public.records enable row level security;

drop policy if exists "own records select" on public.records;
drop policy if exists "own records insert" on public.records;
drop policy if exists "own records update" on public.records;
drop policy if exists "own records delete" on public.records;

create policy "own records select" on public.records for select to authenticated using (user_id = auth.uid());
create policy "own records insert" on public.records for insert to authenticated with check (user_id = auth.uid());
create policy "own records update" on public.records for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own records delete" on public.records for delete to authenticated using (user_id = auth.uid());

-- 3. Live updates between devices ----------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null;
end $$;

-- 4. Private image storage -------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('images', 'images', false)
on conflict (id) do nothing;

drop policy if exists "own images select" on storage.objects;
drop policy if exists "own images insert" on storage.objects;
drop policy if exists "own images update" on storage.objects;
drop policy if exists "own images delete" on storage.objects;

create policy "own images select" on storage.objects for select to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own images insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own images update" on storage.objects for update to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "own images delete" on storage.objects for delete to authenticated
  using (bucket_id = 'images' and (storage.foldername(name))[1] = auth.uid()::text);
