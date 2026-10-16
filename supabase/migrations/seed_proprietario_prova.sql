-- ============================================================
-- SOLO PER PROVA: crea un nuovo PROPRIETARIO di prova, pronto per entrare nell'app.
--
-- Come si usa (SQL Editor di Supabase):
--   1. cambia i valori in cima al blocco (email, password, nome, cognome, tipo);
--   2. esegui il blocco 1;
--   3. entra nell'app con quell'email e quella password.
--
-- Cosa fa:
--   - inserisce l'utente in auth.users (email già confermata) con ruolo
--     «proprietario»: da lì il trigger del progetto crea da solo il profilo e la
--     riga di proprietario;
--   - compila il profilo (tipo, numero di immobili, obiettivo);
--   - mette già l'accettazione dell'informativa, per non fermarti alla prima schermata;
--   - se l'email esiste già non crea un secondo utente: aggiorna il profilo.
--
-- Cosa NON fa: non crea immobili. Un proprietario risulta «verificato» solo se ha
-- almeno un immobile verificato (non è un campo del profilo): crea l'immobile
-- dall'app e fallo verificare dallo staff, come per un proprietario vero.
-- Senza immobili non può ricevere candidature né lasciare recensioni.
--
-- Serve anche per il badge «Inquilino raccomandato»: seed_recensioni_prova.sql
-- vuole almeno 2 proprietari registrati. Lancia questo script due volte, con due
-- email diverse, e hai i due proprietari.
--
-- Non c'è modo di provarlo qui: la sintassi è controllata e lo schema dei dati è
-- letto dalle migrazioni, ma non è eseguito su un database vero. La parte più
-- delicata è auth.identities, che dipende dalla versione di Supabase: se
-- fallisce lo script lo scrive e prosegue; se poi l'accesso non funziona, crea
-- l'utente da Authentication -> Users -> Add user (con ruolo proprietario nei
-- metadati) e rilancia lo script con la stessa email.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CREAZIONE
-- ------------------------------------------------------------
do $$
declare
  -- ===== COSA CAMBIARE =====
  v_email    text := 'proprietario.prova@example.com';
  v_password text := 'ProvaMatchami2026!';
  v_nome     text := 'Luca';
  v_cognome  text := 'Bianchi';
  v_tipo     text := 'privato';                  -- 'privato' | 'agenzia' | 'property_manager'
  v_immobili int  := 1;
  v_obiettivo text := 'Affittare velocemente';   -- 'Affittare velocemente' | 'Massima selezione inquilini' | ...
  -- =========================
  v_id uuid;
begin
  -- così crypt() e gen_salt() si trovano sia con pgcrypto in "extensions" sia in "public"
  perform set_config('search_path', 'public, extensions, auth', true);

  select id into v_id from auth.users where lower(email) = lower(trim(v_email));

  if v_id is null then
    v_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
      lower(trim(v_email)), crypt(v_password, gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('ruolo', 'proprietario', 'nome', v_nome, 'cognome', v_cognome,
                         'privacy_accettata', true, 'consenso_marketing', false),
      now(), now(),
      '', '', '', ''
    );

    -- l'«identità» di accesso con email e password; dipende dalla versione di Supabase
    begin
      insert into auth.identities (id, user_id, provider_id, identity_data, provider,
                                   last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), v_id, v_id::text,
              jsonb_build_object('sub', v_id::text, 'email', lower(trim(v_email)), 'email_verified', true),
              'email', now(), now(), now());
    exception when others then
      raise notice 'Identità non creata (%): se non riesci ad entrare, crea l''utente da Authentication -> Users.', sqlerrm;
    end;
  else
    raise notice 'L''utente % esiste già: aggiorno solo il profilo.', v_email;
  end if;

  if not exists (select 1 from owner_profiles where profile_id = v_id) then
    raise exception 'L''email % esiste ma non è un proprietario: usa un''altra email.', v_email;
  end if;

  -- ---- il profilo ----
  update owner_profiles set
    proprietario_tipo = v_tipo::tipo_proprietario,
    num_immobili      = v_immobili,
    obiettivo         = v_obiettivo,
    updated_at        = now()
  where profile_id = v_id;

  -- ---- l'informativa già accettata (versione in vigore) ----
  insert into accettazioni_informativa (user_id, versione)
  values (v_id, '2026-10-provvisoria-16')
  on conflict do nothing;

  raise notice 'Fatto. Accedi con % / %', lower(trim(v_email)), v_password;
end
$$;

-- ------------------------------------------------------------
-- 2. VERIFICA (cambia l'email): deve restituire una riga con ruolo = proprietario
-- ------------------------------------------------------------
select u.email, p.nome, p.cognome, p.ruolo, o.proprietario_tipo, o.num_immobili, o.obiettivo,
       (select count(*) from owner_profiles) as proprietari_totali
from auth.users u
join profiles p on p.id = u.id
join owner_profiles o on o.profile_id = u.id
where lower(u.email) = lower('proprietario.prova@example.com');

-- ------------------------------------------------------------
-- 3. PER TOGLIERLO (togli il commento e cambia l'email): cancella l'utente e,
--    a cascata, profilo, immobili, candidature ricevute e accettazioni.
--    ATTENZIONE: le recensioni che ha scritto restano, ma senza autore (e non
--    contano più per il badge degli inquilini).
-- ------------------------------------------------------------
-- delete from auth.users where lower(email) = lower('proprietario.prova@example.com');
