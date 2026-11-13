import html
I={'fluxo':'<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="10" rx="1.5"/><rect x="17" y="4" width="4" height="13" rx="1.5"/>',
'mesa':'<path d="M4 4h16v12H4z"/><path d="M8 20h8M12 16v4"/><path d="M9 10l2 2 4-4"/>',
'marcas':'<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
'produtos':'<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/>',
'otim':'<path d="M3 20h18"/><path d="M5 16l5-5 4 3 6-7"/><path d="M15 7h5v5"/>',
'cerebro':'<path d="M9 4a3 3 0 00-3 3 3 3 0 00-2 5 3 3 0 002 5 3 3 0 006 0V6a2 2 0 00-3-2z"/><path d="M15 4a3 3 0 013 3 3 3 0 012 5 3 3 0 01-2 5 3 3 0 01-6 0"/>',
'config':'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>'}
def ic(n,s=18): return f'<svg width="{s}" height="{s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">{I[n]}</svg>'
NAV=[('fluxo','Fluxo','6'),('mesa','Mesa de revisão','6'),('marcas','Marcas',''),('produtos','Produtos',''),('otim','Otimização',''),('cerebro','Cérebro','')]
CSS=open('../base.css').read()+'''
.nv{display:flex;align-items:center;gap:10px}.nv b{margin-left:auto}
.brandtag{font-size:10.5px;padding:2px 7px;border-radius:999px;background:#1f2633;color:#bcd}
'''
def side(on):
  s='<div class="side"><div class="logo">Produção de Conteúdo</div>'
  for k,l,b in NAV: s+=f'<div class="nv{" on" if k==on else ""}">{ic(k)}{l}{f"<b>{b}</b>" if b else ""}</div>'
  s+='<div style="margin-top:auto;font-size:11.5px;color:#8a93a6;padding:10px 12px;border-top:1px solid #222836">Gasto do mês<br><b style="color:#dde;font-size:14px">R$ 0,00</b> <span>assinatura Claude + fal.ai</span></div>'
  s+=f'<div class="nv">{ic("config")}Configurações</div></div>'
  return s
def chat(msgs):
  s='<div class="chat"><div class="ch">Gerente</div><div class="msgs">'
  for who,t,sm in msgs: s+=f'<div class="m {who}">{t}{f"<small>{sm}</small>" if sm else ""}</div>'
  return s+'</div><div class="in">Fale com o gerente…</div></div>'
def page(name,on,body,msgs,extra=''):
  open(name+'.html','w').write(f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}{extra}</style></head><body>{side(on)}<div class="main">{body}</div>{chat(msgs)}</body></html>')
BR=['007 Spyhacker','Central do Marketing','Corte dos Ricos','Marketing Raiz','Seguidores em Alta','SIM Int Pay','Vivendo de Bet']

# ---------- FLUXO
FX='''.lane{background:#131821;border:1px solid #222836;border-radius:12px;padding:9px 12px;margin-bottom:8px}
.lh{display:flex;align-items:center;gap:10px;margin-bottom:7px}.lh b{font-size:14px}.lh .sub{font-size:11.5px;color:#8a93a6}
.meta{margin-left:auto;font-size:11.5px;color:#cfd6e4;display:flex;align-items:center;gap:8px}.pb{width:70px;height:5px;background:#222836;border-radius:3px}.pb u{display:block;height:5px;background:#2b5cff;border-radius:3px}
.st{display:flex;gap:6px}.s{flex:1;min-width:0;background:#0f131a;border-radius:9px;padding:6px;display:flex;flex-direction:column;gap:5px;min-height:62px}
.s.me{background:#1d1a10;outline:1px solid #4a3f1a}.s.done{background:#0f1a14}
.sh{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#8a93a6;display:flex;justify-content:space-between;gap:4px}.sh i{font-style:normal;text-transform:none;letter-spacing:0;color:#aeb7c8}
.s.me .sh{color:#ffc857}.s.done .sh{color:#3ddc84}
.c{background:#1a202b;border-radius:7px;padding:5px 7px;font-size:11.5px;border-left:3px solid #3ddc84;line-height:1.3}.c i{font-style:normal;font-size:10px;color:#8a93a6;display:block}
.c.y{border-color:#ffc857}.c.aj{border-color:#ff8a3d}.c.aj i{color:#ff9d5c}.c.d{opacity:.65}.c.q{border-color:#555}.c.e{border-color:#ff5b5b}.c.e i{color:#ff8b8b}
.leg{display:flex;gap:16px;font-size:11px;color:#8a93a6;margin-top:6px}.leg span:before{content:"";display:inline-block;width:9px;height:9px;border-radius:2px;margin-right:6px;background:var(--c)}'''
def C(t,sub,k=''): return f'<div class="c {k}">{t}<i>{sub}</i></div>'
def S(name,ag='',cards='',k=''): return f'<div class="s {k}"><div class="sh">{name}<i>{ag}</i></div>{cards}</div>'
def L(t,sub,meta,pct,stages):
  m=f'Meta {meta} · hoje' if pct is not None else meta
  bar=f'<span class="pb"><u style="width:{pct}%"></u></span>' if pct is not None else ''
  return f'<div class="lane"><div class="lh"><b>{t}</b><span class="sub">{sub}</span><span class="meta">{meta}{bar}<span class="chip">Manual</span></span></div><div class="st">{"".join(stages)}</div></div>'
lanes=[
L('Carrossel','educativo · história real · post de venda','Meta 4/dia · 2 de 4',50,[S('Roteiro','Roteirista',C('Delivery e comissão','Corte dos Ricos · escrevendo')),S('Revisão de copy','Revisor de copy',C('Fyre Festival','Seguidores em Alta · checklist história real')),S('Aprovar roteiro','',C('Aluno profissional','Central do Marketing','y'),'me'),S('Arte','Designer',C('Toy Story 2 quase apagado','007 Spyhacker · slide 6 de 10')+C('Controle Patrimonial','Corte dos Ricos · ajuste: "capa mais escura"','aj')),S('Aprovar arte','',C('Moldura de preço','Central do Marketing · 9 slides','y'),'me'),S('Postagem','Publicador',C('Conteúdo de vitrine e de decisão','Central do Marketing · marcar postado','q')),S('Finalizado','',C('A promoção da Hoover','Marketing Raiz · postado','d'),'done')]),
L('Estático','post único','Meta 1/dia · 0 de 1',0,[S('Roteiro','Roteirista'),S('Revisão de copy','Revisor de copy'),S('Aprovar texto','',C('Opinião: venda de jovens','Vivendo de Bet','y'),'me'),S('Arte','Designer'),S('Aprovar arte','','','me'),S('Postagem','Publicador'),S('Finalizado','','','done')]),
L('Stories de venda','18 a 20 telas · caixinha','Meta 1/dia · 1 de 1',100,[S('Roteiro','Roteirista'),S('Revisão de copy','Revisor de copy'),S('Aprovar roteiro','','','me'),S('Arte','Designer',C('PagaTG no Seguidores em Alta','tela 12 de 20')),S('Aprovar arte','',C('Atlas Hosting','007 Spyhacker · 19 telas','y'),'me'),S('Postagem','Publicador'),S('Finalizado','',C('ÁreaFlix','Marketing Raiz · postado','d'),'done')]),
L('Reels','voz de IA · motion','Meta 2/dia · 1 de 2',50,[S('Roteiro','Roteirista',C('IA e preço','Central do Marketing · opinião')),S('Revisão de copy','Revisor de copy'),S('Aprovar roteiro','','','me'),S('Edição','Editor de vídeo',C('Atlas, pico de acesso','007 Spyhacker · parou: assinatura saiu do login','e')),S('Aprovar vídeo','',C('Efeito isca','Marketing Raiz · 50 s','y'),'me'),S('Postagem','Publicador'),S('Finalizado','',C('Knight Capital','007 Spyhacker · postado','d'),'done')]),
L('Matéria de jornal','site · fato com fonte','Meta 3/dia · 1 de 3',33,[S('Pauta','Agente de Notícias',C('Notícia do dia','Vivendo de Bet · lendo ge, ESPN, CNN')),S('Redação','Roteirista',C('IA do Instagram para adolescentes','Seguidores em Alta · escrevendo')),S('Revisão e SEO','Revisor · SEO'),S('Aprovar matéria','',C('Rafael Lacerda no Vitória','Vivendo de Bet · matéria completa','y'),'me'),S('Foto','Designer'),S('Publicar no site',''),S('Finalizado','','','done')]),
L('Post de blog','aula escrita','Meta 1/dia · 0 de 1',0,[S('Roteiro','Roteirista',C('Post de blog','Corte dos Ricos · produtos nos tópicos')),S('Revisão de copy','Revisor de copy'),S('SEO','SEO'),S('Aprovar post','',C('Post de blog','007 Spyhacker · Atlas no tópico','y'),'me'),S('Publicar no blog',''),S('Finalizado','',C('Aula escrita','Marketing Raiz · no ar','d'),'done'),'<div style="flex:1"></div>']),
]
body=f'''<div style="background:#2a1214;border:1px solid #6b2a2e;border-radius:11px;padding:8px 14px;margin-bottom:10px;display:flex;align-items:center;gap:12px;font-size:12.5px"><b style="color:#ff6b6b">1 problema</b><span style="color:#f2c4c4">Editor de vídeo parou: a assinatura do Claude saiu do login. 1 Reels esperando.</span><span style="margin-left:auto;background:#ff6b6b;color:#2a0a0a;padding:5px 12px;border-radius:8px;font-weight:700">Resolver</span></div>
<div class="top" style="margin-bottom:10px"><h1>Fluxo</h1><span class="chip on">Lista</span><span class="chip">Escritório</span><span style="flex:1"></span><div style="position:relative"><span class="chip" style="display:inline-flex;gap:8px;align-items:center;padding:7px 14px;border:1px solid #2b5cff">Marca: <b style="color:#fff">Todas (7)</b> ▾</span>
<div style="position:absolute;right:0;top:40px;width:300px;background:#1a202b;border:1px solid #2c3445;border-radius:12px;padding:10px;z-index:5;box-shadow:0 20px 40px #000c;font-size:13px">
<div style="background:#0f131a;border-radius:8px;padding:8px 10px;color:#77808f;margin-bottom:8px">Buscar marca…</div>
<div style="font-size:10.5px;color:#8a93a6;text-transform:uppercase;margin:4px 6px">Fixadas</div>
<div style="padding:7px 8px;border-radius:7px;background:#2b5cff33">✓ Todas as marcas</div><div style="padding:7px 8px">★ Central do Marketing <span style="float:right;color:#ffc857">2</span></div><div style="padding:7px 8px">★ 007 Spyhacker <span style="float:right;color:#ffc857">2</span></div>
<div style="font-size:10.5px;color:#8a93a6;text-transform:uppercase;margin:8px 6px 4px">Outras</div><div style="padding:7px 8px">Corte dos Ricos<span style="float:right;color:#ffc857"></span></div><div style="padding:7px 8px">Marketing Raiz<span style="float:right;color:#ffc857">1</span></div><div style="padding:7px 8px">Seguidores em Alta<span style="float:right;color:#ffc857"></span></div><div style="padding:7px 8px">SIM Int Pay<span style="float:right;color:#ffc857"></span></div><div style="padding:7px 8px">Vivendo de Bet<span style="float:right;color:#ffc857">2</span></div><div style="font-size:11px;color:#8a93a6;margin:8px 6px 2px">O número amarelo é o que espera você naquela marca.</div></div></div><span class="chip" style="background:#2b5cff;color:#fff">+ Novo conteúdo</span></div>{"".join(lanes)}
<div class="leg"><span style="--c:#3ddc84">agente trabalhando</span><span style="--c:#ffc857">esperando você</span><span style="--c:#ff8a3d">em ajuste</span><span style="--c:#ff5b5b">parado</span><span style="--c:#555">na fila (ainda não começou)</span></div>'''
page('fluxo','fluxo',body,[('u','Faz um carrossel de história real para o 007 Spyhacker.',''),('g','Pauta escolhida: Toy Story 2 quase apagado. Fontes: SlashFilm (2021) e Techspot. O Revisor de copy já aprovou, está com o Designer.',''),('u','Na capa do Controle Patrimonial, deixa mais escuro.',''),('g','Voltou para o Designer com o ajuste.','Regra salva: Designer · fundo escuro, preto dominante. Desfazer')],FX)

# ---------- MESA
MX='''.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}.card{background:#131821;border:1px solid #222836;border-radius:14px;overflow:hidden}
.pv{height:210px;position:relative;padding:40px 20px 16px;color:#fff}.tp{position:absolute;top:10px;left:10px;font-size:11px;background:#000a;padding:4px 9px;border-radius:999px}.age{position:absolute;top:10px;right:10px;font-size:11px;background:#000a;padding:4px 9px;border-radius:999px;color:#ffc857}
.inf{padding:11px 12px}.inf b{display:block;font-size:14px}.inf span{font-size:12px;color:#8a93a6}.ac{display:flex;gap:6px;padding:0 12px 12px}.ac i{font-style:normal;flex:1;text-align:center;padding:8px;border-radius:8px;font-size:12px;font-weight:700;background:#1f2633;color:#ccd}.ac i.ok{background:#3ddc84;color:#06200f}
.txt{background:#0f131a;color:#bcd;font-size:12.5px;line-height:1.5}.art{background:radial-gradient(circle at 100% 0,#3a2f0a,#050505 60%);font-weight:900;font-size:21px;line-height:1.15}'''
def K(tp,age,pv,cls,t,sub): return f'<div class="card"><div class="pv {cls}"><span class="tp">{tp}</span><span class="age">{age}</span>{pv}</div><div class="inf"><b>{t}</b><span>{sub}</span></div><div class="ac"><i>Abrir editor</i><i class="ok">Aprovar</i></div></div>'
cards=[K('Arte · carrossel 9 slides','há 6 min','Se você cortasse seu preço pela metade amanhã, quem ia parar de pedir desconto?','art','Moldura de preço','Central do Marketing · Carrossel · Designer'),
K('Vídeo · 0:50','há 20 min','<div style="display:grid;place-items:center;height:100%"><div style="width:54px;height:54px;border-radius:50%;background:#fff3;display:grid;place-items:center">▶</div></div>','art','Efeito isca','Marketing Raiz · Reels · Editor de vídeo'),
K('Arte · stories 19 telas','há 35 min','<span style="font-size:15px">hospedagem não é tudo igual?</span><br><span style="font-size:12px;font-weight:400;color:#ccc">Plano de avião é tudo igual? Pois é.</span>','art','Atlas Hosting','007 Spyhacker · Stories de venda · Designer'),
K('Roteiro · carrossel','há 1 h','<b style="color:#fff">Capa:</b> Aluno profissional…<br><b style="color:#fff">2.</b> Você já comprou três cursos e não terminou nenhum…','txt','Aluno profissional','Central do Marketing · Carrossel · Roteirista'),
K('Matéria · completa','há 2 h','<b style="color:#fff;font-size:15px">Vitória anuncia Rafael Lacerda após a saída de Jair Ventura</b><br><br>Como o Vitória chegou a Rafael Lacerda · Quem é · O que tem pela frente','txt','Rafael Lacerda no Vitória','Vivendo de Bet · Matéria de jornal · Roteirista + SEO'),
K('Texto · estático','há 3 h','<b style="color:#fff">Opinião:</b> venda de jovens jogadores…','txt','Opinião sobre venda de jovens','Vivendo de Bet · Estático · Roteirista')]
body=f'<div class="top"><h1>Mesa de revisão</h1><span class="chip">6 esperando você · mais antigo há 3 h</span></div><div class="top"><span class="chip on">Tudo (6)</span><span class="chip">Textos (3)</span><span class="chip">Artes (2)</span><span class="chip">Vídeos (1)</span><span style="flex:1"></span><span class="chip">Todas as marcas</span></div><div class="grid">{"".join(cards)}</div>'
page('mesa','mesa',body,[('g','6 itens esperando você. O mais antigo é o estático do Vivendo de Bet, de 3 horas atrás.',''),('u','Aprova o aluno profissional.',''),('g','Aprovado. Foi para o Designer.','')],MX)

# ---------- MARCAS
MK='''.wrap{display:flex;gap:18px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;width:430px;align-content:start}
.b{background:#131821;border:1px solid #222836;border-radius:12px;padding:12px}.b.on{outline:2px solid #ffc857}.b b{display:block;font-size:13.5px}.b span{font-size:11.5px;color:#8a93a6}
.ini{width:38px;height:38px;border-radius:10px;background:#1f2633;display:grid;place-items:center;font-weight:800;font-size:13px;margin-bottom:8px}
.ed{flex:1;background:#131821;border:1px solid #222836;border-radius:14px;padding:16px 18px}.tabs{display:flex;gap:6px;margin:12px 0}.tabs span{font-size:12.5px;padding:7px 12px;border-radius:8px;background:#1a202b;color:#99a}.tabs span.on{background:#ffc857;color:#111;font-weight:700}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box{background:#0f131a;border-radius:12px;padding:12px;font-size:12.5px}.box h4{font-size:11px;color:#8a93a6;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px}
.f{background:#1a202b;border-radius:8px;padding:8px 10px;margin-bottom:6px;line-height:1.4;display:flex;justify-content:space-between;gap:8px}.f span{color:#8a93a6}
.tag{display:inline-block;background:#173322;color:#7fe0a5;border-radius:999px;padding:4px 10px;font-size:11.5px;margin:0 5px 6px 0}.tag.n{background:#1a202b;color:#99a}'''
nich={'007 Spyhacker':'Tecnologia','Central do Marketing':'Marketing digital','Corte dos Ricos':'Empreendedorismo e finanças','Marketing Raiz':'Marketing digital','Seguidores em Alta':'Redes sociais','SIM Int Pay':'Sem nicho (lê todos)','Vivendo de Bet':'Esportes'}
g=''.join(f'<div class="b{" on" if b=="Central do Marketing" else ""}"><div class="ini">{ {"007 Spyhacker":"007","Central do Marketing":"CM","Corte dos Ricos":"CR","Marketing Raiz":"MR","Seguidores em Alta":"SA","SIM Int Pay":"SIP","Vivendo de Bet":"VB"}[b] }</div><b>{b}</b><span>{nich[b]}</span></div>' for b in BR)
body=f'''<div class="top"><h1>Marcas</h1><span class="chip">7 marcas</span><span class="chip" style="background:#2b5cff;color:#fff">+ Nova marca</span></div><div class="wrap"><div class="grid">{g}</div>
<div class="ed"><div style="display:flex;gap:12px;align-items:center"><div class="ini" style="width:52px;height:52px;margin:0;background:#050505;border:1px solid #ffc857;color:#ffc857">CM</div><div><b style="font-size:18px">Central do Marketing</b><br><span style="font-size:12px;color:#8a93a6">Marketing digital · CTA leva ao blog da Marketing Raiz</span></div></div>
<div class="tabs"><span class="on">Identidade visual</span><span>Voz e público</span><span>Formatos e metas</span><span>Contas e postagem</span></div>
<div class="two"><div><div class="box"><h4>Estilo aprovado pelo dono (vale para todas as marcas)</h4><div class="f">Fundo<span>escuro, preto dominante</span></div><div class="f">Luz<span>cor de destaque vindo do canto</span></div><div class="f">O que muda por marca<span>cores, logo, fonte, mascote</span></div></div>
<div class="box" style="margin-top:12px"><h4>Desta marca</h4><div class="f">Cor de destaque<span>do cadastro</span></div><div class="f">Fonte dos títulos<span>do cadastro</span></div><div class="f">Logo e @<span>do cadastro · modelo citação usa fio + @</span></div></div></div>
<div><div class="box"><h4>Formatos treinados</h4><span class="tag">Carrossel educativo</span><span class="tag">História real</span><span class="tag">Reels opinião</span><span class="tag">Post de blog</span><span class="tag">Citação</span><span class="tag n">+ Stories de venda</span><span class="tag n">+ Matéria</span></div>
<div class="box" style="margin-top:12px"><h4>Peças aprovadas no treino</h4><div class="f">Moldura de preço<span>carrossel</span></div><div class="f">Conteúdo de vitrine e de decisão<span>carrossel</span></div><div class="f">IA e preço<span>reels</span></div><div class="f">Post de blog (11/11)<span>blog</span></div></div></div></div>
<div style="margin-top:12px;font-size:12px;color:#8fe0b0;background:#0f2418;border:1px solid #1f5a36;border-radius:10px;padding:9px 12px">O que você mudar aqui, o gerente avisa os agentes e salva no cérebro da marca. Também dá para mudar só pela conversa.</div></div></div>'''
page('marcas','marcas',body,[('u','Na Central do Marketing, o CTA do blog continua indo para a Marketing Raiz?',''),('g','Sim. Está no post de blog aprovado em 11/11: o CTA leva ao post de blog da Marketing Raiz.','Fonte: peça 39, carrosséis aprovados')],MK)

# ---------- PRODUTOS
PX='''.wrap{display:flex;gap:18px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;width:470px;align-content:start}
.p{background:#131821;border:1px solid #222836;border-radius:12px;padding:12px}.p.on{outline:2px solid #2b5cff}.p b{display:block;font-size:13.5px}.p span{font-size:11.5px;color:#8a93a6}
.bd{display:flex;gap:4px;margin-top:7px;flex-wrap:wrap}
.ed{flex:1;background:#131821;border:1px solid #222836;border-radius:14px;padding:16px 18px}.tabs{display:flex;gap:6px;margin:12px 0}.tabs span{font-size:12.5px;padding:7px 12px;border-radius:8px;background:#1a202b;color:#99a}.tabs span.on{background:#2b5cff;color:#fff;font-weight:700}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}.box{background:#0f131a;border-radius:12px;padding:12px;font-size:12.5px}.box h4{font-size:11px;color:#8a93a6;text-transform:uppercase;letter-spacing:.05em;margin:0 0 8px}
.f{background:#1a202b;border-radius:8px;padding:8px 10px;margin-bottom:6px;line-height:1.4;display:flex;justify-content:space-between;gap:8px}.f span{color:#8a93a6}
.btn{display:inline-block;padding:8px 12px;border-radius:9px;background:#2b5cff;color:#fff;font-weight:700;font-size:12.5px}'''
P=[('Atlas Hosting','Hospedagem de sites',['007 Spyhacker']),('ÁreaFlix','Área de membros para cursos',['Marketing Raiz','Seguidores em Alta']),('SimIntPay','Pagamentos: parcelamento e cashback',['Marketing Raiz','SIM Int Pay']),('PagaTG','Cobrança de grupo no Telegram',['Seguidores em Alta']),('Controle Patrimonial','Controle de patrimônio',['Corte dos Ricos']),('Controle de Motorista','Gestão de frota e quilometragem',['Corte dos Ricos']),('EbookSIM','E-book',['Marketing Raiz'])]
g=''.join(f'<div class="p{" on" if n=="Atlas Hosting" else ""}"><b>{n}</b><span>{t}</span><div class="bd">{"".join(f"<span class=brandtag>{x}</span>" for x in bs)}</div></div>' for n,t,bs in P)+'<div class="p" style="border-style:dashed;color:#8a93a6;font-size:12.5px;display:grid;place-items:center">+ Novo produto<br><span>ou cole o link no chat</span></div>'
body=f'''<div class="top"><h1>Produtos</h1><span class="chip">7 produtos</span><span style="flex:1"></span><span class="chip on">Todas as marcas</span></div><div class="wrap"><div class="grid">{g}</div>
<div class="ed"><div style="display:flex;justify-content:space-between;align-items:center"><div><b style="font-size:18px">Atlas Hosting</b><br><span style="font-size:12px;color:#8a93a6">Hospedagem de sites · usado por 007 Spyhacker</span></div><span class="btn">Pedir conteúdo deste produto</span></div>
<div class="tabs"><span class="on">Ficha</span><span>Página de vendas</span><span>Objeções e bônus</span><span>Conteúdos feitos</span></div>
<div class="two"><div class="box"><h4>Ficha</h4><div class="f">Tipo<span>hospedagem</span></div><div class="f">Ângulos usados<span>recorrência, pico de acesso, site fora do ar</span></div><div class="f">Link de vendas<span>do cadastro</span></div><div class="f">Promessa, público, dores<span>do cadastro</span></div></div>
<div class="box"><h4>Conteúdos aprovados com este produto</h4><div class="f">Stories de venda (19 telas)<span>stories</span></div><div class="f">Atlas, recorrência<span>reels venda</span></div><div class="f">Atlas, pico de acesso<span>reels venda</span></div><div class="f">Institucional, manifesto 1 e 2<span>reels</span></div><div class="f">Institucional, bastidor<span>reels</span></div><div class="f">Post de blog 007 Spyhacker<span>Atlas no tópico</span></div></div></div></div></div>'''
page('produtos','produtos',body,[('u','O Atlas vale também para a Central do Marketing?',''),('g','Hoje só está ligado ao 007 Spyhacker. Quer que eu ligue à Central também? Aí o roteirista pode citar o Atlas nos posts de site e tecnologia de lá.','')],PX)

# ---------- OTIMIZACAO
OX='''.k{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px}.k div{background:#131821;border:1px solid #222836;border-radius:12px;padding:12px 14px}.k b{font-size:22px;display:block}.k span{font-size:12px;color:#8a93a6}
.two{display:grid;grid-template-columns:1.3fr 1fr;gap:14px}.box{background:#131821;border:1px solid #222836;border-radius:14px;padding:14px;font-size:13px}.box h3{font-size:14px;margin-bottom:10px}
.empty{border:1px dashed #333c4f;border-radius:12px;padding:30px;text-align:center;color:#8a93a6;line-height:1.6}.f{background:#0f131a;border-radius:9px;padding:10px 12px;margin-bottom:7px;line-height:1.45}.f small{display:block;color:#8a93a6;font-size:11.5px}'''
body='''<div class="top"><h1>Otimização</h1><span class="chip on">Últimos 30 dias</span><span class="chip">Todas as marcas</span><span class="chip">Todos os formatos</span></div>
<div class="k"><div><span>Peças aprovadas no treino</span><b>44</b></div><div><span>Postadas e finalizadas</span><b>—</b></div><div><span>Alcance médio</span><b>—</b></div><div><span>Aprovadas sem você editar</span><b>—</b></div></div>
<div class="two"><div class="box"><h3>O que performou</h3><div class="empty">Ainda não há posts finalizados com números.<br>Assim que você marcar o primeiro como <b>postado</b>, o Publicador puxa curtidas, alcance e salvamentos<br>e o ranking aparece aqui, comparando cada peça com a média da marca e do formato.</div></div>
<div class="box"><h3>O que o gerente vai analisar</h3><div class="f">Capa e gancho<small>Que tipo de abertura gera mais salvamento por formato e marca</small></div><div class="f">Formato x marca<small>Ex.: história real rende mais no 007 Spyhacker ou no Seguidores em Alta</small></div><div class="f">Horário e frequência<small>Base: guia do Publicador, horário, frequência e testes</small></div><div class="f">Venda<small>Stories de venda e posts de venda: cliques no link da tela</small></div><div class="f" style="background:#0f2418;color:#8fe0b0">Cada descoberta vem com os botões <b>Virar regra</b> ou <b>Ignorar</b>. Só entra no cérebro o que você confirmar.</div></div></div>'''
page('otim','otim',body,[('u','O que você precisa para começar a otimizar?',''),('g','Dos primeiros posts marcados como postados, com o link. Com uns 10 por formato eu já consigo comparar ganchos e horários.','')],OX)

# ---------- CEREBRO
CX='''.two{display:grid;grid-template-columns:300px 1fr;gap:14px}.box{background:#131821;border:1px solid #222836;border-radius:14px;padding:12px;font-size:13px}
.fd{display:flex;justify-content:space-between;padding:9px 10px;border-radius:8px;margin-bottom:3px}.fd.on{background:#1f2633}.fd span{color:#8a93a6;font-size:12px}
.h4{font-size:11px;color:#8a93a6;text-transform:uppercase;letter-spacing:.05em;margin:10px 4px 6px}
.fl{display:flex;justify-content:space-between;background:#0f131a;border-radius:8px;padding:9px 12px;margin-bottom:5px}.fl span{color:#8a93a6;font-size:12px}
.srch{background:#0f131a;border-radius:10px;padding:10px 12px;color:#77808f;margin-bottom:12px}'''
ag=[('Roteirista',16),('Editor de vídeo',12),('Revisor de copy',9),('Designer',8),('Gerente',5),('SEO',3),('Publicador',3),('Agente de Notícias','fontes por nicho')]
fold=''.join(f'<div class="fd{" on" if a=="Roteirista" else ""}">{a}<span>{n}{" arquivos" if isinstance(n,int) else ""}</span></div>' for a,n in ag)
fold+='<div class="h4">Marcas</div>'+''.join(f'<div class="fd">{b}<span>regras da marca</span></div>' for b in BR[:4])+'<div class="fd"><span>+ 3 marcas</span></div>'
files=['Formato de entrega: carrossel e arte','Narrativa de carrossel que prende e entrega','Copy que converte (engenharia reversa)','Manchetes de notícia no estilo do dono','Repertório de ganchos e antes/depois','Engenharia reversa de roteiros de referência','Formato estático','Matéria completa para o site','História real investigativa','Stories de venda','Regras de marketing digital','Marca Corte dos Ricos','Post de venda','Reels','Blog: aula escrita','Serviço para cliente']
fl=''.join(f'<div class="fl">{f}<span>{"%02d"%(i+1 if i<15 else 20)}</span></div>' for i,f in enumerate(files))
body=f'<div class="top"><h1>Cérebro</h1><span class="chip">Só leitura · para mudar, fale com o gerente</span></div><div class="two"><div class="box"><div class="h4" style="margin-top:2px">Agentes</div>{fold}</div><div class="box"><div class="srch">Buscar no cérebro: "gancho", "zona segura", "CTA"…</div><b style="font-size:15px">Roteirista</b> <span style="color:#8a93a6;font-size:12px">· 16 arquivos de treino</span><div style="height:10px"></div>{fl}</div></div>'
page('cerebro','cerebro',body,[('u','O que o roteirista sabe sobre stories de venda?',''),('g','18 a 20 telas em caixinha, alternando polêmica, humor e autoridade. Todo CTA leva ao link da tela, sem emoji. O produto aparece no meio, não em todas as telas.','Fonte: Roteirista · 10 Stories de venda')],CX)
