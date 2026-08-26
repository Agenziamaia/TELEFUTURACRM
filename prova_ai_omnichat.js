// SOLA LETTURA su DeepSeek — perché l'assistente dell'Omnichat risponde
// "senza testo" (Luca 27/08). Manda la STESSA richiesta della route e stampa
// la risposta grezza: così si vede se il vuoto è del modello o nostro.
const fs = require("fs");
const path = require("path");

const env = Object.fromEntries(fs.readFileSync(path.join(__dirname, ".env.local"), "utf8")
  .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
  .map(l => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]));

const SISTEMA = [
  "Sei l'assistente di un negozio di telefonia italiano (Telefutura). Un venditore ha davanti",
  "una conversazione con un contatto e ha pochi secondi per capire cosa fare.",
  "",
  "Rispondi SOLO con un oggetto JSON, senza testo intorno e senza blocchi di codice:",
  '{"recap": "...", "analisi": "...", "risposte": ["...", "...", "..."]}',
].join("\n");

const UTENTE = [
  "Canale: WhatsApp. Contatto: Rita (Non Registrato).",
  "Non è nei nostri clienti: non sappiamo altro.",
  "",
  "Conversazione (dal più vecchio al più recente):",
  "NOI: Salve sono Francesco",
  "LORO: [il cliente ha mandato un'immagine]",
  "NOI: Salve signora Rita è un normalissimo messaggio ci vediamo il 20 settembre a presto",
  "LORO: Grazie, a presto",
].join("\n");

(async () => {
  for (const [etichetta, extra] of [
    ["con response_format json_object", { response_format: { type: "json_object" } }],
    ["senza response_format", {}],
  ]) {
    const res = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.DEEPSEEK_API_KEY}` },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [{ role: "system", content: SISTEMA }, { role: "user", content: UTENTE }],
        max_tokens: 3000, temperature: 0.2, ...extra,
      }),
    });
    const txt = await res.text();
    console.log(`\n══ ${etichetta} — HTTP ${res.status}`);
    try {
      const d = JSON.parse(txt);
      const ch = d?.choices?.[0];
      console.log("finish_reason:", ch?.finish_reason);
      console.log("chiavi di message:", ch?.message ? Object.keys(ch.message) : "(niente)");
      console.log("content:", JSON.stringify(ch?.message?.content ?? null));
      if (ch?.message?.reasoning_content) console.log("reasoning (primi 200):", String(ch.message.reasoning_content).slice(0, 200));
      console.log("usage:", JSON.stringify(d?.usage));
    } catch { console.log("risposta non JSON:", txt.slice(0, 400)); }
  }
})();
