import os

target_file = "src/app/(dashboard)/registra-contratto/page.tsx"

with open(target_file, "r", encoding="utf-8") as f:
    content = f.read()

replacements = [
    # Backgrounds
    ('background:"#f0f2f5"', 'background:"transparent"'),
    ('background:"#fff"', 'background:"rgba(255,255,255,0.02)"'),
    ('background:"#f8f9fa"', 'background:"rgba(255,255,255,0.03)"'),
    ('background:"#fafbfc"', 'background:"rgba(255,255,255,0.03)"'),
    ('background:"#f0f7ff"', 'background:"rgba(255,255,255,0.04)"'),
    ('background:"#f8f4ff"', 'background:"rgba(255,255,255,0.04)"'),
    ('background:"#fff5f5"', 'background:"rgba(220,53,69,0.1)"'),
    ('background:"#d4edda"', 'background:"rgba(40,167,69,0.1)"'),
    ('background:"#EEF6FF"', 'background:"rgba(0,114,198,0.1)"'),
    ('background:"#FFF0F0"', 'background:"rgba(230,0,0,0.1)"'),
    ('background:"#F3EEFB"', 'background:"rgba(111,66,193,0.1)"'),
    
    # Texts
    ('color:"#333"', 'color:"#f8fafc"'),
    ('color:"#555"', 'color:"#8892b0"'),
    ('color:"#666"', 'color:"#8892b0"'),
    ('color:"#999"', 'color:"#64748b"'),
    ('color:"#888"', 'color:"#64748b"'),
    ('color:"#1a1a1a"', 'color:"#f8fafc"'),
    ('color:"#6b7280"', 'color:"#8892b0"'),
    ('color:"#1a1a2e"', 'color:"#f8fafc"'),
    ('color:"#155724"', 'color:"#28a745"'), # For success msg
    
    # Borders
    ('border:"1px solid #d0d0d0"', 'border:"1px solid rgba(255,255,255,0.1)"'),
    ('border:"1px solid #e0e0e0"', 'border:"1px solid rgba(255,255,255,0.1)"'),
    ('border:"1px solid #e8e8e8"', 'border:"1px solid rgba(255,255,255,0.1)"'),
    ('border:"1px solid #ccc"', 'border:"1px solid rgba(255,255,255,0.1)"'),
    ('border:"1px solid #ddd"', 'border:"1px solid rgba(255,255,255,0.1)"'),
    ('border:"2px solid #e8e8e8"', 'border:"2px solid rgba(255,255,255,0.1)"'),
    ('border:"2px solid #e0e0e0"', 'border:"2px solid rgba(255,255,255,0.1)"'),
    ('border:"2px solid #ccc"', 'border:"2px solid rgba(255,255,255,0.1)"'),
    ('borderBottom:"1px solid #f0f0f0"', 'borderBottom:"1px solid rgba(255,255,255,0.05)"'),
    ('borderBottom:"1px solid #ede6ff"', 'borderBottom:"1px solid rgba(255,255,255,0.05)"'),
    ('borderTop:"1px solid #eee"', 'borderTop:"1px solid rgba(255,255,255,0.05)"'),
    ('border:"1px solid #b8d4f0"', 'border:"1px solid rgba(0,114,198,0.3)"'),
    ('border:"1px solid #BDD7EE"', 'border:"1px solid rgba(0,114,198,0.3)"'),
]

for old_s, new_s in replacements:
    content = content.replace(old_s, new_s)
    # Also handle single quote variations or alternative spacing if needed
    content = content.replace(old_s.replace('"', "'"), new_s.replace('"', "'"))

with open(target_file, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Applied {len(replacements)} replacements.")
