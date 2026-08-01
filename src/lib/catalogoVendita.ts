/**
 * STRATO DATI del Registra Vendita — GENERATO dall'artifatto Schema_Catalogo_Base
 * (Luca 27/07/2026, copia in docs/Schema_Catalogo_Base.artifact.jsx.txt).
 * Regole: data la selezione a 6 livelli (brand, tipo cliente, categoria,
 * prodotto, offerta, opzioni ATTIVE) producono l'elenco dei CAMPI che il
 * flusso di vendita richiede. Una regola si applica se TUTTE le sue
 * condizioni valgono; i campi si sommano senza duplicati.
 * NON è un settimo livello del catalogo: è la replica dei campi del CRM.
 * NON MODIFICARE A MANO le regole: si rigenerano dall'artifatto.
 */

export interface CampoVendita {
    nome: string;
    tipo: "testo" | "numero" | "data" | "scelta";
    nota: string;
    conferma: boolean;
    /** true = il campo NON blocca il completamento (Luca 02/08: ICCID
     *  facoltativo su FWA W3 Business); si imposta dalle regole a DB */
    facoltativo?: boolean;
}

interface Regola {
    brand?: string[];
    tipo?: string[];
    categoria?: string[];
    prodotto?: string[];
    offertaContiene?: string[];
    offertaNon?: string[];
    opzioni?: string[];
    campi: CampoVendita[];
}

export const CAMPI_REGOLE: Regola[] = [
  {
    "campi": [
      {
        "nome": "Codice Inserimento",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "brand": [
      "windtre"
    ],
    "categoria": [
      "Mobile Wallet",
      "Mobile Ric. Auto",
      "Telefono a Rate",
      "Fisso",
      "Energia",
      "Multi-Servizi"
    ],
    "campi": [
      {
        "nome": "Codice Contratto",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "categoria": [
      "Mobile Wallet",
      "Mobile Ric. Auto"
    ],
    "prodotto": [
      "Mobile GA"
    ],
    "campi": [
      {
        "nome": "Numero di Cellulare",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      },
      {
        "nome": "Seriale SIM (ICCID)",
        "tipo": "testo",
        "nota": "19 cifre",
        "conferma": false
      }
    ]
  },
  {
    "categoria": [
      "Mobile Wallet",
      "Mobile Ric. Auto"
    ],
    "prodotto": [
      "Mobile MNP"
    ],
    "campi": [
      {
        "nome": "Numero Provvisorio",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      },
      {
        "nome": "Numero Definitivo",
        "tipo": "testo",
        "nota": "il numero che si porta",
        "conferma": false
      },
      {
        "nome": "Operatore di Provenienza",
        "tipo": "scelta",
        "nota": "",
        "conferma": false
      },
      {
        "nome": "Seriale SIM (ICCID)",
        "tipo": "testo",
        "nota": "19 cifre",
        "conferma": false
      }
    ]
  },
  {
    "categoria": [
      "Telefono a Rate"
    ],
    "campi": [
      {
        "nome": "Numero di Cellulare",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      },
      {
        "nome": "IMEI",
        "tipo": "testo",
        "nota": "15 cifre",
        "conferma": false
      },
      {
        "nome": "Modello Terminale",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      },
      {
        "nome": "Importo Rata",
        "tipo": "numero",
        "nota": "in euro",
        "conferma": true
      }
    ]
  },
  {
    "categoria": [
      "Telefono a Rate"
    ],
    "prodotto": [
      "Finanziato",
      "Finanziato CB"
    ],
    "campi": [
      {
        "nome": "Codice Pratica Finanziamento",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "categoria": [
      "Fisso"
    ],
    "campi": [
      {
        "nome": "Numero Fisso Provvisorio",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      },
      {
        "nome": "Numero Fisso Definitivo",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "categoria": [
      "Fisso"
    ],
    "prodotto": [
      "FWA"
    ],
    "campi": [
      {
        "nome": "Seriale SIM (ICCID)",
        "tipo": "testo",
        "nota": "19 cifre, SIM del router",
        "conferma": false
      }
    ]
  },
  {
    "offertaContiene": [
      "Indoor"
    ],
    "campi": [
      {
        "nome": "IMEI",
        "tipo": "testo",
        "nota": "15 cifre, dispositivo FWA",
        "conferma": false
      }
    ]
  },
  {
    "offertaContiene": [
      "Conv",
      "Con Super Fibra"
    ],
    "campi": [
      {
        "nome": "Numero Fisso di Convergenza",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "opzioni": [
      "GNP"
    ],
    "campi": [
      {
        "nome": "Operatore GNP",
        "tipo": "scelta",
        "nota": "",
        "conferma": false
      },
      {
        "nome": "Numero Fisso da Portare",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "opzioni": [
      "Linea Aggiuntiva"
    ],
    "campi": [
      {
        "nome": "N. Fisso Portabilità 2° Linea",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "categoria": [
      "Energia"
    ],
    "campi": [
      {
        "nome": "Operatore di Provenienza",
        "tipo": "scelta",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "categoria": [
      "Energia"
    ],
    "prodotto": [
      "Luce"
    ],
    "campi": [
      {
        "nome": "POD",
        "tipo": "testo",
        "nota": "codice punto di prelievo",
        "conferma": false
      }
    ]
  },
  {
    "categoria": [
      "Energia"
    ],
    "prodotto": [
      "Gas"
    ],
    "campi": [
      {
        "nome": "PDR",
        "tipo": "testo",
        "nota": "14 cifre",
        "conferma": false
      }
    ]
  },
  {
    "opzioni": [
      "RID"
    ],
    "campi": [
      {
        "nome": "IBAN",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "categoria": [
      "Sostituzione SIM"
    ],
    "campi": [
      {
        "nome": "Numero di Cellulare",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      },
      {
        "nome": "ICCID Nuova SIM",
        "tipo": "testo",
        "nota": "19 cifre",
        "conferma": false
      },
      {
        "nome": "Codice Contratto",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "categoria": [
      "TV"
    ],
    "campi": [
      {
        "nome": "Codice Contratto",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "categoria": [
      "Customer Base"
    ],
    "campi": [
      {
        "nome": "Numero di Cellulare",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "tipo": [
      "Consumer"
    ],
    "categoria": [
      "Customer Base"
    ],
    "offertaNon": [
      "CL0",
      "CL1",
      "CL2",
      "CL3"
    ],
    "campi": [
      {
        "nome": "Codice Contratto",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "tipo": [
      "Business"
    ],
    "categoria": [
      "Customer Base"
    ],
    "campi": [
      {
        "nome": "Codice Contratto",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "opzioni": [
      "Reload Open"
    ],
    "campi": [
      {
        "nome": "IMEI",
        "tipo": "testo",
        "nota": "15 cifre",
        "conferma": false
      }
    ]
  },
  {
    "prodotto": [
      "Kasko Facile"
    ],
    "campi": [
      {
        "nome": "Seriale Kasko",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      },
      {
        "nome": "IMEI Dispositivo",
        "tipo": "testo",
        "nota": "15 cifre",
        "conferma": false
      },
      {
        "nome": "Modello Terminale",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      },
      {
        "nome": "Numero di Cellulare",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "prodotto": [
      "Verisure",
      "Vodafone Care"
    ],
    "campi": [
      {
        "nome": "Numero di Telefono",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "prodotto": [
      "Telepass"
    ],
    "campi": [
      {
        "nome": "Seriale Telepass",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      },
      {
        "nome": "Recapito",
        "tipo": "testo",
        "nota": "",
        "conferma": false
      }
    ]
  },
  {
    "opzioni": [
      "Twin"
    ],
    "campi": [
      {
        "nome": "Seriale Telepass Twin",
        "tipo": "testo",
        "nota": "",
        "conferma": true
      }
    ]
  },
  {
    "categoria": [
      "POS"
    ],
    "campi": [
      {
        "nome": "Matricola POS",
        "tipo": "testo",
        "nota": "",
        "conferma": true
      },
      {
        "nome": "IBAN di Accredito",
        "tipo": "testo",
        "nota": "",
        "conferma": true
      }
    ]
  },
  {
    "prodotto": [
      "Assicurazioni"
    ],
    "campi": [
      {
        "nome": "Data Decorrenza",
        "tipo": "data",
        "nota": "",
        "conferma": true
      }
    ]
  }
];

/** Campi richiesti per la selezione corrente (fedele all'artifatto). */
export function risolviCampi(
    brandId: string,
    tipoCliente: string,
    categoria: string,
    prodottoNome: string,
    offertaNome: string,
    opzNomi: string[],
): CampoVendita[] {
    const out: CampoVendita[] = [];
    const visti: Record<string, boolean> = {};
    CAMPI_REGOLE.forEach((r) => {
        if (r.brand && r.brand.indexOf(brandId) === -1) return;
        if (r.tipo && r.tipo.indexOf(tipoCliente) === -1) return;
        if (r.categoria && r.categoria.indexOf(categoria) === -1) return;
        if (r.prodotto && r.prodotto.indexOf(prodottoNome) === -1) return;
        if (r.offertaNon && r.offertaNon.indexOf(offertaNome) !== -1) return;
        if (r.offertaContiene) {
            const low = (offertaNome || "").toLowerCase();
            if (!r.offertaContiene.some((s) => low.indexOf(s.toLowerCase()) !== -1)) return;
        }
        if (r.opzioni) {
            if (!r.opzioni.some((o) => opzNomi.indexOf(o) !== -1)) return;
        }
        r.campi.forEach((cmp) => {
            if (visti[cmp.nome]) return;
            visti[cmp.nome] = true;
            out.push(cmp);
        });
    });
    return out;
}

/** id brand della pagina Registra Vendita -> slug del catalogo (tabelle catalog_*). */
export const SLUG_CATALOGO: Record<string, string> = {
    windtre: "windtre", vodafone: "vodafone", fastweb: "fastweb", iliad: "iliad",
    sky: "sky", energy: "s4", dojo: "dojo", tim: "tim", very: "very", ho: "ho", kena: "kena",
};

/** Categoria del catalogo -> macro-categoria canonica (tassonomia.ts), ESPLICITA:
 *  niente inferenza per parole chiave sulle vendite nuove (perimetro chiuso). */
export const CAT_MACRO_ID: Record<string, string> = {
    "Mobile Wallet": "mobile",
    "Mobile Ric. Auto": "mobile",
    "Telefono a Rate": "mobile",
    "Sostituzione SIM": "mobile",
    "Fisso": "fisso",
    "Energia": "energia",
    "TV": "tv",
    "Multi-Servizi": "multi_servizi",
    "POS": "pos",
    "Customer Base": "cb",
};
