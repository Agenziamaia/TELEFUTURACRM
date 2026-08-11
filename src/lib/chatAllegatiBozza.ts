/**
 * BOZZE ALLEGATI CHAT (Luca 07/08): il testo della bozza sopravvive via
 * localStorage, gli allegati morivano con lo smontaggio della pagina.
 * localStorage non regge i binari → IndexedDB (structured clone dei Blob,
 * niente base64), wrapper minimo senza librerie.
 *
 * Una riga per conversazione (id = `${uid}:${convId}`): si riscrive solo la
 * bozza della chat corrente, mai i blob delle altre. Fallback SILENZIOSO
 * ovunque (SSR, navigazione privata, quota piena): al peggio la bozza
 * allegati non si conserva, come prima — mai un errore in faccia all'utente.
 */

const DB_NAME = "tf_chat";
const STORE = "bozze_allegati";
const MAX_FILE = 25 * 1024 * 1024;      // 25 MB per file
const MAX_TOTALE = 50 * 1024 * 1024;    // 50 MB per conversazione
const MAX_FILES = 10;
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 giorni

type RigaBozza = {
    id: string; uid: string; convId: string; savedAt: number;
    files: { name: string; type: string; lastModified: number; blob: Blob }[];
};

function apriDb(): Promise<IDBDatabase | null> {
    if (typeof indexedDB === "undefined") return Promise.resolve(null);
    return new Promise((resolve) => {
        try {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => resolve(null);
        } catch { resolve(null); }
    });
}

export async function salvaAllegatiBozza(uid: string, convId: string, files: File[]): Promise<void> {
    const db = await apriDb();
    if (!db) return;
    try {
        // oltre soglia: non si persiste quel file (resta in RAM per l'invio corrente)
        let tot = 0;
        const salvabili = files.slice(0, MAX_FILES).filter(f => {
            if (f.size > MAX_FILE || tot + f.size > MAX_TOTALE) return false;
            tot += f.size; return true;
        });
        const riga: RigaBozza = {
            id: `${uid}:${convId}`, uid, convId, savedAt: Date.now(),
            files: salvabili.map(f => ({ name: f.name, type: f.type, lastModified: f.lastModified, blob: f })),
        };
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put(riga);
    } catch { /* quota piena o storage negato: la bozza allegati salta, il resto vive */ }
    finally { db.close(); }
}

export async function leggiAllegatiBozza(uid: string, convId: string): Promise<File[]> {
    const db = await apriDb();
    if (!db) return [];
    try {
        const riga = await new Promise<RigaBozza | undefined>((resolve) => {
            const req = db.transaction(STORE, "readonly").objectStore(STORE).get(`${uid}:${convId}`);
            req.onsuccess = () => resolve(req.result as RigaBozza | undefined);
            req.onerror = () => resolve(undefined);
        });
        if (!riga || Date.now() - riga.savedAt > TTL_MS) return [];
        return riga.files.map(f => new File([f.blob], f.name, { type: f.type, lastModified: f.lastModified }));
    } catch { return []; }
    finally { db.close(); }
}

export async function cancellaAllegatiBozza(uid: string, convId: string): Promise<void> {
    const db = await apriDb();
    if (!db) return;
    try { db.transaction(STORE, "readwrite").objectStore(STORE).delete(`${uid}:${convId}`); }
    catch { /* niente da fare */ }
    finally { db.close(); }
}

/** Pulizia al montaggio: via le bozze allegati più vecchie del TTL (dell'utente). */
export async function pulisciBozzeAllegatiVecchie(uid: string): Promise<void> {
    const db = await apriDb();
    if (!db) return;
    try {
        const tx = db.transaction(STORE, "readwrite");
        const store = tx.objectStore(STORE);
        const req = store.getAll();
        req.onsuccess = () => {
            (req.result as RigaBozza[] || []).forEach(r => {
                if (r.uid === uid && Date.now() - r.savedAt > TTL_MS) store.delete(r.id);
            });
        };
    } catch { /* niente */ }
    finally { db.close(); }
}
