import re,os,sys
base=open('premium-base.css').read()
SRC={'01-fluxo':'../v2/fluxo.html','02-escritorio':'../v3/escritorio-tv.html','03-mesa':'../v2/mesa.html','04-editor-arte':'../v2/modal-arte.html','05-editor-video':'../v2/modal-video.html','06-publicacao':'../v3/publicacao.html','07-marcas':'../v2/marcas.html','08-produtos':'../v2/produtos.html','09-otimizacao':'../v2/otim.html','10-cerebro':'../v3/cerebro-solar.html'}
REP=[('#2b5cff','#c9a86a'),('#4d7cff','#8fa6d6'),('#2b5cff66','#3a3220'),('#2b5cff33','#ffffff10'),('#ffc857','#e9d29a'),('#facc15','#e9d29a'),('background:#0e1117','background:#0c0c0d'),('#0a0c11','#0f0f10'),('#1a202b','#18181b'),('#131821','#141416'),('#222836','#222225'),('#1f2633','#1c1c1f'),('#12161e','#111113'),('#0f131a','#0f0f10')]
SIDE=['Fluxo','Mesa de revisão','Publicação','Marcas','Produtos','Otimização','Cérebro']
for k,src in SRC.items():
  d=os.path.dirname(src);s=open(src).read()
  s=re.sub(r'(href|src)="(?!https?:|#|data:)([^"]+)"',lambda m:f'{m.group(1)}="{d}/{m.group(2)}"',s)
  for a,b in REP:s=s.replace(a,b)
  s=s.replace('</head>',f'<meta name="viewport" content="width=device-width,initial-scale=1"><style>{base}</style></head>',1)
  if '<head>' not in s: s='<meta name="viewport" content="width=device-width,initial-scale=1"><style>'+base+'</style>'+s
  # ensure Publicação in sidebar
  if 'Publicação' not in s.split('class="main"')[0]:
    s=re.sub(r'(<div class="nv[^"]*">(?:<svg.*?</svg>)?Mesa de revisão(?:<b>\d+</b>)?</div>)',r'\1<div class="nv">Publicação<b>3</b></div>',s,1)
  s=s.replace('<span style="margin-left:auto;font-size:10px;color:#8a93a6">em breve</span>','<b>3</b>')
  open(k+'.html','w').write(s)
print('ok')

# ACCORDION: recolher raias do Fluxo
import re as _re
f=open('01-fluxo.html').read()
css="""<style>.lh{cursor:pointer}.lh:before{content:'';width:8px;height:8px;border-right:1.6px solid #a5a5aa;border-bottom:1.6px solid #a5a5aa;transform:rotate(45deg);margin:0 4px 4px 2px;transition:.2s}
.lane.closed .lh:before{transform:rotate(-45deg);margin-bottom:0}.lane.closed .st{display:none}.lane.closed .lh{margin-bottom:0!important}
.sum{display:none;gap:6px;margin-left:14px}.lane.closed .sum{display:flex}.sum span{font-size:11px;padding:3px 9px;border-radius:999px;background:#18181b;border:1px solid #26262a;color:#a5a5aa}
.sum .y{color:#e9d29a;border-color:#3a3220}.sum .g{color:#9fd3b2}.sum .r{color:#e88;border-color:#3a2224}</style>"""
f=f.replace('</head>',css+'</head>',1)
SUM={'Estático':'<span class="g">0 trabalhando</span><span class="y">1 esperando você</span>','Stories de venda':'<span class="g">1 trabalhando</span><span class="y">1 esperando você</span><span>1 finalizado</span>','Post de blog':'<span class="g">1 trabalhando</span><span class="y">1 esperando você</span><span>1 finalizado</span>','Matéria de jornal':'<span class="g">2 trabalhando</span><span class="y">1 esperando você</span>'}
for k,v in SUM.items():
  f=f.replace(f'<div class="lane"><div class="lh"><b>{k}</b>',f'<div class="lane closed"><div class="lh"><b>{k}</b>',1)
for k in ['Carrossel','Estático','Stories de venda','Reels','Matéria de jornal','Post de blog']:
  f=_re.sub(r'(<div class="lane[^"]*"><div class="lh"><b>'+k+r'</b><span class="sub">[^<]*</span>)',r'\1<span class="sum">'+SUM.get(k,'')+'</span>',f,1)
open('01-fluxo.html','w').write(f)
for f in ['02-escritorio.html','10-cerebro.html']:
  s=open(f).read().replace("W=cv.parentElement.clientWidth,H=1080","W=cv.parentElement.clientWidth,H=Math.max(window.innerHeight,600)");open(f,'w').write(s)
