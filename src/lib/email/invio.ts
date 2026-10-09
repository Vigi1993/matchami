/**
 * L'invio periodico: prende le notifiche da mandare (già segnate come inviate dal
 * database, così due invii insieme non le mandano due volte), compone un'email per
 * persona, la passa al fornitore e registra com'è andata. Se l'email non parte, le
 * notifiche tornano in coda.
 *
 * Non parla con il database né con un fornitore direttamente: riceve tutto da fuori
 * (`deposito`, `fornitore`), così si prova senza rete.
 */
import { componiRiepilogo, indirizzoBase, type NotificaEmail } from "./modello";
import type { ProviderEmail } from "./tipi";

/** Una riga restituita da `reclama_notifiche_email`. */
export type RigaReclamata = {
  user_id: string;
  email: string;
  nome: string | null;
  token: string;
  notifiche: NotificaEmail[];
};

export interface Deposito {
  reclama(max: number): Promise<{ ok: true; righe: RigaReclamata[] } | { ok: false; errore: string }>;
  annulla(idNotifiche: string[], definitivo: boolean): Promise<void>;
  registra(esito: { userId: string; fornitore: string; esito: "inviata" | "fallita"; n: number; errore?: string }): Promise<void>;
}

export type RiepilogoInvio = {
  /** l'invio si è fermato prima di cominciare (configurazione, o il database non risponde) */
  fermato?: string;
  utenti: number;
  notifiche: number;
  inviate: number;
  fallite: number;
};

/**
 * Toglie da un testo qualunque cosa somigli a un indirizzo email: un messaggio di errore di
 * un servizio di posta può nominare il destinatario, e nel registro non deve finire.
 */
export function senzaIndirizzi(testo: unknown): string {
  return String(testo ?? "")
    .replace(/[^\s<>"'@,;()]+@[^\s<>"',;()]+/g, "[indirizzo]")
    .slice(0, 300);
}

export const MASSIMO_PERSONE_PER_GIRO = 50;

export async function eseguiInvio(opzioni: {
  deposito: Deposito;
  fornitore: ProviderEmail;
  urlApp: string;
  max?: number;
}): Promise<RiepilogoInvio> {
  const vuoto: RiepilogoInvio = { utenti: 0, notifiche: 0, inviate: 0, fallite: 0 };

  // Prima di toccare le notifiche: se l'indirizzo dell'app non è valido, ogni email avrebbe
  // un link rotto, e le notifiche resterebbero segnate come inviate senza esserlo.
  if (!indirizzoBase(opzioni.urlApp)) return { ...vuoto, fermato: "Indirizzo dell'app non configurato o non valido." };

  const reclamate = await opzioni.deposito.reclama(opzioni.max ?? MASSIMO_PERSONE_PER_GIRO);
  if (!reclamate.ok) return { ...vuoto, fermato: "Non è stato possibile leggere le notifiche da inviare." };

  const riepilogo: RiepilogoInvio = { ...vuoto, utenti: reclamate.righe.length };

  for (const riga of reclamate.righe) {
    const ids = riga.notifiche.map((n) => n.id);
    riepilogo.notifiche += ids.length;

    let esito: Awaited<ReturnType<ProviderEmail["invia"]>>;
    try {
      const email = componiRiepilogo({ nome: riga.nome, notifiche: riga.notifiche, urlApp: opzioni.urlApp, token: riga.token });
      esito = await opzioni.fornitore.invia(
        { a: riga.email, oggetto: email.oggetto, testo: email.testo, html: email.html, intestazioni: email.intestazioni },
        { userId: riga.user_id }
      );
    } catch (e) {
      // un fornitore che lancia un errore, o un'email che non si riesce a comporre: si riprova
      esito = { ok: false, errore: senzaIndirizzi(e instanceof Error ? e.message : e), definitivo: false };
    }

    if (esito.ok) {
      riepilogo.inviate++;
      await opzioni.deposito
        .registra({ userId: riga.user_id, fornitore: opzioni.fornitore.id, esito: "inviata", n: ids.length })
        .catch(() => undefined);
    } else {
      riepilogo.fallite++;
      // le notifiche tornano in coda; se anche questo non riesce, il resto continua
      await opzioni.deposito.annulla(ids, esito.definitivo).catch(() => undefined);
      await opzioni.deposito
        .registra({ userId: riga.user_id, fornitore: opzioni.fornitore.id, esito: "fallita", n: ids.length, errore: senzaIndirizzi(esito.errore) })
        .catch(() => undefined);
    }
  }

  return riepilogo;
}
