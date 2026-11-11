-- Melo storage. Run this once in the Supabase SQL editor.
-- The server reaches these tables with the service role key, which bypasses row level security.
-- Row level security stays on with no policies, so the public anon key can read and write nothing.

create table if not exists melo_state (
  id text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists melo_receipts (
  id text primary key,
  ts bigint not null,
  data jsonb not null
);

create index if not exists melo_receipts_ts_idx on melo_receipts (ts desc);

alter table melo_state enable row level security;
alter table melo_receipts enable row level security;
