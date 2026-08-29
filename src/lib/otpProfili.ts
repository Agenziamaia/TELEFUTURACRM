// COME SI RICONOSCE UN CODICE USA E GETTA (Luca 28/08 sera).
//
// Ogni operatore scrive la sua mail a modo suo. Un «profilo» dice due cose:
// da chi arriva la mail e dove sta il numero dentro al testo. Aggiungere un
// operatore nuovo = aggiungere una voce qui sotto, nient'altro.
//
// ⚠️ Perché i mittenti contano: senza, basterebbe che qualcuno mandasse alla
// casella una mail con dentro sei cifre per far comparire il «codice» a un
// collega. Si guarda SOLO la posta che arriva dagli indirizzi attesi.

export type ProfiloOtp = {
    id: string;
    nome: string;                 // come si chiama nel pannello
    descrizione: string;
    mittenti: string[];           // indirizzi (o domini) da cui accettiamo la mail
    /** i modi di leggere il numero, in ordine: vince il primo che trova */
    regole: RegExp[];
    /** quante cifre ha il codice: serve a scartare numeri di servizio */
    cifre: [number, number];
};

export const PROFILI_OTP: ProfiloOtp[] = [
    {
        id: "fastweb_core",
        nome: "Fastweb — sistemi core",
        descrizione: "«inserisci il seguente codice per autenticarti sui sistemi Fastweb: 425422.» — 6 cifre, da info@fastweb.it",
        mittenti: ["info@fastweb.it", "@fastweb.it"],
        regole: [
            /sistemi\s+fastweb\s*[:\-]?\s*(\d{4,8})/i,
            /seguente\s+codice[^0-9]{0,60}(\d{4,8})/i,
            /codice[^0-9]{0,40}(\d{6})\b/i,
        ],
        cifre: [6, 6],
    },
    {
        id: "fastweb_energia",
        nome: "Fastweb Energia — Area Agenti",
        descrizione: "«ecco l'OTP per l'accesso all'Area Agenti di Fastweb Energia» seguito dal numero — 4 cifre, da noreply@fastwebenergia.it",
        mittenti: ["noreply@fastwebenergia.it", "@fastwebenergia.it"],
        regole: [
            /area\s+agenti[^0-9]{0,120}?(\d{4,8})/i,
            /\botp\b[^0-9]{0,120}?(\d{4,8})/i,
            /^[^\S\n]*(\d{4,8})[^\S\n]*$/m,          // il numero da solo su una riga
        ],
        cifre: [4, 8],
    },
];

export const profiloOtp = (id: string | null | undefined): ProfiloOtp | null =>
    PROFILI_OTP.find((p) => p.id === id) || null;

/** Il mittente è uno di quelli attesi? (indirizzo pieno o dominio) */
export function mittenteAtteso(from: string, p: ProfiloOtp): boolean {
    const f = String(from || "").toLowerCase().trim();
    return p.mittenti.some((m) => (m.startsWith("@") ? f.endsWith(m) : f === m));
}

/* ── QUANDO LA MAIL ARRIVA INOLTRATA ────────────────────────────────────
   Alcune caselle non si collegano (Microsoft ha chiuso l'accesso con password)
   e la loro posta si fa INOLTRARE a una casella leggibile. Ma l'inoltro di
   Outlook RISCRIVE IL MITTENTE: la mail arriva da «Telefutura SRL» con oggetto
   «FW: OTP di autenticazione…», e il controllo del mittente la scartava —
   giustamente, perché non veniva più da Fastweb.

   Qui si accetta anche l'inoltro, ma SOLO se dentro al messaggio c'è ancora la
   prova che l'originale veniva dal fornitore: negli inoltri di Outlook le
   intestazioni originali restano scritte nel corpo («From: Fastweb
   <info@fastweb.it>»). Due condizioni insieme, non una:
     · l'oggetto dice che è un inoltro (FW:, Fwd:, I:)
     · nel corpo compare uno degli indirizzi attesi

   ⚠️ SI ABBASSA LA GUARDIA? Un po', ed è una scelta consapevole. Chi conoscesse
   l'indirizzo della casella potrebbe confezionare un finto inoltro e far
   comparire un codice sbagliato a un collega — che semplicemente non
   funzionerebbe. Non gli farebbe LEGGERE niente: il verso pericoloso è
   l'opposto, e quello resta chiuso. Il fastidio vale la casella sbloccata.

   Resta comunque meglio configurare l'inoltro come REINDIRIZZAMENTO, che il
   mittente lo conserva: in quel caso non si passa nemmeno di qui. */
const SEMBRA_INOLTRO = /^\s*(fw|fwd|i|r|tr)\s*:/i;

export function mittenteInoltrato(
    m: { fromAddr?: string | null; subject?: string | null; text?: string | null; html?: string | null },
    p: ProfiloOtp,
): boolean {
    if (!SEMBRA_INOLTRO.test(String(m.subject || ""))) return false;
    const corpo = `${m.text || ""} ${m.html || ""}`.toLowerCase();
    // solo gli indirizzi PIENI: un dominio da solo («@fastweb.it») comparirebbe
    // in troppi posti e non proverebbe niente
    return p.mittenti.some((x) => !x.startsWith("@") && corpo.includes(x.toLowerCase()));
}

/** Il mittente va bene: diretto dal fornitore, oppure inoltrato con la prova
 *  dell'originale dentro. */
export function mailAccettabile(
    m: { fromAddr?: string | null; subject?: string | null; text?: string | null; html?: string | null },
    p: ProfiloOtp,
): boolean {
    return mittenteAtteso(String(m.fromAddr || ""), p) || mittenteInoltrato(m, p);
}

/** Pesca il codice dal testo della mail. `null` se non c'è nulla di credibile:
 *  meglio dire «non l'ho trovato» che consegnare un numero a caso. */
export function estraiCodice(testo: string, p: ProfiloOtp): string | null {
    const t = String(testo || "").replace(/ /g, " ");
    for (const re of p.regole) {
        const m = re.exec(t);
        const n = m?.[1];
        if (n && n.length >= p.cifre[0] && n.length <= p.cifre[1]) return n;
    }
    return null;
}

/** L'oggetto della mail aiuta a riconoscerla anche quando il corpo è HTML
 *  strano: si prova prima il testo, poi l'oggetto. */
export function codiceDaMessaggio(
    m: { text?: string | null; html?: string | null; subject?: string | null },
    p: ProfiloOtp,
): string | null {
    const senzaTag = (s: string) => s.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ");
    for (const pezzo of [m.text, m.html ? senzaTag(m.html) : null, m.subject]) {
        if (!pezzo) continue;
        const c = estraiCodice(pezzo, p);
        if (c) return c;
    }
    return null;
}

/** La cartella dove il CRM mette da parte le mail dei codici, così spariscono
 *  dalla posta di chi lavora nel negozio (scelta di Luca, 28/08). */
export const CARTELLA_OTP = "Codici OTP";
