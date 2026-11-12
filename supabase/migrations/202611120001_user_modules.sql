create table if not exists public.modules (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create index if not exists modules_user_updated_idx on public.modules (user_id, updated_at);
create unique index if not exists modules_user_name_unique_idx on public.modules (user_id, lower(name));

alter table public.modules enable row level security;

grant select, insert, update, delete on public.modules to authenticated;

drop policy if exists "Users manage their own modules" on public.modules;
create policy "Users manage their own modules" on public.modules
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
