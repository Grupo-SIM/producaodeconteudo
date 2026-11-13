import re,os,sys
base=open('premium-base.css').read()
SRC={'01-fluxo':'../v2/fluxo.html','02-escritorio':'../v3/escritorio-tv.html','03-mesa':'../v2/mesa.html','04-editor-arte':'../v2/modal-arte.html','05-editor-video':'../v2/modal-video.html','06-publicacao':'../v3/publicacao.html','07-marcas':'../v2/marcas.html','08-produtos':'../v2/produtos.html','09-otimizacao':'../v2/otim.html','10-cerebro':'../v3/cerebro-solar.html'}
REP=[('#2b5cff','#c9a86a'),('#4d7cff','#8fa6d6'),('#2b5cff66','#3a3220'),('#2b5cff33','#ffffff10'),('#ffc857','#e9d29a'),('#facc15','#e9d29a'),('background:#0e1117','background:#0c0c0d'),('#0a0c11','#0f0f10'),('#1a202b','#18181b'),('#131821','#141416'),('#222836','#222225'),('#1f2633','#1c1c1f'),('#12161e','#111113'),('#0f131a','#0f0f10')]
SIDE=['Fluxo','Mesa de revisão','Publicação','Marcas','Produtos','Otimização','Cérebro']
for k,src in SRC.items():
  d=os.path.dirname(src);s=open(src).read()
  s=re.sub(r'(href|src)="(?!https?:|#|data:)([^"]+)"',lambda m:f'{m.group(1)}="{d}/{m.group(2)}"',s)
  for a,b in REP:s=s.replace(a,b)
  s=s.replace('</head>',f'<style>{base}</style></head>',1)
  # ensure Publicação in sidebar
  if 'Publicação' not in s.split('class="main"')[0]:
    s=re.sub(r'(<div class="nv[^"]*">(?:<svg.*?</svg>)?Mesa de revisão(?:<b>\d+</b>)?</div>)',r'\1<div class="nv">Publicação<b>3</b></div>',s,1)
  s=s.replace('<span style="margin-left:auto;font-size:10px;color:#8a93a6">em breve</span>','<b>3</b>')
  open(k+'.html','w').write(s)
print('ok')
