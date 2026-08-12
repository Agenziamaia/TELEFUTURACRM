import os
import re

file_path = r"e:\PRTFLIO\LUCA CRM\replica\src\app\(dashboard)\registra-contratto\page.tsx"
with open(file_path, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Fix imports
content = content.replace(
    """import { getDraft, saveDraft, clearDraft } from "@/lib/draft";""",
    ""
)

# 2. Add states for attachments and uploading
state_injection = """  const [toast,setToast]=useState("");
  const [uploading, setUploading] = useState(false);
  const [attachments, setAttachments] = useState([]);
"""
content = re.sub(r"const\s+\[toast,setToast\]\s*=\s*useState\(\"\"\);", state_injection, content)

# 3. Handle File Change
handle_file_change = """
  const handleFileChange = (e, type) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        file,
        name: file.name,
        type
      }));
      setAttachments(prev => [...prev, ...newFiles]);
    }
  };
"""
content = content.replace("const doLookup=()=>{setClienteFound", handle_file_change + "\n  const doLookup=()=>{setClienteFound")

# 4. Replace doLookup
old_doLookup = """const doLookup=()=>{setClienteFound(true);setShowAna(true);setShowStep4(false);setAna({nome:"Mario",cognome:"Rossi",cellulare:"333 1234567",email:"mario.rossi@email.com",via:"Via Roma 15",cap:"00100",citta:"Roma",ragioneSociale:"Rossi S.r.l.",nomeRef:"Mario",cognomeRef:"Rossi",recapito:"333 1234567"})};"""
new_doLookup = """const doLookup = async () => {
    if (!lookupValue) return;
    try {
      const { data, error } = await supabase
        .from("clients")
        .select("*")
        .eq("cf_piva", lookupValue)
        .maybeSingle();
      if (error) throw error;
      if (data) {
        setClienteFound(true);
        setShowAna(true);
        setShowStep4(false);
        setAna({
          nome: data.nome || "",
          cognome: data.cognome || "",
          cellulare: data.cellulare || "",
          email: data.email || "",
          via: data.indirizzo || "",
          cap: data.cap || "",
          citta: data.citta || "",
          ragioneSociale: data.ragione_sociale || "",
          nomeRef: data.nome_ref || "",
          cognomeRef: data.cognome_ref || "",
          recapito: data.cellulare || ""
        });
        sT("✓ Cliente trovato nel database");
      } else {
        setClienteFound(false);
        setShowAna(true);
        setShowStep4(false);
        sT("⚠️ Cliente non trovato, inserimento manuale");
      }
    } catch (err) {
      console.error("Lookup error:", err);
      sT("❌ Errore ricerca cliente");
    }
  };"""
content = content.replace(old_doLookup, new_doLookup)

# 5. Replace finalSubmit
old_finalSubmit_regex = r"const finalSubmit=\(\)=>\{const cur=colItems\(\);const fc=\[\.\.\.cart\];if.*?setTimeout\(fullReset,2000\)};"
new_finalSubmit = """const finalSubmit = async () => {
    const cur = colItems();
    const fc = [...cart];
    if (cur.length > 0 && bObj) {
      fc.push({
        brandId: brand,
        brandLabel: bObj.label,
        brandIcon: bObj.icon,
        brandColor: bObj.color,
        items: cur,
        sv: { sales: JSON.parse(JSON.stringify(sales)), sesCode, skyS: JSON.parse(JSON.stringify(skyS)) }
      });
    }

    if (fc.length === 0 && margItems.length === 0) {
      sT("⚠️ Nessun prodotto da salvare");
      return;
    }

    try {
      // 1. Client Upsert
      const clientId = lookupValue || `CL-${Date.now()}`;
      const clientData = {
        id: clientId,
        tipo: tipoCliente === "privato" ? "consumer" : "business",
        nome: ana.nome || "",
        cognome: ana.cognome || "",
        ragione_sociale: ana.ragioneSociale || "",
        cellulare: ana.cellulare || "",
        email: ana.email || "",
        cf_piva: lookupValue || "",
        indirizzo: ana.via || "",
        citta: ana.citta || "",
        is_demo: false
      };

      const { error: clientErr } = await supabase.from("clients").upsert(clientData, { onConflict: "id" });
      if (clientErr) throw clientErr;

      // 1.5 Upload Attachments
      setUploading(true);
      const uploadedFiles = [];
      for (const att of attachments) {
        const fileExt = att.name.split(".").pop();
        const fileName = `${clientId}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `contracts/${fileName}`;

        const { error: uploadErr } = await supabase.storage
          .from("contracts")
          .upload(filePath, att.file);

        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from("contracts").getPublicUrl(filePath);
          uploadedFiles.push({ contract_id: "", url: publicUrl, name: att.name, type: att.type });
        }
      }

      // 2. Prepare Contract Rows
      const contractRows = [];
      const dateStr = new Date().toLocaleDateString("it-IT");

      fc.forEach(group => {
        (group.items || []).forEach((item) => {
          const actCode = item.details["Codice Contratto"] || item.details["Codice Proposta"] || item.details["Codice Ordine"] || item.details["Codice"] || "—";
          contractRows.push({
            id: `CTR-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
            client_id: clientId,
            data: dateStr,
            brand: group.brandLabel,
            categoria: item.macro,
            prodotto: item.sub,
            stato: "Attivo",
            venditore: selVend,
            negozio: selNeg,
            codice_attivazione: String(actCode),
            data_registrazione: dateStr,
            data_attivazione: dateStr,
            dettagli: item.details || {},
            is_demo: false
          });
        });
      });

      margItems.forEach(mi => {
        contractRows.push({
          id: `EXT-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
          client_id: clientId,
          data: dateStr,
          brand: "Extra",
          categoria: "Prodotto/Servizio",
          prodotto: mi.product,
          stato: "Attivo",
          venditore: mi.vendor || selVend,
          negozio: mi.store || selNeg,
          codice_attivazione: "VENDITA-DIRETTA",
          data_registrazione: dateStr,
          data_attivazione: dateStr,
          is_demo: false
        });
      });

      if (contractRows.length > 0) {
        const { data: createdContracts, error: contractErr } = await supabase.from("contracts").insert(contractRows).select();
        if (contractErr) throw contractErr;

        if (uploadedFiles.length > 0 && createdContracts && createdContracts.length > 0) {
          const firstContractId = createdContracts[0].id;
          const attendanceRows = uploadedFiles.map(f => ({
            contract_id: firstContractId,
            file_url: f.url,
            file_name: f.name,
            file_type: f.type
          }));
          const { error: attErr } = await supabase.from("contract_attachments").insert(attendanceRows);
          if (attErr) console.error("Attachment Meta Error:", attErr);
        }
      }

      setUploading(false);
      sT(`✅ Salvato! ${fc.length} brand, ${contractRows.length} prodotti in totale`);
      setTimeout(fullReset, 2000);
    } catch (err) {
      setUploading(false);
      console.error("Submit Error:", err);
      sT("❌ Errore durante il salvataggio: " + (err.message || "Verifica connessione"));
    }
  };"""
content = re.sub(old_finalSubmit_regex, new_finalSubmit, content)

# 6. Handle Download PDF
handle_download_pdf = """
  const handleDownloadPDF = async () => {
    try {
      const pdfBytes = await generateContractPDF(ana, cart, margItems);
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUri = reader.result;
        const link = document.createElement("a");
        const cleanNome = (ana.nome || "Cliente").trim().replace(/\s+/g, "_");
        const cleanCognome = (ana.cognome || "Sconosciuto").trim().replace(/\s+/g, "_");
        const filename = `Contratto_${cleanNome}_${cleanCognome}.pdf`;
        link.href = dataUri;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        sT("✓ PDF generato e scaricato");
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.error("PDF Error:", err);
      sT("? Errore generazione PDF");
    }
  };
"""
content = handle_download_pdf + "\n" + content

# 7. Add Cart Uploading UI
uploading_ui = """
        <div style={{padding:"24px",background:"var(--glass)",borderRadius:16,border:"1px solid var(--border)",marginBottom:24,borderLeft:"4px solid #00d2ff",position:"relative"}}>
          {uploading && <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.5)",zIndex:50,display:"flex",alignItems:"center",justifyContent:"center",borderRadius:16}}><div style={{color:"#00d2ff",fontWeight:800,fontSize:14}}>CARICAMENTO IN CORSO...</div></div>}
          <div style={{fontSize:11,fontWeight:800,color:"#00d2ff",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:16}}>📎 Step 5 — Allegati</div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(200px, 1fr))",gap:16}}>
            {[{ l: "Documento", i: "🪪", t: "identity" }, { l: "Contratti", i: "📄", t: "contract" }, { l: "Altro", i: "📎", t: "other" }].map((a, i) => (
              <label key={i} style={{border:"2px dashed rgba(255,255,255,0.1)",borderRadius:12,padding:20,textAlign:"center",cursor:"pointer",background:"rgba(255,255,0,0.02)",display:"flex",flexDirection:"column",alignItems:"center"}}>
                <input type="file" multiple style={{display:"none"}} onChange={(e) => handleFileChange(e, a.t)} />
                <div style={{fontSize:28,marginBottom:8}}>{a.i}</div>
                <div style={{fontSize:14,fontWeight:700,color:"#e2e8f0",marginBottom:8}}>{a.l}</div>
                <div style={{display:"flex",flexWrap:"wrap",justifyContent:"center",gap:4,marginBottom:8}}>
                  {attachments.filter(at => at.type === a.t).map((at, ii) => (
                    <span key={ii} style={{padding:"2px 8px",borderRadius:4,background:"rgba(0, 210, 255, 0.2)",color:"#00d2ff",fontSize:10,fontWeight:700,maxWidth:80,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{at.name}</span>
                  ))}
                </div>
                <span style={{display:"inline-block",padding:"6px 16px",borderRadius:8,background:"#00d2ff",color:"#000",fontSize:12,fontWeight:800}}>Carica Files</span>
              </label>
            ))}
          </div>
        </div>
"""
content = re.sub(r"(<div style=\{\{display:\"flex\",gap:12,marginTop:24,flexWrap:\"wrap\",alignItems:\"center\"\}\}>)", uploading_ui + r"\1", content)

# 8. Add PDF download button
pdf_btn = """<button onClick={handleDownloadPDF} disabled={!ana.nome && cart.length === 0} style={{padding:"11px 26px",borderRadius:10,border:"1px solid rgba(99, 102, 241, 0.3)",background:"rgba(99, 102, 241, 0.1)",color:"#818cf8",fontSize:13,fontWeight:700,cursor:(ana.nome || cart.length > 0) ? "pointer":"not-allowed",display:"flex",alignItems:"center",gap:8,opacity:(ana.nome || cart.length > 0)?1:0.5}}>Scarica PDF</button>"""
content = re.sub(r"(<button onClick=\{\(\)=>setShowCart\(false\)\}.*?</button>)", r"\1\n" + pdf_btn, content)

with open(file_path, "w", encoding="utf-8") as f:
    f.write(content)
print("done")
