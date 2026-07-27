# Catalogo Operatori a 6 livelli — LA BASE DEL DATABASE

> **TL;DR per ogni dev:** cosa è vendibile (brand, prodotti, offerte, opzioni)
> vive nelle tabelle `catalog_*` di Supabase e si amministra da
> **Amministrazione → Catalogo**. **Mai** aggiungere liste hardcoded di
> prodotti/offerte nel codice: il perimetro commerciale lo governa l'admin.

## Il modello (PDF "Schema 6 Livelli", Luca 07/2026)

Sei selezioni in cascata: **Brand › Tipo Cliente › Categoria › Prodotto ›
Offerta › Opzioni**.

| # | Livello | Selezione | Tabella |
|---|---------|-----------|---------|
| 1 | Brand (11 fissi) | singola | `catalog_brands` |
| 2 | Tipo Cliente (Consumer/Business) | singola | colonna su `catalog_prodotti` |
| 3 | Categoria (10, asse comune a tutti i brand) | singola | `catalog_categorie` |
| 4 | Prodotto | singola | `catalog_prodotti` |
| 5 | Offerta | **una sola per categoria** per vendita | `catalog_offerte` |
| 6 | Opzioni | **multipla** | `catalog_opzioni` |

Regole:
- Il **perimetro è chiuso**: se una combinazione non esiste a catalogo, non è
  vendibile. Niente fallback, niente "Altro" inventato dal codice.
- Le opzioni con `gruppo_singolo` valorizzato (es. `reload`) sono mutuamente
  esclusive tra loro sulla stessa offerta: se ne sceglie UNA.
- Le opzioni con `tipo = 'numero'` chiedono una quantità alla selezione
  (es. "Stanze Aggiuntive" su Sky TV Hotel).
- `attivo = false` a qualunque livello = la voce resta a catalogo (storico)
  ma NON è proponibile in vendita.
- `ordine` è l'ordine di presentazione deciso dall'admin: rispettarlo.

## Da dove vengono i dati

Seed generato automaticamente dall'artifatto `Schema_Catalogo_Base.jsx`
(copia di riferimento in `docs/Schema_Catalogo_Base.artifact.jsx.txt`),
migrazioni `091_catalogo_6livelli` + `092_catalogo_seed`:
**10 categorie · 11 brand · 132 prodotti · 649 offerte · 1.472 opzioni**,
verificati 1:1 contro l'artifatto.

L'artifatto contiene anche `CAMPI_REGOLE` (lo "strato dati": quali campi il
Registra Vendita chiede per ogni combinazione — Codice Inserimento, ICCID,
IMEI, POD/PDR, IBAN, …). NON è un settimo livello: verrà cablato quando il
Registra Vendita si aggancerà al catalogo.

## Regole per lo sviluppo

1. **Leggere sempre** `catalog_*` per popolare tendine/scelte commerciali
   (solo righe `attivo = true`, ordinate per `ordine`).
2. **Mai** modificare a mano le righe `catalog_*` in produzione: si fa da
   Amministrazione → Catalogo (admin). Le vostre migrazioni non devono
   toccare il contenuto di queste tabelle.
3. Il Registra Vendita è AGGANCIATO al catalogo (27/07): i gruppi/prodotti/
   offerte/opzioni del flusso arrivano da `catalog_*` per TUTTI i brand
   (Sky compreso) e i campi da compilare da `src/lib/catalogoVendita.ts`
   (`risolviCampi`, generato dall'artifatto — non modificarlo a mano).
   Le vendite nuove scrivono anche `contracts.tipo_cliente / offerta /
   opzioni` (mig. 093). I vecchi flussi per brand (getW3, getVF, FWMobile,
   blocco Sky…) restano nel file SOLO come riferimento storico: non
   ricollegarli e non aggiungere liste hardcoded.
4. Le vendite storiche in `contracts` verranno MAPPATE sul nuovo sistema in
   modo additivo (colonne/tabella di mappatura): non riscrivere mai
   `brand`/`prodotto` legacy.
