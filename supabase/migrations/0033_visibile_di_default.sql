-- ============================================================
-- Chi si iscrive come inquilino è VISIBILE ai proprietari di partenza.
--
-- Nella 0032 il consenso «Fatti trovare dai proprietari» era spento e lo doveva accendere l'inquilino. Ora è il contrario: chi
-- si iscrive può essere trovato dai proprietari con una casa verificata e adatta alla sua ricerca, e ha un modo per
-- NASCONDERSI quando vuole (Profilo > Privacy e consensi). La colonna resta la stessa: `true` = visibile, `false` = si è
-- nascosto. Le regole di chi può scrivere a chi (funzione invia_richiesta_proprietario) non cambiano: guarda sempre la colonna.
--
-- ATTENZIONE: questo cambia il modo in cui sono trattati i dati di chi è GIÀ iscritto. L'informativa nuova (versione 20) non è
-- equivalente alle precedenti: chi ha accettato prima la deve riaccettare al prossimo accesso.
-- ============================================================

alter table tenant_profiles alter column visibile_ai_proprietari set default true;
alter table tenant_profiles alter column visibile_dal set default now();

-- Chi era già iscritto diventa visibile. La funzione era nuova e spenta per tutti: non c'è nessuna scelta precedente da rispettare
-- (chi non l'aveva mai accesa e chi l'aveva accesa e poi ritirata sono, nei dati, la stessa cosa).
update tenant_profiles
   set visibile_ai_proprietari = true,
       visibile_dal = coalesce(visibile_dal, now())
 where visibile_ai_proprietari is not true;

comment on column tenant_profiles.visibile_ai_proprietari is
  'true = i proprietari con un immobile verificato e adatto alla sua ricerca possono vedere il profilo (nome e iniziale, lavoro, foto, affidabilità, recensioni; non il reddito né i contatti) e mandargli una richiesta. È così di partenza per ogni iscritto; false = l''inquilino si è nascosto.';
