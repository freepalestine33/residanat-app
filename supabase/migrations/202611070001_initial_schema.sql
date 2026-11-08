create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.lectures (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  content jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.flashcard_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  state jsonb not null default '{}'::jsonb,
  reps integer not null default 0 check (reps >= 0),
  due_date timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.quiz_results (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  lecture_id text,
  question_id text not null,
  score integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.errors (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  resolved boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.notes (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  image_path text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create table if not exists public.settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_state (
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  last_sync_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, device_id)
);

create index if not exists lectures_user_updated_idx on public.lectures (user_id, updated_at);
create index if not exists flashcard_progress_user_updated_idx on public.flashcard_progress (user_id, updated_at);
create index if not exists quiz_results_user_updated_idx on public.quiz_results (user_id, updated_at);
create index if not exists errors_user_updated_idx on public.errors (user_id, updated_at);
create index if not exists notes_user_updated_idx on public.notes (user_id, updated_at);

alter table public.profiles enable row level security;
alter table public.lectures enable row level security;
alter table public.flashcard_progress enable row level security;
alter table public.quiz_results enable row level security;
alter table public.errors enable row level security;
alter table public.notes enable row level security;
alter table public.settings enable row level security;
alter table public.sync_state enable row level security;

grant select, update on public.profiles to authenticated;
grant select, insert, update, delete on
  public.lectures,
  public.flashcard_progress,
  public.quiz_results,
  public.errors,
  public.notes,
  public.settings,
  public.sync_state
to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Users manage their own lectures" on public.lectures;
create policy "Users manage their own lectures" on public.lectures
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own flashcard progress" on public.flashcard_progress;
create policy "Users manage their own flashcard progress" on public.flashcard_progress
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own quiz results" on public.quiz_results;
create policy "Users manage their own quiz results" on public.quiz_results
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own errors" on public.errors;
create policy "Users manage their own errors" on public.errors
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own notes" on public.notes;
create policy "Users manage their own notes" on public.notes
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own settings" on public.settings;
create policy "Users manage their own settings" on public.settings
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own sync state" on public.sync_state;
create policy "Users manage their own sync state" on public.sync_state
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('note-images', 'note-images', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can read their own note images" on storage.objects;
create policy "Users can read their own note images" on storage.objects
  for select to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users can upload their own note images" on storage.objects;
create policy "Users can upload their own note images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists "Users can update their own note images" on storage.objects;
create policy "Users can update their own note images" on storage.objects
  for update to authenticated
  using (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'note-images' and (storage.foldername(name))[1] = (select auth.uid())::text);