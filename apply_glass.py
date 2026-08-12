import os, re

target_file = "src/app/(dashboard)/registra-contratto/page.tsx"

with open(target_file, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Main outer blocks (the steps)
# Old theme_patch made them: background:"rgba(255,255,255,0.02)"
# They look like: <div style={{background:"rgba(255,255,255,0.02)",borderRadius:10,padding:16,marginBottom:10,borderLeft:...}}>
content = re.sub(
    r'style={{background:"rgba\(255,255,255,0\.02\)",borderRadius:([0-9]+),padding:([0-9]+),marginBottom:([0-9]+)',
    r'className="glass-card mb-6 p-6" style={{',
    content
)

# 2. Inner blocks (e.g. Sales)
# They look like: background:"rgba(255,255,255,0.03)",borderLeft:
# Or: background:"rgba(255,255,255,0.04)"
content = re.sub(
    r'style={{padding:12,borderRadius:8,marginBottom:6,background:"rgba\(255,255,255,0\.03\)"',
    r'className="glass-panel mb-4 p-4" style={{',
    content
)
content = re.sub(
    r'style={{background:"rgba\(255,255,255,0\.04\)",borderRadius:8,padding:10,marginBottom:14',
    r'className="glass-panel mb-6 p-4" style={{',
    content
)
content = re.sub(
    r'style={{background:"rgba\(255,255,255,0\.03\)",borderRadius:8,padding:14',
    r'className="glass-panel mb-4 p-4" style={{',
    content
)

# 3. Inputs
content = re.sub(
    r'style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba\(255,255,255,0\.1\)",fontSize:12,boxSizing:"border-box"}}',
    r'className="glass-input w-full"',
    content
)
content = re.sub(
    r'style={{flex:1,padding:"10px 12px",borderRadius:8,border:"1px solid rgba\(255,255,255,0\.1\)",fontSize:14,fontFamily:"monospace",letterSpacing:1\.2}}',
    r'className="glass-input flex-1 font-mono tracking-wider text-sm"',
    content
)
content = re.sub(
    r'style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid rgba\(0,114,198,0\.3\)",fontSize:12,boxSizing:"border-box"}}',
    r'className="glass-input w-full border-blue-500/30"',
    content
)

# 4. Selects (with extra mt)
content = re.sub(
    r'style={{width:"100%",padding:"8px 10px",borderRadius:8,border:"1px solid rgba\(255,255,255,0\.1\)",fontSize:13,background:"rgba\(255,255,255,0\.02\)",boxSizing:"border-box",marginTop:4}}',
    r'className="glass-input w-full mt-1 bg-white/5"',
    content
)

content = re.sub(
    r'style={{padding:"6px 10px",borderRadius:6,border:"1px solid rgba\(0,114,198,0\.3\)",fontSize:12,fontWeight:600,background:"rgba\(255,255,255,0\.02\)",minWidth:140}}',
    r'className="glass-input min-w-[140px] font-bold border-blue-500/30 bg-white/5"',
    content
)

# 5. Top bar
content = re.sub(
    r'style={{background:bG,borderRadius:12,padding:"14px 20px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}',
    r'className="glass-card mb-6 p-5 flex items-center justify-between" style={{background:bG}}',
    content
)


# -------- ENHANCE "NEW CUSTOMER" UX --------
# Change the old "Non trovato" to "New Customer" mode
content = content.replace(
    'showToast("⚠️ Cliente non trovato, inserimento manuale");',
    'showToast("✨ Cliente non trovato: Modalità acquisizione nuovo cliente attivata");'
)

# Add badge in the Anagrafica header:
old_header = r'<div style={{fontSize:11,fontWeight:700,color:"#1B3A5C",marginBottom:14,textTransform:"uppercase"}}>📝 Step 3 — Anagrafica</div>'
new_header = r"""<div style={{display:"flex", alignItems:"center", gap:"12px", marginBottom:14}}>
          <div style={{fontSize:11,fontWeight:700,color:"#38bdf8",textTransform:"uppercase"}}>📝 Step 3 — Anagrafica</div>
          {!clienteFound && <span className="bg-emerald-500/20 text-emerald-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-emerald-500/30 animate-pulse">✨ NUOVO CLIENTE - Inserisci Dati</span>}
          {clienteFound && <span className="bg-blue-500/20 text-blue-400 text-[10px] font-black px-2 py-0.5 rounded-full border border-blue-500/30">✓ CLIENTE ESISTENTE</span>}
        </div>"""
content = content.replace(old_header, new_header)

old_header_biz = r'<div style={{fontSize:11,fontWeight:700,color:"#1B3A5C",marginBottom:14,textTransform:"uppercase"}}>📝 Step 3 — Anagrafica</div>'
content = content.replace(old_header_biz, new_header) 
# Wait, it's the same string so .replace replaced them both if multiple existed, but there's only one showing Ana!


with open(target_file, "w", encoding="utf-8") as f:
    f.write(content)
print("Glass patch applied")
