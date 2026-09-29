-- Execute once in the Supabase SQL Editor. Safe to run again: no votes are deleted.
create table if not exists public.urna_elections (
  id text primary key,
  closed boolean not null default false,
  total integer not null default 0 check (total >= 0),
  counts jsonb not null default '{"deputado_federal":{},"deputado_estadual":{},"senador_1":{},"senador_2":{},"governador":{},"presidente":{}}'::jsonb
);
create table if not exists public.urna_receipts (
  election_id text not null references public.urna_elections(id),
  request_id uuid not null,
  fingerprint text not null,
  primary key (election_id,request_id)
);
alter table public.urna_elections add column if not exists generation integer not null default 1;
create table if not exists public.urna_login_limits (
  bucket text primary key,
  started_at timestamptz not null default now(),
  attempts integer not null default 1
);
alter table public.urna_elections enable row level security;
alter table public.urna_receipts enable row level security;
alter table public.urna_login_limits enable row level security;
revoke all on public.urna_elections,public.urna_receipts,public.urna_login_limits from anon,authenticated;
grant select,insert,update,delete on public.urna_elections,public.urna_receipts,public.urna_login_limits to service_role;

create or replace function public.urna_status(p_election text,p_details boolean default false)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare e public.urna_elections%rowtype;
begin
  select * into e from public.urna_elections where id=p_election;
  if not found then raise exception 'ELECTION_NOT_FOUND'; end if;
  return jsonb_build_object('encerrada',e.closed,'totalVotacoes',e.total,'rodada',e.generation)
    || case when p_details and e.closed then jsonb_build_object('resultados',jsonb_build_object(
      'versao',1,'eleicao',e.id,'totalVotacoes',e.total,'contagens',e.counts)) else '{}'::jsonb end;
end;
$$;

drop function if exists public.urna_submit(text,uuid,text,jsonb);
create or replace function public.urna_submit(p_election text,p_request uuid,p_fingerprint text,p_votes jsonb,p_generation integer default 1)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare e public.urna_elections%rowtype; previous text; stage text; choice text; vote jsonb; i integer;
  stages text[] := array['deputado_federal','deputado_estadual','senador_1','senador_2','governador','presidente'];
begin
  -- All submissions and closure serialize on this row, avoiding lost increments.
  select * into e from public.urna_elections where id=p_election for update;
  if not found then raise exception 'ELECTION_NOT_FOUND'; end if;
  if p_generation is null or e.generation<>p_generation then raise exception 'ROUND_CHANGED'; end if;
  select fingerprint into previous from public.urna_receipts where election_id=p_election and request_id=p_request;
  if found then
    if previous<>p_fingerprint then raise exception 'REQUEST_CONFLICT'; end if;
    return jsonb_build_object('salvo',true,'repetido',true);
  end if;
  if e.closed then raise exception 'ELECTION_CLOSED'; end if;
  if jsonb_typeof(p_votes)<>'array' or jsonb_array_length(p_votes)<>6 then raise exception 'INVALID_VOTES'; end if;
  for i in 0..5 loop
    stage:=stages[i+1]; vote:=p_votes->i;
    if coalesce(vote->>'tipo','') not in ('candidato','legenda','branco','nulo') then raise exception 'INVALID_VOTES'; end if;
    if vote->>'tipo' in ('branco','nulo') then choice:=vote->>'tipo';
    else
      if coalesce(vote->>'numero','') !~ '^\d{2,5}$' then raise exception 'INVALID_VOTES'; end if;
      choice:=(vote->>'tipo')||':'||(vote->>'numero');
    end if;
    e.counts:=jsonb_set(e.counts,array[stage,choice],to_jsonb(coalesce((e.counts->stage->>choice)::integer,0)+1),true);
  end loop;
  insert into public.urna_receipts(election_id,request_id,fingerprint) values(p_election,p_request,p_fingerprint);
  update public.urna_elections set counts=e.counts,total=e.total+1 where id=p_election;
  return jsonb_build_object('salvo',true,'repetido',false);
end;
$$;

create or replace function public.urna_reset(p_election text,p_expected integer)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare e public.urna_elections%rowtype;
begin
  select * into e from public.urna_elections where id=p_election for update;
  if not found then raise exception 'ELECTION_NOT_FOUND'; end if;
  if p_expected is null or e.generation<>p_expected then raise exception 'ROUND_CHANGED'; end if;
  delete from public.urna_receipts where election_id=p_election;
  update public.urna_elections set closed=false,total=0,generation=generation+1,
    counts='{"deputado_federal":{},"deputado_estadual":{},"senador_1":{},"senador_2":{},"governador":{},"presidente":{}}'::jsonb
    where id=p_election;
  return public.urna_status(p_election,true);
end;
$$;

create or replace function public.urna_close(p_election text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
begin
  update public.urna_elections set closed=true where id=p_election;
  if not found then raise exception 'ELECTION_NOT_FOUND'; end if;
  return public.urna_status(p_election,true);
end;
$$;

create or replace function public.urna_allow_login(p_bucket text)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare hits integer;
begin
  delete from public.urna_login_limits where started_at < now()-interval '1 day';
  insert into public.urna_login_limits(bucket) values(p_bucket)
  on conflict(bucket) do update set
    attempts=case when public.urna_login_limits.started_at < now()-interval '15 minutes' then 1 else public.urna_login_limits.attempts+1 end,
    started_at=case when public.urna_login_limits.started_at < now()-interval '15 minutes' then now() else public.urna_login_limits.started_at end
  returning attempts into hits;
  return hits<=10;
end;
$$;
revoke all on function public.urna_status(text,boolean),public.urna_submit(text,uuid,text,jsonb,integer),public.urna_close(text),public.urna_allow_login(text),public.urna_reset(text,integer) from public,anon,authenticated;
grant execute on function public.urna_status(text,boolean),public.urna_submit(text,uuid,text,jsonb,integer),public.urna_close(text),public.urna_allow_login(text),public.urna_reset(text,integer) to service_role;

insert into public.urna_elections(id) values('sp-2026-turno1-v1') on conflict(id) do nothing;
