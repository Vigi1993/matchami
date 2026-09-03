-- ============================================================
-- MatchAmI — Fase 3: collega Supabase Auth a "profiles"
--
-- Perché un trigger e non un insert lato client dopo signUp():
-- se la conferma email è attiva (default su Supabase), subito dopo
-- auth.signUp() NON esiste ancora una sessione autenticata, quindi
-- un insert diretto in "profiles" verrebbe bloccato dalla RLS
-- ("profiles: insert own" richiede auth.uid() = id). Il trigger
-- gira lato database con i permessi del proprietario della funzione
-- (security definer), quindi funziona a prescindere dalla sessione.
--
-- I dati (ruolo, nome, cognome, consenso privacy) arrivano dai
-- metadata passati a supabase.auth.signUp({ options: { data: {...} } }).
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ruolo ruolo_utente;
begin
  v_ruolo := coalesce(
    (new.raw_user_meta_data->>'ruolo')::ruolo_utente,
    'inquilino'
  );

  insert into public.profiles (id, ruolo, nome, cognome, privacy_accettata, consenso_marketing)
  values (
    new.id,
    v_ruolo,
    new.raw_user_meta_data->>'nome',
    new.raw_user_meta_data->>'cognome',
    coalesce((new.raw_user_meta_data->>'privacy_accettata')::boolean, false),
    coalesce((new.raw_user_meta_data->>'consenso_marketing')::boolean, false)
  );

  if v_ruolo = 'inquilino' then
    insert into public.tenant_profiles (profile_id) values (new.id);
  else
    insert into public.owner_profiles (profile_id) values (new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
