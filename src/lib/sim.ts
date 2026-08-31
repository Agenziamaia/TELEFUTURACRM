// IL CARATTERE DELLA SIM, senza niente attorno.
//
// Vive in un file suo — non dentro il componente — perché lo usano anche le
// librerie che non disegnano nulla (`tassonomia.ts`, i cataloghi) e che non
// devono tirarsi dietro React per una costante di due byte.
//
// In Unicode la SIM card NON ESISTE: nessun carattere la disegna, e le più
// vicine (💳 carta, 🪪 tessera, 📇 rubrica) nel CRM significano già altro. Nel
// DATO resta 📶, che qui è già il segno della SIM da prima (categoria «SIM»
// della marginalità, regole del catalogo cassa); a disegnarla ci pensa
// `IconaSim`, e il ponte fra le due è `conSim()`.
export const SIM_TESTO = "📶";
