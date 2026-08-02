-- Storage for cross-device progress. Run once in the Supabase dashboard:
-- SQL Editor → New query → paste → Run.
--
-- One row per learner holding the same JSON the course already exports from
-- the "Сохранить копию" button, so the local format stays the single source of
-- truth and the server is only a copy of it.

create table if not exists public.progress (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.progress enable row level security;

-- Row-level security is what makes the public anon key safe: every statement
-- below is scoped to auth.uid(), so a learner can only ever touch their own
-- row, no matter what the browser sends.
drop policy if exists "Learners read their own progress" on public.progress;
create policy "Learners read their own progress"
  on public.progress for select
  using (auth.uid() = user_id);

drop policy if exists "Learners create their own progress" on public.progress;
create policy "Learners create their own progress"
  on public.progress for insert
  with check (auth.uid() = user_id);

drop policy if exists "Learners update their own progress" on public.progress;
create policy "Learners update their own progress"
  on public.progress for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Keeps updated_at honest without trusting the client to send it.
create or replace function public.touch_progress()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists progress_touch on public.progress;
create trigger progress_touch
  before insert or update on public.progress
  for each row execute function public.touch_progress();
