-- Run this once in the Supabase SQL editor.
-- ponytail: single shared table, no classes/rooms/auth — add a class_id column + RLS when more than one room needs isolation.

create table if not exists taps (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now()
);

alter table taps enable row level security;

create policy "anyone can tap" on taps
  for insert to anon with check (true);

create policy "anyone can read taps" on taps
  for select to anon using (true);

create policy "anyone can reset" on taps
  for delete to anon using (true);

alter publication supabase_realtime add table taps;
