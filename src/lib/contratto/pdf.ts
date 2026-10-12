/**
 * Dal documento del contratto a un PDF. La parte di IMPAGINAZIONE è pura (`impagina`, si prova
 * senza librerie); la scrittura usa pdf-lib con i font standard, in un solo file, così
 * sostituire la libreria non tocca nient'altro.
 *
 * Una BOZZA porta su ogni pagina una filigrana diagonale «BOZZA DI PROVA» e una riga a piè di
 * pagina. Solo un modello registrato come validato la toglie (lo decide `componiContratto`).
 *
 * Il PDF si genera al momento e non si salva da nessuna parte. I metadati non contengono nomi
 * di persone: solo il titolo del documento.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from "pdf-lib";
import type { DocumentoContratto } from "./tipi";
import { AVVISO_CARATTERI_SEMPLIFICATI, documentoSemplificato, sanitizzaPerPdf, spezzaInRighe, type Misura } from "./testo-pdf";

export const PAGINA = { larghezza: 595.28, altezza: 841.89 } as const;
export const MARGINE = { sinistra: 56, destra: 56, alto: 64, basso: 64 } as const;
export const TESTO_FILIGRANA = "BOZZA DI PROVA";

export type RigaPdf = { testo: string; x: number; y: number; grandezza: number; grassetto: boolean; colore: "nero" | "grigio" | "rosso" };
export type RettangoloPdf = { x: number; y: number; larghezza: number; altezza: number };
export type PaginaPdf = { righe: RigaPdf[]; rettangoli: RettangoloPdf[]; linee: { x1: number; x2: number; y: number }[] };

const CORPO = 11;
const INTERLINEA = 16;
const LARGHEZZA_UTILE = PAGINA.larghezza - MARGINE.sinistra - MARGINE.destra;

/**
 * Dispone il documento in pagine: righe di testo con la loro posizione. Pura: riceve una funzione
 * che misura il testo. Garantisce che nessuna riga esca dai margini e che un titolo di sezione non
 * resti solo in fondo a una pagina.
 */
export function impagina(doc: DocumentoContratto, misura: Misura): PaginaPdf[] {
  const nuova = (): PaginaPdf => ({ righe: [], rettangoli: [], linee: [] });
  const pagine: PaginaPdf[] = [nuova()];
  let y = PAGINA.altezza - MARGINE.alto;

  const corrente = () => pagine[pagine.length - 1];
  const nuovaPagina = () => { pagine.push(nuova()); y = PAGINA.altezza - MARGINE.alto; };
  const assicura = (altezza: number) => { if (y - altezza < MARGINE.basso) nuovaPagina(); };

  const scrivi = (testo: string, grandezza: number, grassetto: boolean, colore: RigaPdf["colore"] = "nero", rientro = 0, interlinea = Math.round(grandezza * 1.45)) => {
    for (const riga of spezzaInRighe(testo, LARGHEZZA_UTILE - rientro, grandezza, grassetto, misura)) {
      assicura(interlinea);
      y -= interlinea;
      corrente().righe.push({ testo: riga, x: MARGINE.sinistra + rientro, y, grandezza, grassetto, colore });
    }
  };

  // titolo
  scrivi(doc.titolo, 17, true);
  if (doc.sottotitolo) scrivi(doc.sottotitolo, 11, false, "grigio");
  y -= 10;

  // avvisi, in un riquadro (se ci sono); se un nome non si scrive tale e quale, lo si dice
  const avvisi = documentoSemplificato(doc) ? [...doc.avvisi, AVVISO_CARATTERI_SEMPLIFICATI] : doc.avvisi;
  if (avvisi.length > 0) {
    const interno = 8;
    const righe = avvisi.flatMap((a, i) => [...spezzaInRighe(a, LARGHEZZA_UTILE - interno * 2, 10, i === 0, misura).map((t) => ({ t, g: i === 0 })), ...(i < avvisi.length - 1 ? [{ t: "", g: false }] : [])]);
    const h = righe.length * 14 + interno * 2;
    assicura(h);
    corrente().rettangoli.push({ x: MARGINE.sinistra, y: y - h, larghezza: LARGHEZZA_UTILE, altezza: h });
    let yy = y - interno;
    for (const r of righe) {
      yy -= 14;
      if (r.t) corrente().righe.push({ testo: r.t, x: MARGINE.sinistra + interno, y: yy, grandezza: 10, grassetto: r.g, colore: r.g ? "rosso" : "nero" });
    }
    y -= h + 14;
  }

  // sezioni
  for (const s of doc.sezioni) {
    assicura(14 * 1.45 + INTERLINEA * 2); // il titolo non resta solo in fondo alla pagina
    y -= 6;
    scrivi(s.titolo, 12.5, true);
    for (const p of s.paragrafi) {
      scrivi(p, CORPO, false, "nero", 0, INTERLINEA);
      y -= 4;
    }
  }

  // firme: due colonne, con la riga sopra il nome
  assicura(120);
  y -= 24;
  const colonna = (LARGHEZZA_UTILE - 30) / 2;
  const yFirma = y - 50;
  doc.firme.slice(0, 2).forEach((f, i) => {
    const x = MARGINE.sinistra + i * (colonna + 30);
    corrente().righe.push({ testo: sanitizzaPerPdf(f.ruolo), x, y: y - 8, grandezza: CORPO, grassetto: true, colore: "nero" });
    corrente().linee.push({ x1: x, x2: x + colonna, y: yFirma });
    const nome = f.nome ? spezzaInRighe(f.nome, colonna, 10, false, misura)[0] ?? "" : "";
    if (nome) corrente().righe.push({ testo: nome, x, y: yFirma - 14, grandezza: 10, grassetto: false, colore: "grigio" });
  });
  y = yFirma - 20;

  return pagine;
}

/** Quanto sta a piè di pagina: la riga di origine, e per una bozza l'avvertenza. */
export function piePagina(doc: DocumentoContratto, numero: number, totale: number): { sinistra: string; destra: string } {
  const origine = `MatchAmI · modello ${doc.modello.id} v${doc.modello.versione}${doc.bozza ? " · bozza di prova, nessun valore legale" : ""}`;
  return { sinistra: sanitizzaPerPdf(origine), destra: `Pagina ${numero} di ${totale}` };
}

/**
 * Dove e quanto grande scrivere la filigrana perché stia SEMPRE dentro la pagina. Il testo è
 * ruotato di 45° e centrato: la sua ombra su ogni asse è (larghezza + 0,75 · corpo) · cos 45°.
 * Pura: riceve la larghezza del testo a corpo 100.
 */
export function posizioneFiligrana(larghezzaA100: number): { x: number; y: number; corpo: number; angoli: { x: number; y: number }[] } {
  const margine = 60;
  const disponibile = Math.min(PAGINA.larghezza, PAGINA.altezza) - margine;
  const k = larghezzaA100 / 100; // larghezza per unità di corpo
  const corpo = Math.min(70, disponibile / (Math.SQRT1_2 * (k + 0.75)));
  const larg = k * corpo;
  const c = Math.SQRT1_2; // cos 45° = sin 45°
  const cx = PAGINA.larghezza / 2;
  const cy = PAGINA.altezza / 2;
  const x = cx - (larg / 2) * c + (corpo / 3) * c;
  const y = cy - (larg / 2) * c - (corpo / 3) * c;
  // i quattro angoli del rettangolo del testo (larghezza × altezza ≈ 0,75 · corpo), dopo la rotazione
  const alt = corpo * 0.75;
  const punto = (u: number, v: number) => ({ x: x + u * c - v * c, y: y + u * c + v * c });
  return { x, y, corpo, angoli: [punto(0, 0), punto(larg, 0), punto(larg, alt), punto(0, alt)] };
}

const COLORI = { nero: rgb(0.06, 0.08, 0.1), grigio: rgb(0.35, 0.4, 0.44), rosso: rgb(0.62, 0.15, 0.12) };

/**
 * Il PDF. `data` è la data di creazione: si passa da fuori così il risultato si può provare.
 * Lancia solo per errori veri della libreria: ogni testo è già reso scrivibile.
 */
export async function generaPdf(doc: DocumentoContratto, opzioni: { data?: Date } = {}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normale: PDFFont = await pdf.embedFont(StandardFonts.Helvetica);
  const grassetto: PDFFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  const misura: Misura = (t, g, b) => (b ? grassetto : normale).widthOfTextAtSize(t, g);
  const pagine = impagina(doc, misura);

  const data = opzioni.data ?? new Date();
  pdf.setTitle(sanitizzaPerPdf(doc.titolo));
  pdf.setProducer("MatchAmI");
  pdf.setCreator("MatchAmI");
  pdf.setCreationDate(data);
  pdf.setModificationDate(data);
  pdf.setLanguage("it-IT");

  pagine.forEach((p, n) => {
    const pagina = pdf.addPage([PAGINA.larghezza, PAGINA.altezza]);

    // la filigrana va PRIMA: il testo ci sta sopra
    if (doc.bozza) {
      const f = posizioneFiligrana(grassetto.widthOfTextAtSize(TESTO_FILIGRANA, 100));
      pagina.drawText(TESTO_FILIGRANA, {
        x: f.x,
        y: f.y,
        size: f.corpo,
        font: grassetto,
        color: rgb(0.8, 0.8, 0.8),
        opacity: 0.45,
        rotate: degrees(45),
      });
    }

    for (const r of p.rettangoli) pagina.drawRectangle({ x: r.x, y: r.y, width: r.larghezza, height: r.altezza, color: rgb(0.99, 0.95, 0.86), borderColor: rgb(0.85, 0.7, 0.4), borderWidth: 0.8 });
    for (const l of p.linee) pagina.drawLine({ start: { x: l.x1, y: l.y }, end: { x: l.x2, y: l.y }, thickness: 0.7, color: COLORI.nero });
    for (const r of p.righe) pagina.drawText(r.testo, { x: r.x, y: r.y, size: r.grandezza, font: r.grassetto ? grassetto : normale, color: COLORI[r.colore] });

    const pie = piePagina(doc, n + 1, pagine.length);
    pagina.drawText(pie.sinistra, { x: MARGINE.sinistra, y: 34, size: 8, font: normale, color: COLORI.grigio });
    const larg = normale.widthOfTextAtSize(pie.destra, 8);
    pagina.drawText(pie.destra, { x: PAGINA.larghezza - MARGINE.destra - larg, y: 34, size: 8, font: normale, color: COLORI.grigio });
  });

  return pdf.save();
}
