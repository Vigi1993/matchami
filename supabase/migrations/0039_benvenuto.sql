-- ============================================================
-- Il percorso di BENVENUTO: chi si è appena iscritto compila i dati che servono (inquilino: chi è, lavoro, garanzie, ricerca, documenti;
-- proprietario: documenti, la sua casa, la prova di proprietà) prima di entrare nell'app.
--
-- Si usa la colonna profiles.onboarding_completato che esisteva già dalla prima versione dello schema ma non l'usava nessuno (tutti «no»).
--   1. CHI È GIÀ ISCRITTO non deve rifare il percorso: la prima volta che si esegue questa migrazione tutti i profili esistenti risultano «completato».
--      (Rieseguirla non lo rifà: i nuovi iscritti restano «non completato».)
--   2. Nessuno la imposta a mano: si cambia SOLO con la funzione completa_onboarding(), che controlla i dati ESSENZIALI:
--        inquilino:    una situazione lavorativa, la risposta sui protesti (è obbligatoria) e un budget massimo;
--        proprietario: almeno un immobile suo (anche non pubblicato o ancora da verificare).
--      Tutto il resto (foto, documenti, verifiche, famiglia, presentazione) si può fare dopo: il percorso li propone ma non li pretende.
--      Lo staff non ha dati da compilare: completa senza controlli.
-- ============================================================

-- ---- 1. chi è già iscritto risulta «completato» (solo alla prima esecuzione) ----
do $$
begin
  if not exists (select 1 from pg_proc where proname = 'completa_onboarding' and pronamespace = 'public'::regnamespace) then
    update profiles set onboarding_completato = true where onboarding_completato = false;
  end if;
end;
$$;

-- ---- 2. nessuno la scrive a mano ----
create or replace function public.proteggi_onboarding()
returns trigger
language plpgsql
as $$
begin
  -- chi lavora dal pannello SQL, o la funzione sotto, non è limitato
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.onboarding_completato := false;
    return new;
  end if;
  if new.onboarding_completato is distinct from old.onboarding_completato then
    raise exception 'ONBOARDING_RISERVATO: il benvenuto si completa dalla pagina di benvenuto' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
drop trigger if exists proteggi_onboarding on profiles;
create trigger proteggi_onboarding before insert or update on profiles
  for each row execute function public.proteggi_onboarding();

-- ---- 3. si completa con i dati essenziali ----
create or replace function public.completa_onboarding()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ruolo text;
  v_fatto boolean;
  t tenant_profiles;
begin
  if auth.uid() is null then
    raise exception 'NON_AUTENTICATO' using errcode = 'P0001';
  end if;

  select ruolo::text, onboarding_completato into v_ruolo, v_fatto from profiles where id = auth.uid();
  if not found then
    raise exception 'PROFILO_INESISTENTE' using errcode = 'P0001';
  end if;
  if v_fatto then
    return; -- già fatto: nessun errore, nessun cambiamento
  end if;

  if not public.is_staff() then
    if v_ruolo = 'inquilino' then
      select * into t from tenant_profiles where profile_id = auth.uid();
      if not found or t.professione is null or btrim(t.professione) = '' then
        raise exception 'ONBOARDING_LAVORO_MANCANTE' using errcode = 'P0001';
      end if;
      if t.protestato is null then
        raise exception 'PROTESTI_NON_DICHIARATI' using errcode = 'P0001';
      end if;
      if t.budget_max is null or t.budget_max <= 0 then
        raise exception 'ONBOARDING_BUDGET_MANCANTE' using errcode = 'P0001';
      end if;
    elsif v_ruolo = 'proprietario' then
      if not exists (select 1 from listings where owner_id = auth.uid()) then
        raise exception 'ONBOARDING_NESSUN_IMMOBILE' using errcode = 'P0001';
      end if;
    end if;
  end if;

  update profiles set onboarding_completato = true where id = auth.uid();
end;
$$;

revoke all on function public.completa_onboarding() from public, anon;
grant execute on function public.completa_onboarding() to authenticated;
