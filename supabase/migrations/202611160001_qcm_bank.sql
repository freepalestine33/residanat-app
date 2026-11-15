-- Banque de QCM OTR (annales 2014-2022) — données de référence publiques en lecture.
create table if not exists public.qcm_bank (
  id bigint generated always as identity primary key,
  bank_id integer not null,
  otr_number integer,
  module text not null,
  chapter text not null,
  context text,
  star boolean not null default false,
  corrected boolean not null default false,
  stem text not null,
  options jsonb not null,
  justification text,
  sources jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists qcm_bank_module_chapter_idx on public.qcm_bank (module, chapter);
create index if not exists qcm_bank_otr_idx on public.qcm_bank (otr_number);
create index if not exists qcm_bank_corrected_idx on public.qcm_bank (corrected) where corrected;

alter table public.qcm_bank enable row level security;

drop policy if exists "qcm_bank_read" on public.qcm_bank;
create policy "qcm_bank_read" on public.qcm_bank
  for select to anon, authenticated using (true);
