begin;

-- The initial schema does not alter a pre-existing lectures table.
do $$
declare
  primary_key_name text;
begin
  select conname
    into primary_key_name
    from pg_constraint
   where conrelid = 'public.lectures'::regclass
     and contype = 'p';

  if primary_key_name is not null then
    execute format('alter table public.lectures drop constraint %I', primary_key_name);
  end if;
end;
$$;

alter table public.lectures
  alter column id drop default;

alter table public.lectures
  alter column id type text using id::text;

alter table public.lectures
  add constraint lectures_pkey primary key (user_id, id);

commit;
