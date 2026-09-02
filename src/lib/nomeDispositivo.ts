/* ═══ IL NOME DI UN TELEFONO, SENZA RIPETERE LA MARCA ═════════════════════
   Luca 02/09, con la fotografia di «ZTE ZTE Blade A34»: «i ragazzi stanno
   ingressando degli usati nel modo sbagliato: nel campo modello vanno a
   scrivere il nome del prodotto ripetendo il brand».

   ⚠️ MISURATO: non lo scrivono. Il modello si sceglie da una tendina alimentata
   dal catalogo dispositivi, e sono le voci del CATALOGO a contenere già la
   marca — 4.563 su 40.133. Il nome finale si componeva come «marca + modello»
   senza guardare se la marca ci fosse già.

   ⚠️ E STA QUI, NON DENTRO UNA SCHERMATA. Scritta dentro Gestione Usati,
   restava fuori il posto che conta di più: il CONTRATTO CHE IL CLIENTE FIRMA,
   che ricompone marca e modello per conto suo e stampava ancora «ZTE ZTE Blade
   A34» sotto la firma. Nel repository convivevano cinque regole diverse per lo
   stesso problema: questa è quella buona. */

/** Marca + modello, ma senza ripetere la marca se il modello la porta già.
 *  ⚠️ Il confronto è su PAROLA INTERA e su parole successive, così le marche di
 *  due parole («Tecno Mobile», «Land Rover», «CMF by Nothing») funzionano come
 *  le altre — con la sola prima parola non combaciavano mai.
 *  «Apple» + «Apple Watch (38mm)» resta «Apple Watch (38mm)»: lì la marca fa
 *  parte del nome del prodotto, e toglierla sarebbe perdere informazione. */
export function nomeDispositivo(marca: string | null | undefined, modello: string | null | undefined): string {
    const b = String(marca || "").trim();
    const m = String(modello || "").trim();
    if (!b) return m || "Modello non specificato";
    if (!m) return b;
    /* i separatori che il catalogo usa davvero: spazio, underscore, trattino e
       punto — «ZTE_Blade_V1000» e «ZTE-V9VITA» erano 1.037 voci che con il solo
       spazio restavano doppie */
    const pezzi = (x: string) => x.split(/[\s_.\-]+/).filter(Boolean);
    const pb = pezzi(b).map((x) => x.toLowerCase());
    const pm = pezzi(m).map((x) => x.toLowerCase());
    if (pm.length >= pb.length && pb.every((x, i) => pm[i] === x)) return m;
    return `${b} ${m}`;
}
