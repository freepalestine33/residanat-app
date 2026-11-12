create table if not exists public.custom_cards (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  lecture_id text not null,
  card jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create index if not exists custom_cards_user_updated_idx on public.custom_cards (user_id, updated_at);

alter table public.custom_cards enable row level security;

grant select, insert, update, delete on public.custom_cards to authenticated;

drop policy if exists "Users manage their own custom cards" on public.custom_cards;
create policy "Users manage their own custom cards" on public.custom_cards
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
