# -*- coding: utf-8 -*-
import os, re, html
ROOT = "/Users/macbookl/Developer/TELEFUTURACRM-FW"
css = open(os.path.join(ROOT, "src/app/globals.css"), encoding="utf-8").read()
css = css.replace('@import "tailwindcss";', '')

SHIM = """
@layer theme, base, components, utilities;
html,body{margin:0;padding:0}
body{font-family:Outfit,ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  background-color:#0f111a;color:#f8fafc;min-height:100vh;
  background-image:radial-gradient(ellipse at top left,rgba(79,70,229,.15),transparent 50%),
    radial-gradient(ellipse at bottom right,rgba(236,72,153,.15),transparent 50%);
  background-attachment:fixed}
*{box-sizing:border-box}
@layer utilities{
 .mt-3{margin-top:.75rem}.mt-2{margin-top:.5rem}.ml-2{margin-left:.5rem}
 .align-middle{vertical-align:middle}.inline-block{display:inline-block}
 .space-y-4>*+*{margin-top:1rem}
 .max-w-\\[1500px\\]{max-width:1500px}
 .w-5{width:1.25rem}.h-5{height:1.25rem}
}
/* finta pagina: il contenuto del CRM sta dentro la shell, con l'imbottitura vera */
#shell{padding:22px 26px}
"""

# ── DATI VEROSIMILI ────────────────────────────────────────────────────
GIAC = [
 ("8806094898484","Samsung Galaxy A16 5G 128GB Blu Nero","WIND3",7,3,2,1043.00,True),
 ("8806095357911","Samsung Galaxy A56 5G 256GB Grafite","WIND3",2,0,4,798.00,True),
 ("6941487281749","ZTE Blade A36 64GB Nero","WIND3",12,5,0,948.00,True),
 ("194253939900","Apple iPhone 15 128GB Nero","",1,2,1,879.00,True),
 ("ACC-COV-0192","Cover silicone trasparente universale","",34,12,0,169.66,False),
 ("ACC-VETR-0043","Vetro temperato 9H – Samsung A16","",0,8,24,0.00,False),
 ("SIM-FW-0001","SIM Fastweb Mobile (kit attivazione)","FASTWEB",109,0,0,0.00,False),
 ("MOD-FW-4410","Modem Fastweb NeXXt Gate FWA","FASTWEB",-1,3,6,0.00,True),
 ("ACC-CAR-0771","Caricatore 20W USB-C","",5,0,0,74.50,False),
 ("8806094778069","Samsung Galaxy S24 FE 256GB Grigio","WIND3",3,1,0,1797.00,True),
]
def eur(v): 
    s = f"{v:,.2f}".replace(",", "␟").replace(".", ",").replace("␟", ".")
    return s + " €"

def giac_rows():
    out = []
    for i,(cod,desc,op,g,alt,arr,val,ser) in enumerate(GIAC):
        aperta = (i == 2)
        cls = "rvTab-riga rvTab-cl" + (" rvTab-on" if aperta else "")
        gc = "rvGiac-si" if g>0 else ("rvGiac-ko" if g<0 else "rvGiac-zero")
        ac = "rvGiac-no" if alt else "rvGiac-zero"
        rc = "rvGiac-arr" if arr else "rvGiac-zero"
        badge = f'<span class="rvBadge rvBadge-acc ml-2 align-middle">{op}</span>' if op else ''
        out.append(f'''<tr class="{cls}">
 <td class="rvTab-cod"><span class="rvTab-ap">{'▾' if aperta else '▸'}</span>{cod}</td>
 <td class="rvTab-nome">{desc}{badge}</td>
 <td class="rvTab-n rvGiac {gc}">{g}</td>
 <td class="rvTab-n rvGiac {ac}">{alt or '—'}</td>
 <td class="rvTab-n rvGiac {rc}">{arr or '—'}</td>
 <td class="rvTab-n">{eur(val)}</td></tr>''')
        if aperta:
            pezzi = "".join(f'''<div class="rvDettR">
 <button class="rvSerial" title="Tutta la storia di questo pezzo">{s}</button>
 <span class="rvBadge rvBadge-w {'rvBadge-ok' if q else 'rvBadge-warn'}">{n}</span>
 <span class="rvTab-min">Disponibile</span>
 <span class="rvDove-fine">{eur(79.00)}</span>
 <button class="rvCestino" title="Togli questo pezzo dal magazzino">🗑</button></div>'''
              for s,n,q in [("866271061892340","Magliana W3",1),("866271061774555","Magliana W3",1),
                            ("866271062003881","Ostia 3",0),("866271061990772","Castani",0)])
            out.append(f'''<tr class="rvTab-det"><td colspan="6">
 <div class="rvDett"><div class="rvDettT">I pezzi, uno per uno</div>{pezzi}</div>
 <div class="rvDett"><div class="rvDettT">Merce a quantità, negozio per negozio</div>
   <div class="rvDettR"><span class="rvBadge rvBadge-w rvBadge-ok">Magliana W3</span>
     <span class="rvTab-min">TELEFUTURA SRL</span>
     <span class="rvDove-fine"><b class="rvGiac rvGiac-si">8</b> pezzi</span>
     <button class="rvCestino">🗑</button></div></div>
 <div class="rvDett"><div class="rvDettT">Dove sta, negli altri negozi</div>
   <div class="rvPillRow"><span class="rvTag">Ostia 3 <b class="rvGiac rvGiac-no">3</b></span>
   <span class="rvTag">Castani <b class="rvGiac rvGiac-no">2</b></span></div></div>
</td></tr>''')
    return "\n".join(out)

VEND = [
 ("866271061892340","Samsung Galaxy A16 5G 128GB Blu Nero","WIND3","Magliana W3","28/08/2026","g.dinardo",149.00,129.00),
 ("353916110992817","Apple iPhone 15 128GB Nero","","Ostia 3","27/08/2026","f.casella",879.00,899.00),
 ("866271061774555","ZTE Blade A36 64GB Nero","WIND3","Magliana W3","26/08/2026","g.dinardo",79.00,79.00),
 ("352011550119348","Samsung Galaxy A56 5G 256GB Grafite","WIND3","Castani","24/08/2026","m.rossi",399.00,349.00),
 ("866271062003881","Modem Fastweb NeXXt Gate FWA","FASTWEB","Ostia 3","22/08/2026","f.casella",None,0.00),
 ("354019113558200","Samsung Galaxy S24 FE 256GB Grigio","WIND3","Magliana W3","19/08/2026","l.perrotta",599.00,559.00),
 ("866271061990772","Apple iPhone 15 128GB Nero","","Castani","12/08/2026","m.rossi",879.00,879.00),
 ("357140880012349","ZTE Blade A36 64GB Nero","WIND3","Ostia 3","05/08/2026","f.casella",79.00,69.90),
]
def vend_rows():
    out=[]
    for s,desc,op,neg,dt,chi,costo,prezzo in VEND:
        sc = None if (costo is None or prezzo is None) else prezzo-costo
        pc = "rvGiac-zero" if prezzo is None else ("rvGiac-ko" if (sc is not None and sc<0) else "rvGiac-si")
        badge = f'<span class="rvBadge rvBadge-acc ml-2 align-middle">{op}</span>' if op else ''
        scw = ""
        if sc is not None and abs(sc)>=0.01:
            scw = f'<span class="rvTab-min"> ({"+" if sc>0 else ""}{eur(sc)})</span>'
        out.append(f'''<tr class="rvTab-riga">
 <td class="rvTab-cod"><button class="rvSerial" title="Tutta la storia di questo pezzo">{s}</button></td>
 <td class="rvTab-nome">{desc}{badge}</td>
 <td class="rvTab-min">{neg}</td><td class="rvTab-min">{dt}</td><td class="rvTab-min">{chi}</td>
 <td class="rvTab-n">{eur(costo) if costo is not None else '—'}</td>
 <td class="rvTab-n rvGiac {pc}">{eur(prezzo) if prezzo is not None else '—'}{scw}</td></tr>''')
    return "\n".join(out)

TESTA = '''<div class="rvTesta"><h1 class="rvTit">📦 Magazzino</h1>
 <div class="rvPillRow">
  <button class="rvPill rvPill-on">📦 Giacenze</button>
  <button class="rvPill">🚚 Trasferimenti</button>
  <button class="rvPill">📚 Articoli</button></div></div>'''

def barra(venduto=False):
    stati = [("🟢 Disponibili", not venduto), ("📦 In arrivo", not venduto), ("🧾 Venduti", venduto)]
    sp = "".join(f'<button class="rvPill rvPill-sm{" rvPill-on" if on else ""}">{et}</button>' for et,on in stati)
    asse = "" if venduto else '''<span class="rvSep"></span>
   <button class="rvPill rvPill-sm rvPill-on">📗 Solo quello che ho qui</button>
   <button class="rvPill rvPill-sm">📚 Anche quello che sta altrove</button>'''
    data = ('''<label class="rvCampo rvCampo-sm"><span class="rvLab">Venduto dal</span>
      <input type="date" value="2026-08-01" class="rvIn"></label>
    <label class="rvCampo rvCampo-sm"><span class="rvLab">al</span>
      <input type="date" value="2026-08-31" class="rvIn"></label>
    <button class="rvPill rvPill-sm">✕ tutto</button>''' if venduto else
    '''<label class="rvCampo rvCampo-md"><span class="rvLab">Giacenza alla data</span>
      <input type="date" value="" class="rvIn"></label>''')
    return f'''<div class="rvBox"><div class="rvBoxT">🔎 Cosa guardo</div>
 <div class="rvBarra rvBarra-c">
  <button class="rvPill rvPill-sm rvPill-on">🏠 Magliana W3</button>
  <button class="rvPill rvPill-sm">🌐 Tutti i negozi</button>
  <div class="rvCampo rvCampo-lg"><input class="rvIn" placeholder="Scegli i punti vendita — vuoto = tutti"></div>
 </div>
 <div class="rvBarra rvBarra-c mt-3">{sp}{asse}</div>
 <div class="rvBarra mt-3">
  <label class="rvCampo rvCampo-lg"><span class="rvLab">Cerca</span>
   <input class="rvIn" placeholder="codice, descrizione o IMEI — puoi spararlo col lettore"></label>
  <div class="rvCampo rvCampo-md"><span class="rvLab">Operatore</span>
   <input class="rvIn" placeholder="Tutti — scrivi per filtrare"></div>
  <div class="rvCampo rvCampo-lg"><span class="rvLab">Azienda</span>
   <input class="rvIn" placeholder="Tutte le società"></div>
  {data}
  <span class="rvSpazio"></span>
  <button class="rvAzione rvAzione-sm">⬇ Excel</button>
 </div></div>'''

COL_G = ["Codice","Descrizione","Giacenza","Altrove","In arrivo","Valore"]
COL_V = ["IMEI / seriale","Descrizione","Negozio","Venduto il","Venduto da","A listino","Venduto a"]
def thead(cols, centro_da):
    return "".join(f'<th class="rvTab-ord{" rvTab-c" if i>=centro_da else ""}">{c}{"<i>↑</i>" if i==0 else ""}</th>' for i,c in enumerate(cols))

TAB_G = f'''<div class="rvTabBox"><table class="rvTab">
 <thead><tr>{thead(COL_G,2)}</tr></thead><tbody>{giac_rows()}</tbody></table></div>'''
TAB_V = f'''<div class="rvTabBox"><table class="rvTab">
 <thead><tr>{thead(COL_V,5)}</tr></thead><tbody>{vend_rows()}</tbody></table></div>'''

EVENTI = [
 ("🧾","Venduto","31/08/2026, 11:24","Magliana W3 · g.dinardo", True, True),
 ("📥","Accettato in negozio","24/08/2026, 09:12","Ostia 3 → <b>Magliana W3</b> · g.dinardo", True, False),
 ("📤","Trasferito","23/08/2026, 17:48","Ostia 3 → <b>Magliana W3</b> · f.casella", True, True),
 ("🔁","Rientrato dal cliente (permuta)","11/08/2026, 15:02","Ostia 3 · f.casella", True, False),
 ("📦","Caricato a magazzino","02/07/2026, 08:31","Ostia 3 · amministrazione", False, False),
]
def tml(n=5, lungo=False):
    out=[]
    src = EVENTI if n<=5 else (EVENTI*5)[:n]
    for i,(ico,et,q,d,apribile,aperto) in enumerate(src[:n]):
        dett = ""
        if aperto:
            dett = '''<div class="rvTml-x">
   <div class="rvDettR"><span class="rvTab-min">documento</span><span class="rvDove-fine">DDT-2026-000418</span></div>
   <div class="rvDettR"><span class="rvTab-min">prezzo di vendita</span><span class="rvDove-fine">129,00 €</span></div>
   <div class="rvDettR"><span class="rvTab-min">cliente</span><span class="rvDove-fine">ROSSI MARIO</span></div>
   <div class="rvTab-min">Consegnato in negozio, cliente presente.</div>
   <a href="#" class="rvAzione rvAzione-sm mt-2 inline-block">🧾 Apri la vendita</a></div>'''
        if lungo and i==1:
            d = d + " · nota lunga per vedere se la linea regge quando una scheda è alta il doppio delle altre e va a capo due o tre volte di fila"
        frec = f'<span class="rvTml-fr">{"▴" if aperto else "▾"}</span>' if apribile else ''
        out.append(f'''<div class="rvTml-r"><div class="rvTml-p">{ico}</div>
 <div class="rvTml-c{" rvTml-cl" if apribile else ""}">
  <div class="rvTml-q">{q}</div>
  <div class="rvTml-e">{et}{frec}</div>
  <div class="rvTml-d">{d}</div>{dett}</div></div>''')
    return f'<div class="rvTml">{"".join(out)}</div>'

def modale(n=5, lungo=False):
    return f'''<div class="rvFattaSfondo"><div class="rvStoria">
 <div class="rvStoria-t"><div>
   <div class="rvStoria-tit">Samsung Galaxy A16 5G 128GB Blu Nero</div>
   <div class="rvStoria-sot"><span class="rvDettR-mono">866271061892340</span> · cod. 8806094898484 · 🧾 Venduto</div>
  </div><button class="rvPill rvPill-sm">✕ Chiudi</button></div>
 <div class="rvBarra rvBarra-c"><span class="rvTag">📍 Magliana W3</span>
  <span class="rvTag">🏢 T1</span><span class="rvTag">🏷 a listino 149,00 €</span>
  <span class="rvTag">🧾 venduto a 129,00 €</span></div>
 {tml(n, lungo)}
</div></div>'''

def pagina(nome, corpo, tema, modal=""):
    doc = f'''<!doctype html><html class="{tema}" lang="it"><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>{css}</style><style>{SHIM}</style></head>
<body class="antialiased"><div id="shell"><div class="max-w-[1500px]">{corpo}</div></div>{modal}</body></html>'''
    p = os.path.join(ROOT, f"_p_{nome}_{tema}.html")
    open(p,"w",encoding="utf-8").write(doc)
    return p

paths=[]
for tema in ("dark","light"):
    paths.append(pagina("giacenze", TESTA + '<div class="space-y-4">' + barra(False) + TAB_G + "</div>", tema))
    paths.append(pagina("venduto", TESTA + '<div class="space-y-4">' + barra(True) + TAB_V + "</div>", tema))
    paths.append(pagina("storia5", TESTA + '<div class="space-y-4">' + barra(True) + TAB_V + "</div>", tema, modale(5)))
    paths.append(pagina("storia20", TESTA + '<div class="space-y-4">' + barra(True) + TAB_V + "</div>", tema, modale(20, True)))
    paths.append(pagina("storia1", TESTA + '<div class="space-y-4">' + barra(True) + TAB_V + "</div>", tema, modale(1)))
print("\n".join(paths))
