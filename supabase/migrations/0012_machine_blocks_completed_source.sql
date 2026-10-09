-- Record how a machine block was marked done: 'manual' (user clicked ✓)
-- or 'auto' (dynamic board, remaining qty hit 0). NULL = before tracking.
alter table public.machine_blocks add column if not exists completed_source text
  check (completed_source in ('manual','auto'));
