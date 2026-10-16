-- ============================================================
-- SOLO PER PROVA: due recensioni positive al tuo inquilino di prova,
-- così vedi il badge «Inquilino raccomandato».
--
-- Come si usa (SQL Editor di Supabase):
--   1. cerca «CAMBIA@QUI.it» e sostituisci l'email in TUTTI E TRE i punti
--      con quella del tuo account INQUILINO di prova;
--   2. esegui il blocco 1 (inserimento);
--   3. esegui il blocco 2 (verifica): deve dire badge_atteso = true;
--   4. ricarica la Home dell'app: il badge compare sotto «La tua affidabilità».
--
-- Cosa fa il blocco 1:
--   - prende i primi DUE proprietari registrati (il badge vuole due proprietari
--     DIVERSI: due voti dello stesso non bastano) e mette un 5 e un 4;
--   - non crea contratti né rapporti: sono recensioni «senza rapporto», come
--     quelle precedenti alla verifica dei contratti. Per l'app valgono uguale;
--   - se lo rilanci non raddoppia (salta chi ha già una recensione senza rapporto);
--   - il database creerà anche due notifiche «Nuovo feedback» per l'inquilino:
--     è normale, le vedi dalla campanella nel Profilo.
--
-- Se dice «Servono almeno 2 proprietari» registra un secondo account
-- proprietario dall'app e rilancia.
--
-- Non c'è modo di provarlo qui: controllato contro lo schema delle migrazioni
-- (0001, 0007, 0010, 0011, 0014, 0019), non eseguito su un database vero.
-- ============================================================

-- ------------------------------------------------------------
-- 1. INSERIMENTO
-- ------------------------------------------------------------
do $$
declare
  v_email    text := 'CAMBIA@QUI.it';   -- <-- l'email del tuo inquilino di prova
  v_tenant   uuid;
  v_o1       uuid;
  v_o2       uuid;
  v_n        int;
  v_inserite int := 0;
begin
  select tp.profile_id into v_tenant
    from tenant_profiles tp
    join auth.users u on u.id = tp.profile_id
   where lower(u.email) = lower(trim(v_email));

  if v_tenant is null then
    raise exception 'Nessun inquilino con l''email "%": controlla l''email (deve essere un account inquilino, non proprietario).', v_email;
  end if;

  select profile_id into v_o1 from owner_profiles order by profile_id limit 1;
  select profile_id into v_o2 from owner_profiles order by profile_id limit 1 offset 1;

  if v_o1 is null or v_o2 is null then
    raise exception 'Servono almeno 2 proprietari registrati (ne ho trovati %): per il badge i due voti devono venire da proprietari diversi.',
      (select count(*) from owner_profiles);
  end if;

  -- un 5 dal primo proprietario
  insert into recensioni (tenant_id, autore_id, voto)
  select v_tenant, v_o1, 5
   where not exists (
     select 1 from recensioni r
      where r.tenant_id = v_tenant and r.autore_id = v_o1
        and r.rapporto_id is null and r.invito_id is null
   );
  get diagnostics v_n = row_count;
  v_inserite := v_inserite + v_n;

  -- un 4 dal secondo
  insert into recensioni (tenant_id, autore_id, voto)
  select v_tenant, v_o2, 4
   where not exists (
     select 1 from recensioni r
      where r.tenant_id = v_tenant and r.autore_id = v_o2
        and r.rapporto_id is null and r.invito_id is null
   );
  get diagnostics v_n = row_count;
  v_inserite := v_inserite + v_n;

  raise notice 'Recensioni inserite: % (0 = c''erano già). Inquilino: %', v_inserite, v_email;
end
$$;

-- ------------------------------------------------------------
-- 2. VERIFICA: le recensioni dell'inquilino e se il badge è atteso
--    (stessa regola dell'app: 2 proprietari diversi con 4+ stelle,
--     nessuna recensione da 2 stelle o meno, ultimi 4 anni)
-- ------------------------------------------------------------
select
  count(distinct r.autore_id) filter (where r.voto >= 4)                       as proprietari_con_voto_positivo,
  coalesce(bool_or(r.voto <= 2), false)                                        as ha_negative,
  (count(distinct r.autore_id) filter (where r.voto >= 4) >= 2
     and not coalesce(bool_or(r.voto <= 2), false))                            as badge_atteso
from recensioni r
join auth.users u on u.id = r.tenant_id
where lower(u.email) = lower('CAMBIA@QUI.it')
  and r.created_at > now() - interval '4 years';

-- (facoltativo) l'elenco delle recensioni di quell'inquilino
select r.voto, r.autore_id, r.rapporto_id, r.created_at
from recensioni r
join auth.users u on u.id = r.tenant_id
where lower(u.email) = lower('CAMBIA@QUI.it')
order by r.created_at;

-- ------------------------------------------------------------
-- 3. PER TOGLIERE LE RECENSIONI DI PROVA (togli il commento e cambia l'email).
--    Cancella le recensioni SENZA rapporto di quell'inquilino: se ne aveva di
--    vere senza rapporto, spariscono anche quelle.
-- ------------------------------------------------------------
-- delete from recensioni r
--  using auth.users u
--  where u.id = r.tenant_id
--    and lower(u.email) = lower('CAMBIA@QUI.it')
--    and r.rapporto_id is null and r.invito_id is null;
