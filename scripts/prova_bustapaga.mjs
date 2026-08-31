/* La prova del lettore del saldo ferie. `node scripts/prova_bustapaga.mjs`.
   Ogni caso qui dentro è un modo vero in cui un cedolino può essere scritto:
   se domani il consulente cambia impaginazione, questa prova lo dice prima
   che un numero sbagliato finisca nella tabella delle ferie. */
/* si legge il modulo VERO (node sa togliere i tipi da solo): una copia
   riscritta a mano proverebbe un'altra funzione, non questa */
const { saldoFerieDaTesto } = await import("../src/lib/bustaPaga.ts");

const R = "RATEI\n Residuo AP Maturato Goduto Saldo\n";
const casi = [
    ["saldo semplice",                 R+"FERIE 4,33333 4,33333 GG.",                    4.33333],
    ["l'esempio di Luca",              R+"FERIE 4,3 GG.",                                4.3],
    ["quattro colonne piene",          R+"FERIE 2,00 3,00 0,66667 4,33333 GG.",          4.33333],
    ["colonna DOPO l'unità",           R+"FERIE 4,33333 GG. 26",                         4.33333],
    ["importo dopo l'unità",           R+"FERIE 4,33333 GG. 1.234,56",                   4.33333],
    ["ore dopo l'unità",               R+"FERIE 4,33333 GG. 34,66 ORE",                  4.33333],
    ["SALDO NEGATIVO",                 R+"FERIE -2,50000 GG.",                           -2.5],
    ["punto decimale",                 R+"FERIE 4.33333 GG.",                            4.33333],
    ["migliaia vere",                  R+"FERIE 1.234,50 GG.",                           null],
    ["ferie godute sotto",             R+"FERIE 4,33333 GG.\nFERIE GODUTE ANNO PREC 12,00 GG.", 4.33333],
    ["ferie residue anni prec sotto",  R+"FERIE 4,33333 GG.\nFERIE RESIDUE ANNI PREC. 1,50 GG.", 4.33333],
    ["riga permessi in ore",           R+"FERIE 4,33333 GG.\nPerm.Ex-Fs 5,33333 ORE",    4.33333],
    ["SOLO la riga in ore",            R+"FERIE 5,33333 ORE",                            null],
    ["ferie in ore, giorni sopra",     R+"FERIE 4,33333 GG.\nFERIE 34,66 ORE",           4.33333],
    ["zero",                           R+"FERIE 0,00 GG.",                               0],
    ["niente riga ferie",              R+"Perm.Ex-Fs 5,33333 ORE",                       null],
    ["frammenti separati",             R+"FERIE\n4,33333\nGG.",                          null],
];
let ko = 0;
for (const [nome, testo, atteso] of casi) {
    const r = saldoFerieDaTesto(testo);
    const ok = r.giorni === atteso;
    if (!ok) ko++;
    console.log(`${ok ? "✓" : "✗"} ${nome.padEnd(30)} → ${String(r.giorni).padEnd(10)} (atteso ${atteso})${r.motivo ? "  · " + r.motivo : ""}`);
}
console.log(ko ? `\n${ko} casi su ${casi.length} NON passano` : `\nTutti e ${casi.length} i casi passano.`);
process.exit(ko ? 1 : 0);
