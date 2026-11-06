// Catálogo dos estilos de motion. Cada estilo tem: look (o motor desenha paleta, tipografia e acabamento próprios),
// receita (o que o Editor precisa seguir) e um exemplo de spec pronto (usado como demonstração e como modelo para o Editor).
const N = (o, dur, theme, text, extra = {}) => ({ dur, theme, ...extra, text, ...o });
const exemploBase = (look, accent, scenes, extra = {}) => ({ fps: 30, look, accent, brand: 'SUA MARCA • MOTION', ...extra, scenes });

export const ESTILOS_MOTION = [
  {
    id: 'editorial', nome: 'Editorial', look: 'editorial', cor: ['#F5F2EB', '#141414', '#E5141B'],
    resumo: 'Papel claro e preto alternados, palavra-chave em destaque, objetos grandes com sombra. O clássico.',
    melhor: 'Educação, negócios, dicas e opinião',
    ritmo: 'Cenas de 1,0 a 2,2 s',
    receita: `ESTILO: EDITORIAL (look "editorial")
- Alterne cenas "light" (papel claro, contexto e virada) e "dark" (tensão, dor, CTA final). Destaque em 1 palavra por bloco (*palavra*).
- Ritmo: cenas de 1,0 a 2,2 s. Transições: circle, whip, zoom e dim (nunca repita a mesma duas vezes seguidas).
- Decoração: grid, curve:s|left|right|arc, barcode, badge, badge. Objetos: gráfico ou esfera grande (360 a 760 px) com enter slideL/slideB/pop e idle float/sway.
- Use card para listas de 3 itens e gradientWord para a palavra-chave do vídeo. CTA final em modo "ticker" numa cena dark.`,
    exemplo: exemploBase('editorial', '#E5141B', [
      N({ items: [{ type: 'chart', x: .16, y: .52, size: 760, rot: 18, enter: 'slideL', idle: 'float' }] }, 1.7, 'light', { value: 'Você tem as | *ideias* e | *conteúdo*', y: .36, size: 66, align: 'left', x: .42 }, { decor: ['grid', 'barcode', 'badge'], narration: 'Você tem as ideias e o conteúdo.' }),
      N({}, 1.6, 'dark', { value: 'Mas o seu | *crescimento?*', y: .42, size: 66 }, { in: { type: 'dim', dur: .45 }, narration: 'Mas e o crescimento?' }),
      N({}, 1.2, 'dark', { value: 'ainda *travado*', y: .5, size: 92, step: .18 }, { in: 'cut', narration: 'Continua travado.' }),
      N({ items: [{ type: 'card', title: 'Valor', x: .52, y: .42, size: 470, rot: -2, enter: 'drop', idle: 'sway', items: [{ icon: '', text: 'Sem alcance' }, { icon: '', text: 'Sem impacto' }, { icon: '', text: 'Sem faturamento' }], itemStep: .45 }] }, 2.0, 'light', null, { in: { type: 'whip', dur: .45 }, decor: ['curve:left'], narration: 'Sem alcance, sem impacto e sem faturamento.' }),
      N({ items: [{ type: 'gradientWord', text: 'Estratégia', x: .5, y: .47, size: 150, enter: 'zoom', idle: 'none' }] }, 1.6, 'light', { value: 'o Instagram recompensa', y: .58, size: 52, start: .4 }, { in: { type: 'circle', dur: .45, x: .5, y: .47, color: '#E5141B' }, decor: ['grid'], narration: 'O Instagram recompensa estratégia.' }),
      N({}, 2.2, 'dark', { value: 'Chama no *DIRECT* pra gente *resolver* isso', y: .5, size: 62, mode: 'ticker', start: .15, step: .2 }, { in: { type: 'circle', dur: .45, x: .5, y: .5, color: '#111' }, narration: 'Chama no direct pra gente resolver isso.' })
    ].map(s => (s.text ? s : { ...s, text: undefined })))
  },
  {
    id: 'neon', nome: 'Neon tech', look: 'neon', cor: ['#05060F', '#13194A', '#00E5FF'],
    resumo: 'Fundo escuro profundo, brilho neon nas palavras-chave, grade e linhas de varredura. Visual de tecnologia.',
    melhor: 'Tecnologia, IA, finanças, games e lançamentos',
    ritmo: 'Cenas de 1,0 a 1,8 s',
    receita: `ESTILO: NEON TECH (look "neon")
- Todas as cenas são escuras (o motor pinta cenas "light" como roxo profundo, então alterne "dark" e "light" só para variar o fundo). Cores: "accent" ciano (#00E5FF) e "accent2" magenta (#FF2BD6) ou as cores da marca.
- Palavra-chave em *destaque* brilha sozinha; use no máximo 1 por bloco. Texto em 58 a 80 px, bem legível.
- Ritmo: 1,0 a 1,8 s. Transições: whip, zoom e fade curto. Decoração já vem automática (grid e linhas de varredura); acrescente curve ou scatter só se ajudar.
- Objetos: esfera, anel ou gráfico com brilho, ou imagem 3D da biblioteca (enter pop/zoom/slideB, idle float/spin). Prefira card para listas (vira vidro escuro com borda neon) e profile para mostrar perfil.
- Nada de emoji: use imagens 3D de tecnologia da biblioteca (foguete, gráfico, robô, cadeado) ou esfera e anel neon.`,
    exemplo: exemploBase('neon', '#00E5FF', [
      N({ items: [{ type: 'orb', color: '#00E5FF', x: .5, y: .62, size: 420, enter: 'zoom', idle: 'float' }] }, 1.6, 'dark', { value: 'A *IA* vai | mudar o seu | trabalho', y: .27, size: 72 }, { narration: 'A inteligência artificial vai mudar o seu trabalho.' }),
      N({ items: [{ type: 'ring', color: '#00E5FF', x: .5, y: .6, size: 520, enter: 'pop', idle: 'spin', spin: 6 }] }, 1.3, 'light', { value: 'em *segundos*', y: .26, size: 92 }, { in: { type: 'whip', dur: .4 }, narration: 'Em segundos.' }),
      N({ items: [{ type: 'card', title: 'Você ganha', x: .5, y: .5, size: 470, enter: 'drop', idle: 'sway', items: [{ icon: '', text: 'Tempo' }, { icon: '', text: 'Resultado' }, { icon: '', text: 'Controle' }], itemStep: .4 }] }, 2.0, 'dark', null, { in: { type: 'zoom', dur: .4 }, narration: 'Mais tempo, mais resultado e mais controle.' }),
      N({}, 1.4, 'light', { value: 'sem *complicar*', y: .5, size: 88 }, { in: { type: 'fade', dur: .3 }, narration: 'Sem complicar.' }),
      N({}, 2.1, 'dark', { value: 'Comece *hoje* e fale com a gente', y: .5, size: 64, mode: 'ticker', start: .15, step: .2 }, { in: { type: 'whip', dur: .4 }, narration: 'Comece hoje e fale com a gente.' })
    ].map(s => (s.text ? s : { ...s, text: undefined })))
  },
  {
    id: 'minimal', nome: 'Minimalista verde', look: 'minimal', cor: ['#E3EEE2', '#0D1B14', '#1F8A5B'],
    resumo: 'Muito espaço em branco, texto limpo e calmo, sublinhado suave na palavra-chave. Elegante e sóbrio.',
    melhor: 'Saúde, bem-estar, serviços premium, consultoria e educação',
    ritmo: 'Cenas de 2,0 a 3,2 s',
    receita: `ESTILO: MINIMALISTA (look "minimal")
- Visual limpo, calmo e elegante: fundo claro liso (ou escuro liso em 1 cena de contraste), texto em 56 a 72 px, poucas palavras por cena (3 a 6).
- Ritmo calmo: 2,0 a 3,2 s por cena. Transições: só fade (dur 0.4 a 0.6). Sem decoração, sem objetos gigantes: no máximo 1 objeto pequeno (220 a 320 px) por cena ou nenhum.
- A palavra-chave (*palavra*) ganha cor de destaque e um sublinhado suave. Mantenha y entre 0,42 e 0,5, sempre centralizado.
- Paleta própria: fundo verde-sálvia (#E3EEE2), escuro verde-floresta (#0D1B14) e destaque verde (#1F8A5B); no spec use "light":"#E3EEE2" e "dark":"#0D1B14".
- Sem emoji; prefira card branco para listas simples. Uma ideia por cena, com respiro.`,
    exemplo: exemploBase('minimal', '#1F8A5B', [
      N({}, 2.4, 'light', { value: 'Menos *barulho*, | mais resultado', y: .45, size: 70 }, { narration: 'Menos barulho, mais resultado.' }),
      N({ items: [{ type: 'ring', color: '#1F8A5B', x: .5, y: .62, size: 260, enter: 'fade', idle: 'float' }] }, 2.6, 'light', { value: 'Foque no que | realmente *importa*', y: .36, size: 62 }, { in: { type: 'fade', dur: .5 }, narration: 'Foque no que realmente importa.' }),
      N({ items: [{ type: 'card', title: 'Três passos', x: .5, y: .5, size: 470, enter: 'fade', idle: 'none', items: [{ icon: '1', text: 'Entender' }, { icon: '2', text: 'Planejar' }, { icon: '3', text: 'Agir' }], itemStep: .6 }] }, 3.0, 'light', null, { in: { type: 'fade', dur: .5 }, narration: 'Entender, planejar e agir.' }),
      N({}, 2.4, 'dark', { value: 'Simples assim.', y: .46, size: 78 }, { in: { type: 'fade', dur: .6 }, narration: 'Simples assim.' }),
      N({}, 2.6, 'light', { value: 'Vamos *conversar?*', y: .46, size: 72 }, { in: { type: 'fade', dur: .6 }, narration: 'Vamos conversar?' })
    ].map(s => (s.text ? s : { ...s, text: undefined })), { light: '#E3EEE2', dark: '#0D1B14' })
  },
  {
    id: 'impacto', nome: 'Impacto bold', look: 'impacto', cor: ['#FFD400', '#0A0A0A', '#FFFFFF'],
    resumo: 'Blocos de cor chapada, letras gigantes em caixa alta, sombra dura e faixas. Direto e barulhento.',
    melhor: 'Varejo, promoções, esportes, público jovem e ofertas',
    ritmo: 'Cenas de 0,9 a 1,6 s',
    receita: `ESTILO: IMPACTO BOLD (look "impacto")
- Cenas "light" ficam na cor de destaque da marca (fundo chapado) e "dark" ficam pretas. Alterne sempre. Use a cor mais forte da marca em "accent".
- Texto em CAIXA ALTA (o motor aplica), 80 a 110 px, no máximo 4 palavras por cena. A palavra-chave vira uma etiqueta de cor.
- Ritmo rápido: 0,9 a 1,6 s. Transições: "cut" e "whip" (nunca fade). Faixas de alerta já vêm automáticas.
- Objetos com sombra dura: imagem da biblioteca, esfera ou gráfico grande (380 a 620 px) com enter pop/slideB/zoom. Card vira cartão branco com borda preta.
- Estrutura: gancho gritado, 2 a 3 provas curtas, oferta, CTA final em ticker numa cena dark.`,
    exemplo: exemploBase('impacto', '#FFD400', [
      N({ items: [{ type: 'orb', color: '#0A0A0A', x: .5, y: .64, size: 520, enter: 'pop', idle: 'sway' }] }, 1.3, 'light', { value: 'Oferta *relâmpago*', y: .26, size: 100 }, { narration: 'Oferta relâmpago.' }),
      N({}, 1.0, 'dark', { value: 'só *hoje*', y: .5, size: 130 }, { in: 'cut', narration: 'Só hoje.' }),
      N({ items: [{ type: 'chart', color: '#0A0A0A', x: .5, y: .62, size: 480, enter: 'slideB', idle: 'float' }] }, 1.4, 'light', { value: 'tudo com | *50% off*', y: .27, size: 96 }, { in: { type: 'whip', dur: .35 }, narration: 'Tudo com cinquenta por cento de desconto.' }),
      N({}, 1.0, 'dark', { value: 'sem *enrolação*', y: .5, size: 110 }, { in: 'cut', narration: 'Sem enrolação.' }),
      N({}, 2.0, 'light', { value: 'Corre no *WHATSAPP* e garante o seu', y: .5, size: 84, mode: 'ticker', start: .1, step: .22 }, { in: { type: 'whip', dur: .35 }, narration: 'Corre no WhatsApp e garante o seu.' })
    ].map(s => (s.text ? s : { ...s, text: undefined })))
  },
  {
    id: 'gradiente', nome: 'Gradiente fluido', look: 'gradiente', cor: ['#7C3AED', '#22D3EE', '#FFFFFF'],
    resumo: 'Fundos em degradê com a cor da marca, formas suaves flutuando e cartões de vidro. Moderno e leve.',
    melhor: 'Beleza, lifestyle, aplicativos, redes sociais e marcas jovens',
    ritmo: 'Cenas de 1,4 a 2,4 s',
    receita: `ESTILO: GRADIENTE FLUIDO (look "gradiente")
- Fundos em degradê feitos com a cor da marca ("accent") e uma segunda cor ("accent2"); todo texto é branco. Formas desfocadas flutuam sozinhas (decoração automática "blobs").
- Ritmo suave: 1,4 a 2,4 s. Transições: fade, zoom e circle (com a cor de accent). Evite whip repetido.
- Texto em 60 a 84 px; a palavra-chave ganha uma pílula translúcida. Card vira vidro fosco.
- Objetos: imagem 3D da biblioteca ou esfera flutuando (idle float/sway), tamanhos 300 a 520 px, enter pop/fade/slideB.
- Tom leve e positivo; combina com narração calorosa.`,
    exemplo: exemploBase('gradiente', '#7C3AED', [
      N({ items: [{ type: 'orb', color: '#F472B6', x: .5, y: .62, size: 440, enter: 'pop', idle: 'float' }] }, 1.8, 'light', { value: 'Sua *rotina* | pode ser mais leve', y: .27, size: 74 }, { narration: 'Sua rotina pode ser mais leve.' }),
      N({}, 1.6, 'dark', { value: 'com *pequenos* ajustes', y: .5, size: 80 }, { in: { type: 'fade', dur: .4 }, narration: 'Com pequenos ajustes.' }),
      N({ items: [{ type: 'card', title: 'Hoje', x: .5, y: .5, size: 470, enter: 'drop', idle: 'sway', items: [{ icon: '', text: 'Beba água' }, { icon: '', text: 'Respire' }, { icon: '', text: 'Desconecte' }], itemStep: .45 }] }, 2.2, 'light', null, { in: { type: 'zoom', dur: .4 }, narration: 'Beba água, respire e desconecte.' }),
      N({}, 2.2, 'light', { value: 'Vem *transformar* o seu dia', y: .48, size: 74 }, { in: { type: 'circle', dur: .5, x: .5, y: .5, color: '#22D3EE' }, narration: 'Vem transformar o seu dia.' })
    ].map(s => (s.text ? s : { ...s, text: undefined })))
  },
  {
    id: 'cinema', nome: 'Cinematográfico', look: 'cinema', cor: ['#0D0A07', '#2A2118', '#D4A24C'],
    resumo: 'Barras de cinema, tons quentes, tipografia serifada e câmera lenta. Conta uma história com emoção.',
    melhor: 'Institucional, história da marca, turismo, imobiliário e eventos',
    ritmo: 'Cenas de 2,4 a 4,0 s',
    receita: `ESTILO: CINEMATOGRÁFICO (look "cinema")
- Tom emocional e de história. Cenas escuras e quentes (o motor já pinta "dark" e "light" em marrom e preto), barras de cinema automáticas, grão de filme e câmera lenta (use "cam":{"from":1,"to":1.14}).
- Texto serifado menor (46 a 62 px), poucas palavras por cena (4 a 8), posicionado no terço inferior (y entre 0,62 e 0,74) para deixar a imagem respirar. Palavra-chave em itálico dourado.
- Ritmo lento: 2,4 a 4,0 s. Transições: fade e dim (0,6 a 0,9 s). Sem cortes secos, sem whip, sem emoji.
- Se houver vídeos ou fotos da biblioteca da marca, use como "bg" com shade 0,35 a 0,55 e o texto por cima. Cor de destaque em dourado (#D4A24C) ou a cor principal da marca.
- Estrutura: abertura contemplativa, contexto, virada emocional, promessa, assinatura da marca.`,
    exemplo: exemploBase('cinema', '#D4A24C', [
      N({ items: [{ type: 'ring', color: '#D4A24C', x: .5, y: .36, size: 420, enter: 'fade', idle: 'float' }] }, 3.2, 'dark', { value: 'Toda grande história | começa com um *sonho*', y: .68, size: 54 }, { cam: { from: 1, to: 1.14 }, narration: 'Toda grande história começa com um sonho.' }),
      N({}, 3.0, 'light', { value: 'e a coragem de *recomeçar*', y: .68, size: 56 }, { in: { type: 'dim', dur: .8 }, cam: { from: 1.02, to: 1.14 }, narration: 'E a coragem de recomeçar.' }),
      N({ items: [{ type: 'orb', color: '#D4A24C', x: .5, y: .38, size: 430, enter: 'fade', idle: 'float' }] }, 3.2, 'dark', { value: 'Aqui, cada detalhe | foi pensado para *você*', y: .7, size: 52 }, { in: { type: 'fade', dur: .8 }, cam: { from: 1, to: 1.14 }, narration: 'Aqui, cada detalhe foi pensado para você.' }),
      N({}, 3.4, 'light', { value: 'Sua *história* continua aqui', y: .5, size: 60 }, { in: { type: 'fade', dur: .9 }, cam: { from: 1, to: 1.12 }, narration: 'Sua história continua aqui.' })
    ].map(s => (s.text ? s : { ...s, text: undefined })))
  },
  {
    id: 'm1-agencia-vermelho', nome: 'M1 Agência Vermelho', look: 'editorial', cor: ['#101010', '#EDEDED', '#E10600'],
    resumo: 'Preto grafite e branco alternados, acento vermelho, lista numerada, card com gráfico e palavra-chave em caixa vermelha. Tom de agência de marketing.',
    melhor: 'Agência, social media, anúncios, dicas em lista #1 a #N com CTA',
    ritmo: 'Cenas de 1,2 a 2,6 s, 45 a 80 s no total',
    receita: `ESTILO M1 AGÊNCIA VERMELHO (look "editorial"; acento #E10600, claro #EDEDED, escuro #101010)
- Destaque com asteriscos vale para UMA palavra: escreva *um* *milhão*, nunca *um milhão*.
- ELEMENTOS VISUAIS: o herói de cada cena vem da biblioteca Motion (item img pelo nome exato do catálogo, o que mais combina com a fala: celular, carta, moldura, jornal, moeda, cartão, olho, cérebro, mascote...). orb, ring e chart são só reserva quando a biblioteca não tem nada parecido; nunca emoji. Os heróis citados abaixo são o TIPO de elemento a procurar na biblioteca.
- Declare o acento em hex no topo do spec ("accent":"#E10600","light":"#EDEDED","dark":"#101010"). UMA cor de acento no vídeo todo.
- Estrutura: gancho com dor e valor (dark) → quebra de crença → virada (dark vira light com in circle vermelho) → 4 a 5 problemas em sequência → insight com número grande → método → lista numerada #1 a #N → metáfora → CTA "comente PALAVRA" → assinatura com logo da marca.
- Alterne "dark" (tensão, dor, CTA) e "light" (virada, solução, assinatura). A mudança de ambiente marca cada mudança de argumento.
- Texto em 1 a 4 palavras por bloco: palavra pesada (size 84 a 110, caixa-alta) + palavra leve menor (size 52 a 64) na mesma frase; a palavra-chave com *asteriscos* ganha o vermelho. Em pelo menos 1 de cada 3 cenas a palavra-chave tem destaque.
- Heróis (um por cena): card (vermelho, 3 itens curtos) para a lista; chart para "queda/crescimento"; texto grande (size 160 a 280) com o número em *destaque* ("*8* em 10", "*#1*"); profile para o perfil sendo montado (celular que se preenche); orb/ring vermelhos como apoio; img do mascote/logo da marca só pelo nome do catálogo. Nunca pessoas reais nem logos de terceiros.
- Lista numerada: antes de cada item uma cena curta com o numeral grande em texto ("*#1*", "*#2*") sobre um ring vermelho e curve:arc; depois a cena do item com card.
- Decoração: grid, barcode, badge, curve:left|right|arc, dots. Objetos entram com slideL/slideB/pop/drop e idle float/sway (±6 px).
- Transições: circle (vermelho) para virar de escuro a claro, whip, zoom, dim. Não repita a mesma duas vezes seguidas. Fim: fade ou dim para preto.
- Algo novo a cada 0,4 a 0,8 s: use step e start do texto (step .16 a .22) e items com "at".
- CTA: texto "Comente *PALAVRA*" em mode ticker numa cena dark, depois assinatura light com logo + "FOLLOW".
CHECKLIST: lista #1 a #N · perfil/celular que se monta (profile) · card vermelho · cena clara e cena escura · palavra-chave destacada · CTA com palavra · assinatura com a logo do cliente.
LIMITES DO MOTOR: duotone, folhas desfocadas, dólares e contador animado não existem; compense com chart, orb e gradientWord vermelhos.`,
    exemplo: exemploBase('editorial', '#E10600', [
      N({ items: [{ type: 'chart', color: '#E10600', x: .5, y: .62, size: 560, rot: -4, enter: 'slideB', idle: 'float' }] }, 2.2, 'dark', { value: 'Você vai | *desperdiçar* seus anúncios', y: .24, size: 76 }, { decor: ['grid', 'barcode'], narration: 'Você está prestes a desperdiçar o dinheiro dos seus anúncios.' }),
      N({}, 1.8, 'dark', { value: 'não porque anúncio | não *funciona*', y: .46, size: 62 }, { in: { type: 'dim', dur: .4 }, decor: ['dots'], narration: 'Não porque anúncio não funciona.' }),
      N({ items: [{ type: 'profile', handle: '@suamarca', name: 'Sua Marca', posts: 0, followers: 0, following: 0, bio: ['Bio clara', 'Oferta direta'], x: .5, y: .56, size: 520, enter: 'slideB', idle: 'float' }] }, 2.4, 'light', { value: 'mas seu *perfil* não está pronto', y: .2, size: 64 }, { in: { type: 'circle', dur: .5, x: .5, y: .5, color: '#E10600' }, decor: ['grid', 'curve:right'], narration: 'Mas o seu perfil ainda não está pronto.' }),
      N({ items: [{ type: 'ring', color: '#E10600', x: .5, y: .34, size: 380, enter: 'zoom', idle: 'spin', spin: 6 }] }, 1.4, 'dark', [{ value: '*#1*', y: .34, size: 200 }, { value: 'bio *clara*', y: .66, size: 84 }], { in: { type: 'whip', dur: .4 }, decor: ['curve:arc'], narration: 'Número um: bio clara.' }),
      N({ items: [{ type: 'card', title: 'Sua bio diz', x: .5, y: .5, size: 480, rot: -2, enter: 'drop', idle: 'sway', items: [{ icon: '1', text: 'Quem você ajuda' }, { icon: '2', text: 'O resultado' }, { icon: '3', text: 'O próximo passo' }], itemStep: .45 }] }, 2.6, 'light', null, { in: { type: 'zoom', dur: .4 }, decor: ['badge'], narration: 'Diga quem você ajuda, o resultado e o próximo passo.' }),
      N({}, 2.6, 'dark', { value: 'Comente *PALAVRA* e a gente analisa', y: .5, size: 64, mode: 'ticker', start: .15, step: .2 }, { in: { type: 'circle', dur: .45, x: .5, y: .5, color: '#E10600' }, narration: 'Comente a palavra e a gente analisa o seu perfil.' })
    ].map(s => (s.text ? s : { ...s, text: undefined })), { dark: '#101010', light: '#EDEDED' })
  },
  {
    id: 'm2-densidade-cinetica', nome: 'M2 Densidade Cinética', look: 'neon', cor: ['#000000', '#D8D8D6', '#E3142B'],
    resumo: 'Muita informação em poucos segundos: vermelho neon com glow, ciano de aberração cromática, cena de preto total antes da frase de impacto.',
    melhor: 'Aula curta, análise de técnica, explicar um conceito denso',
    ritmo: 'Cenas de 1,0 a 2,5 s, 20 a 40 s no total',
    receita: `ESTILO M2 DENSIDADE CINÉTICA (look "neon"; accent #E3142B, accent2 #00E5FF para o fringe ciano)
- Destaque com asteriscos vale para UMA palavra: escreva *um* *milhão*, nunca *um milhão*.
- ELEMENTOS VISUAIS: o herói de cada cena vem da biblioteca Motion (item img pelo nome exato do catálogo, o que mais combina com a fala: celular, carta, moldura, jornal, moeda, cartão, olho, cérebro, mascote...). orb, ring e chart são só reserva quando a biblioteca não tem nada parecido; nunca emoji. Os heróis citados abaixo são o TIPO de elemento a procurar na biblioteca.
- Topo do spec: "accent":"#E3142B","accent2":"#00E5FF","light":"#D8D8D6". UMA cor de acento (o ciano é só o fringe do efeito).
- Muito objeto por segundo: algo novo a cada 0,4 a 0,8 s. Cenas de 1,0 a 2,5 s, corte duro com animação interna intensa (step .14 a .2 no texto).
- Estrutura: gancho com número ou nome → quebra ("não é X") → contraste → mecanismo → princípio 1 → frase de impacto → princípio 2 → conclusão → CTA "DM palavra".
- Texto em 2 camadas na mesma frase: parte leve e pequena em cima (size 44 a 56) + parte pesada embaixo (size 84 a 120). Palavra-chave *acende* em vermelho com glow (o look neon já faz) e pode ganhar uma segunda marcação.
- Antes da frase de impacto: UMA cena dark curta (0,6 a 1,0 s) sem objeto e com decor "none" (preto total), depois a frase de impacto em size 100+ com a palavra-chave em *destaque*.
- Heróis: ring/orb vermelhos como "olho", "diamante", "quebra-cabeça"; chart (gráfico subindo em zigue); card para o "mural de pistas" (3 a 4 itens curtos: pesquisa, ideia, roteiro, copy) ; texto grande para número ou termo técnico; img da biblioteca (3D anotado) quando existir. Sem pessoas reais: use o mascote da marca.
- Decoração: grid, dots, scan, curve:s|arc, barcode. Alterne "dark" e "light" (no neon o light vira roxo profundo): troca brusca claro↔escuro a cada argumento.
- Transições: whip, zoom, dim, cut. Cut seco quando a frase continua.
- CTA: "DM *palavra* para o guia" em ticker, cena dark; palavra final em *destaque*.
CHECKLIST: 3 objetos de apoio · palavra-chave com glow · cena de preto total antes do impacto · card como mural · CTA com palavra.
LIMITES DO MOTOR: halftone, aberração cromática do recorte, mural de cortiça com dolly e setas desenhadas à mão não existem; o glow neon e o card cobrem o papel visual.`,
    exemplo: exemploBase('neon', '#E3142B', [
      N({ items: [{ type: 'orb', color: '#E3142B', x: .5, y: .64, size: 440, enter: 'zoom', idle: 'float' }] }, 2.0, 'dark', [{ value: 'O gancho de', y: .2, size: 50 }, { value: '100 *milhões*', y: .3, size: 100 }], { narration: 'O gancho de cem milhões.' }),
      N({ items: [{ type: 'chart', color: '#E3142B', x: .5, y: .62, size: 520, enter: 'slideB', idle: 'float' }] }, 1.8, 'light', { value: 'não é o *gancho*', y: .26, size: 84 }, { in: { type: 'whip', dur: .35 }, decor: ['dots'], narration: 'Não é o gancho.' }),
      N({ items: [{ type: 'ring', color: '#E3142B', x: .5, y: .6, size: 500, enter: 'pop', idle: 'spin', spin: 6 }] }, 1.8, 'dark', { value: 'o visual bate *antes* da palavra', y: .26, size: 66 }, { in: { type: 'zoom', dur: .35 }, narration: 'O visual bate no olho antes da palavra bater no ouvido.' }),
      N({}, .8, 'dark', null, { in: 'cut', decor: ['none'], narration: '' }),
      N({}, 2.0, 'dark', { value: 'não é decoração.|é *ritmo*', y: .5, size: 104 }, { in: 'cut', decor: ['none'], narration: 'Não é decoração. É ritmo.' }),
      N({ items: [{ type: 'card', title: 'O método', x: .5, y: .5, size: 480, rot: -2, enter: 'drop', idle: 'sway', items: [{ icon: '1', text: 'Pesquisa' }, { icon: '2', text: 'Roteiro' }, { icon: '3', text: 'Edição' }], itemStep: .4 }] }, 2.4, 'light', null, { in: { type: 'whip', dur: .35 }, decor: ['grid'], narration: 'Pesquisa, roteiro e edição.' }),
      N({}, 2.4, 'dark', { value: 'DM *palavra* para o guia', y: .5, size: 70, mode: 'ticker', start: .15, step: .2 }, { in: { type: 'dim', dur: .4 }, narration: 'Mande DM com a palavra para receber o guia.' })
    ].map(s => (s.text ? s : { ...s, text: undefined })), { accent2: '#00E5FF', light: '#D8D8D6' })
  },
  {
    id: 'm3-documentario-premium', nome: 'M3 Documentário Premium', look: 'cinema', cor: ['#48525C', '#131111', '#F2C200'],
    resumo: 'Cinza frio e preto, serifa itálica com glow, números destacados em amarelo, cena de respiro e câmera em push-in. Tom de documentário de negócios.',
    melhor: 'Vender comunidade, curso ou serviço; história de virada com números reais',
    ritmo: 'Cenas de 1,2 a 3,2 s, 30 a 60 s no total',
    receita: `ESTILO M3 DOCUMENTÁRIO PREMIUM (look "cinema"; accent #F2C200, claro #F5F2EA, escuro #131111)
- Destaque com asteriscos vale para UMA palavra: escreva *um* *milhão*, nunca *um milhão*.
- ELEMENTOS VISUAIS: o herói de cada cena vem da biblioteca Motion (item img pelo nome exato do catálogo, o que mais combina com a fala: celular, carta, moldura, jornal, moeda, cartão, olho, cérebro, mascote...). orb, ring e chart são só reserva quando a biblioteca não tem nada parecido; nunca emoji. Os heróis citados abaixo são o TIPO de elemento a procurar na biblioteca.
- Topo do spec: "accent":"#F2C200","light":"#F5F2EA","dark":"#131111". Acento único: amarelo. Nunca vermelho.
- Estrutura: abertura (marca + ano) → fato inicial com número → percepção negativa → marco de tempo ("três anos depois") → prova numérica 1 e 2 → logo/marca → RESPIRO "o que mudou." → explicação → conclusão forte → CTA/produto.
- Todo plano com push-in lento: use "cam":{"from":1,"to":1.12} em todas as cenas. Texto aparece palavra por palavra (step .22 a .3), no máximo 2 linhas na tela, sem cobrir o objeto principal.
- Texto narrativo em 2 a 4 palavras por linha (o look cinema já usa serifa itálica com glow). Palavras de valor (números, "bilhões", "três") em *destaque* e com size maior (84 a 110) que o resto (52 a 64).
- Cena de RESPIRO: 1 a 3 palavras ("o que mudou."), theme light, sem objeto, 0,8 a 1,2 s, a cada 4 a 6 cenas. Prepara a virada.
- Marco de tempo: cena curta só com texto grande ("*3* anos depois"), theme light.
- Prova numérica: texto com o número grande em *destaque* (size 160 a 220) + linha curta de apoio. Só use números fornecidos pelo dono: nunca invente.
- Heróis: orb/ring dourados como "moeda/moldura", chart para crescimento, card para 3 provas, img do mascote/avatar da marca como "retrato" (do catálogo, pelo nome). Dessaturado → cor: cena dark antes (negativo) e cena light depois (positivo).
- Decoração: bars (letterbox do cinema), grid, curve:arc, badge. Transições: fade, dim e whip; zoom para "atravessar a moldura".
- Fechamento: reveal de logo (img da marca em cena dark, enter zoom) → conclusão em ticker → CTA.
CHECKLIST: respiro · push-in em todos os planos · palavra de valor maior em amarelo · marco de tempo · prova numérica · logo no fim · texto nunca cobre o rosto/mascote.
LIMITES DO MOTOR: moldura dourada, mesa de jornais, papel rasgado, listras de luz e P&B→cor em foto não existem; use orb/ring dourados, texto grande e cenas dark→light.`,
    exemplo: exemploBase('cinema', '#F2C200', [
      N({ items: [{ type: 'ring', color: '#F2C200', x: .5, y: .45, size: 520, enter: 'zoom', idle: 'float' }] }, 2.2, 'dark', { value: 'Em *2022*, tudo parecia | perdido', y: .74, size: 54 }, { cam: { from: 1, to: 1.12 }, narration: 'Em dois mil e vinte e dois, tudo parecia perdido.' }),
      N({ items: [{ type: 'chart', color: '#F2C200', x: .5, y: .4, size: 520, enter: 'slideB', idle: 'float' }] }, 2.6, 'dark', { value: 'perdeu um *milhão* de clientes', y: .72, size: 56 }, { in: { type: 'dim', dur: .5 }, cam: { from: 1, to: 1.12 }, narration: 'A empresa perdeu um milhão de clientes em um trimestre.' }),
      N({}, 1.6, 'light', { value: '*3* anos depois', y: .46, size: 120 }, { in: { type: 'fade', dur: .4 }, cam: { from: 1, to: 1.08 }, narration: 'Três anos depois.' }),
      N({}, 2.4, 'dark', [{ value: '*325* mi', y: .42, size: 200 }, { value: 'de *assinantes*', y: .68, size: 62 }], { in: { type: 'whip', dur: .4 }, cam: { from: 1, to: 1.12 }, narration: 'Trezentos e vinte e cinco milhões de assinantes.' }),
      N({}, 1.0, 'light', { value: 'o que *mudou.*', y: .5, size: 84 }, { in: 'cut', decor: ['none'], narration: 'O que mudou?' }),
      N({}, 3.0, 'dark', { value: 'parou de competir por *preço*|e criou *momentos*', y: .5, size: 60 }, { in: { type: 'dim', dur: .5 }, cam: { from: 1, to: 1.14 }, narration: 'Parou de competir por preço e criou momentos culturais.' }),
      N({}, 2.8, 'dark', { value: 'Entre na *comunidade*', y: .5, size: 64, mode: 'ticker', start: .15, step: .22 }, { in: { type: 'fade', dur: .6 }, cam: { from: 1, to: 1.1 }, narration: 'Entre na comunidade.' })
    ].map(s => (s.text ? s : { ...s, text: undefined })), { dark: '#131111', light: '#F5F2EA' })
  },
  {
    id: 'm4-diorama-papel', nome: 'M4 Diorama de Papel Teatral', look: 'impacto', cor: ['#A82A2A', '#F1E8D6', '#F2E600'],
    resumo: 'Palco de papel: vermelho veludo, creme e dourado, título gigante em caixa-alta pesada, cartas numeradas e final em amarelo. Narrativa com personagem.',
    melhor: 'Narrativa com personagem, rivalidade, campanha emocional com o mascote da marca',
    ritmo: 'Cenas de 1,5 a 3,5 s, 25 a 40 s no total',
    receita: `ESTILO M4 DIORAMA DE PAPEL TEATRAL (look "impacto"; accent #A82A2A vermelho veludo, claro #F1E8D6, escuro #0E1B3A azul noite; final em amarelo)
- Destaque com asteriscos vale para UMA palavra: escreva *um* *milhão*, nunca *um milhão*.
- ELEMENTOS VISUAIS: o herói de cada cena vem da biblioteca Motion (item img pelo nome exato do catálogo, o que mais combina com a fala: celular, carta, moldura, jornal, moeda, cartão, olho, cérebro, mascote...). orb, ring e chart são só reserva quando a biblioteca não tem nada parecido; nunca emoji. Os heróis citados abaixo são o TIPO de elemento a procurar na biblioteca.
- Topo do spec: "accent":"#A82A2A","light":"#F1E8D6","dark":"#0E1B3A". Acento único: vermelho. O amarelo só aparece na cena final (theme light com bg amarelo via look impacto).
- O personagem é SEMPRE o mascote/avatar da marca (img do catálogo, pelo nome). Nunca personagens de terceiros.
- Estrutura: gancho com a "carta" do rival → carta do herói → mundo do herói (3 cartas numeradas) → tese → humanização → valor/crença → antagonista → duelo de títulos → virada para o negócio → assinatura em amarelo com o site.
- Título gigante em caixa-alta pesada (size 130 a 190), 1 a 2 palavras, atrás do mascote: coloque o texto com y .3 a .4 e o mascote (img size 520 a 700) por cima, em y .62. Frases poéticas curtas (2 a 4 palavras) em size 62 a 80.
- Cartas: card com title e 3 itens curtos como "carta de tarô" (MONEY, POWER, RESPECT = palavras de valor reais do tema, uma por item); entram com drop e idle sway (balanço ±3°).
- Palavra-chave com destaque: *asteriscos* e size maior quando for a ideia central.
- Movimento "de papel": entradas com pop/drop (overshoot), idle sway, passo de texto curto (step .2); câmera em cam {1→1.08}. Ritmo mais lento e teatral que os outros estilos.
- Decoração: stripes (piso listrado e cortinas), bars, dots, badge. Transições: zoom (atravessar moldura), whip, cut no beat, fade.
- Fecho: cena light com o site/marca em texto grande (size 100 a 120, *destaque*) e CTA curto abaixo.
CHECKLIST: título atrás do mascote · 3 cartas numeradas · pop com overshoot + sway · zoom como "atravessar moldura" · mascote da marca presente · fecho em amarelo com o site.
LIMITES DO MOTOR: o motor renderiza sempre em 30 fps (o 15 fps do stop-motion de papel não é possível; o balanço lento e o step curto dão a sensação) e não tem parallax por camada, moldura dourada, piso xadrez nem elipse desenhada à mão.`,
    exemplo: exemploBase('impacto', '#A82A2A', [
      N({ items: [{ type: 'card', title: 'O Rival', x: .5, y: .52, size: 470, rot: 6, enter: 'drop', idle: 'sway', items: [{ icon: '', text: 'Barulhento' }, { icon: '', text: 'Sempre igual' }, { icon: '', text: 'Sem alma' }], itemStep: .4 }] }, 2.2, 'dark', { value: 'Existe um *rival*', y: .16, size: 72 }, { decor: ['stripes'], narration: 'Existe um rival que faz tudo igual.' }),
      N({ items: [{ type: 'orb', color: '#A82A2A', x: .5, y: .6, size: 480, enter: 'pop', idle: 'sway' }] }, 2.0, 'light', [{ value: 'HERÓI', y: .26, size: 170 }], { in: { type: 'zoom', dur: .45 }, decor: ['dots'], cam: { from: 1, to: 1.08 }, narration: 'E existe o herói da sua marca.' }),
      N({ items: [{ type: 'card', title: 'O mundo dele', x: .5, y: .5, size: 480, rot: -3, enter: 'drop', idle: 'sway', items: [{ icon: 'I', text: 'Confiança' }, { icon: 'II', text: 'Cuidado' }, { icon: 'III', text: 'Resultado' }], itemStep: .5 }] }, 3.0, 'dark', null, { in: { type: 'whip', dur: .4 }, decor: ['bars'], narration: 'Confiança, cuidado e resultado.' }),
      N({}, 2.4, 'light', { value: 'ele ainda *acredita*|que dá certo', y: .5, size: 78 }, { in: { type: 'fade', dur: .5 }, decor: ['stripes'], cam: { from: 1, to: 1.08 }, narration: 'Ele ainda acredita que dá certo.' }),
      N({}, 2.6, 'light', [{ value: '*suamarca.com*', y: .46, size: 110 }, { value: 'a *história* continua', y: .66, size: 62 }], { in: { type: 'circle', dur: .5, x: .5, y: .46, color: '#F2E600' }, narration: 'A história continua no nosso site.' })
    ].map(s => (s.text ? s : { ...s, text: undefined })), { dark: '#0E1B3A', light: '#F1E8D6' })
  },
  {
    id: 'm5-retro-crt', nome: 'M5 Storytelling Retrô CRT', look: 'minimal', cor: ['#CFCFCB', '#151515', '#1E73D8'],
    resumo: 'Papel cinza com scanlines, serifa minúscula pequena, frases de 2 a 4 palavras, muitas cenas de respiro de 1 palavra e troca de objeto. Muitos cortes.',
    melhor: 'Contar como algo funciona com uma história ou metáfora (tecnologia, pagamento, IA, finanças)',
    ritmo: 'Cenas de 0,6 a 1,4 s, 20 a 40 s no total (o mais acelerado)',
    receita: `ESTILO M5 STORYTELLING RETRÔ CRT (look "minimal"; accent #1E73D8 azul das setas, claro #CFCFCB, escuro #151515)
- Destaque com asteriscos vale para UMA palavra: escreva *um* *milhão*, nunca *um milhão*.
- ELEMENTOS VISUAIS: o herói de cada cena vem da biblioteca Motion (item img pelo nome exato do catálogo, o que mais combina com a fala: celular, carta, moldura, jornal, moeda, cartão, olho, cérebro, mascote...). orb, ring e chart são só reserva quando a biblioteca não tem nada parecido; nunca emoji. Os heróis citados abaixo são o TIPO de elemento a procurar na biblioteca.
- Topo do spec: "accent":"#1E73D8","light":"#CFCFCB","dark":"#151515". UMA cor de acento. Os objetos podem usar o próprio acento.
- Plano médio abaixo de 1,2 s: muitas cenas de 0,6 a 1,4 s (mínimo 14 cenas em 20 s). Texto em 2 a 4 palavras, pequeno (size 44 a 58), minúsculas, frases que continuam entre cenas ("um comerciante está|em um mercado").
- Pelo menos 3 cenas de RESPIRO de uma palavra ("mas", "aos poucos", "impossível") sobre papel cinza (theme light, decor ["scan"], sem objeto, 0,6 a 1,0 s).
- Estrutura: personagem em cena → desejo → conflito ("mas há um problema") → escassez → respiro → camada do problema → pergunta-chave → virada ("aos poucos") → evolução com TROCA DE OBJETO → chamada ao público → CTA com site digitado.
- Troca de objeto (motor visual do estilo): 3 a 4 cenas seguidas de 0,8 a 1,2 s, cada uma com UM objeto grande (orb dourado = moeda, card = cartão, chart = nota/gráfico, ring azul = seta de troca) com enter pop/zoom e a MESMA posição, trocando um pelo outro.
- Decoração em todas as cenas: scan (scanlines), dots ou grid leve. Câmera: cam {1→1.1}. Cena escura só para a parte tecnológica final.
- Ilustrações de época só se forem da biblioteca da marca ou originais (img do catálogo); nunca ilustrações de terceiros.
- Transições: cut (no beat), fade curto, zoom, whip. Prefira cut.
- Fecho: cena dark com o site ("suamarca.com") em mode word, depois fim.
CHECKLIST: scan em todas as cenas · 3 cenas de respiro · troca de objeto com 3 objetos · plano médio < 1,2 s · texto pequeno minúsculo · fecho com o site digitado (mode word).
LIMITES DO MOTOR: RGB split e P&B→cor em foto, cursor clicando e barra de busca não existem; scan + ticker/word no site cobrem o fecho.`,
    exemplo: exemploBase('minimal', '#1E73D8', [
      N({ items: [{ type: 'orb', color: '#E8B923', x: .5, y: .58, size: 360, enter: 'pop', idle: 'float' }] }, 1.4, 'light', { value: 'um comerciante quer|comprar algo', y: .22, size: 50 }, { decor: ['scan', 'dots'], cam: { from: 1, to: 1.1 }, narration: 'Um comerciante quer comprar algo.' }),
      N({}, .8, 'light', { value: '*mas*', y: .5, size: 72 }, { in: 'cut', decor: ['scan'], narration: 'Mas.' }),
      N({}, 1.2, 'light', { value: 'como ele *pagaria?*', y: .5, size: 56 }, { in: 'cut', decor: ['scan'], narration: 'Como ele pagaria?' }),
      N({}, .8, 'light', { value: 'aos poucos', y: .5, size: 60 }, { in: 'fade', decor: ['scan'], narration: 'Aos poucos.' }),
      N({ items: [{ type: 'orb', color: '#E8B923', x: .5, y: .5, size: 380, enter: 'pop', idle: 'float' }] }, 1.0, 'light', null, { in: 'cut', decor: ['scan'], narration: 'A moeda.' }),
      N({ items: [{ type: 'card', title: 'Cartão', x: .5, y: .5, size: 420, rot: -4, enter: 'pop', idle: 'sway', items: [{ icon: '', text: 'Pague' }] }] }, 1.1, 'light', null, { in: { type: 'zoom', dur: .3 }, decor: ['scan'], narration: 'O cartão.' }),
      N({ items: [{ type: 'ring', color: '#1E73D8', x: .5, y: .5, size: 420, enter: 'zoom', idle: 'spin', spin: 5 }] }, 1.1, 'dark', { value: 'e agora no *celular*', y: .2, size: 52 }, { in: 'cut', decor: ['scan', 'grid'], narration: 'E agora, no celular.' }),
      N({}, 2.4, 'dark', { value: 'suamarca.com', y: .5, size: 60, mode: 'word', start: .2, step: .25 }, { in: { type: 'fade', dur: .4 }, decor: ['scan'], narration: 'Acesse o nosso site.' })
    ].map(s => (s.text ? s : { ...s, text: undefined })), { dark: '#151515', light: '#CFCFCB' })
  }
];

export const ESTILO_HARDCOPY = {
  id: 'hardcopy', nome: 'VSL', look: 'editorial', cor: ['#1a1a1a', '#3a3a3a', '#F5F2EB'],
  resumo: 'Vídeos reais da biblioteca como fundo, um por cena, com frases curtas por cima.',
  melhor: 'Quando você já tem vídeos e imagens reais para usar',
  ritmo: 'Cenas de 1,5 a 3,0 s',
  receita: 'ESTILO: VSL. Use os vídeos da coleção “Vídeos estilo VSL” da biblioteca, um por cena, com texto curto por cima (bg com shade 0,25 a 0,4). Look "editorial" para o texto. Transições fade e dim; cenas de 1,5 a 3,0 s.',
  exemplo: null
};
