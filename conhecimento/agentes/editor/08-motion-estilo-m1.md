<!-- modo: auto -->
# Motion — Estilo M1 Agência Vermelho

> Observação do sistema Agentes SIM: o motor de vídeo renderiza sempre em 30 fps e só entende o vocabulário do guia de SPEC (look, decor, in, items orb/ring/chart/card/profile/gradientWord/img, text mode stack/ticker/word). Campos marcados com ★ não existem no motor: use o que existe e traduza o resto em imagem da biblioteca Motion. O herói visual de cada cena vem da biblioteca (img pelo nome exato).

## Prompt curto do estilo
**M1 Agência Vermelho:** "Estilo M1. Vertical 1080x1920, 30 fps, 45 a 80 s. Preto `#101010` e branco `#EDEDED` alternando, acento vermelho `#E10600`. Tipografia: grotesca bold em caixa-alta tight + itálico leve menor; palavra-chave em caixa vermelha que varre. Heróis: celular que se monta, card vermelho com gráfico e contador, duotone vermelho, figura 3D branca, ícones em quadrados brancos. Lista numerada #1 a #N com numeral cromado. Folhas escuras desfocadas e dólares passando ao fundo. CTA: comente a palavra. Assinatura com botão FOLLOW e logo."

## Detalhe do estilo
"Agência Vermelho" (referência: SocialHeaven, 77,8 s)

**Quando usar:** vídeo de agência de marketing, social media, anúncios, dicas em lista numerada com CTA final. Ritmo "educativo e persuasivo", fundo escuro com virada para claro. É o estilo mais longo (até ~80 s) e o mais baseado em mockup de celular.

**Formato:** vertical 1080x1920, 30 fps, 45 a 80 s. Referência medida: plano médio 3,1 s (mas com muita animação interna: algo muda a cada ~0,5 s).

**Paleta (hex estimado dos quadros):**
- Preto grafite `#101010`, preto profundo `#0A0B0B`
- Branco sujo `#EDEDED` a `#F4F4F4` (cenas claras, com sombras de folhas)
- Vermelho de acento `#E10600` (cards, palavra-chave, botões). Em sombra aparece `#800706`.
- Cinza de wireframe `#D9D9D9`, cinza cromado nos numerais `#BDBDBD → #5A5A5A`
- Gradiente laranja→vermelho só em uma palavra de destaque (INSTAGRAM)

**Tipografia (semelhança visual):**
- Grotesca bold em caixa-alta, tracking apertado (tipo Helvetica Neue / Inter Tight Bold) para a palavra principal
- Itálico leve ou light (tipo Helvetica Light Italic) para a palavra secundária, em tamanho menor
- Proporção observada: palavra pesada 1,5x a 1,8x maior que a leve; palavra-chave em vermelho
- Texto aparece **letra por letra com "letra fantasma"**: antes de fixar a letra, outra letra cinza aparece embaçada e troca (efeito de digitação com erro)

**Camadas (de trás para frente):**
1. Fundo (preto grafite com grão **ou** branco com textura de papel e sombra de folhas de palmeira)
2. Decoração de fundo: folhas de monstera ou de bordo em vermelho escuro (desfocadas, girando devagar), notas de dólar desfocadas passando, grade fina branca a ~8% de opacidade, arco branco fino, régua de tracinhos na borda
3. Herói: mockup de celular, card vermelho, polaroid, estátua duotone
4. Props: ícones em quadros brancos arredondados, cursor de mão, selo estrela vermelha
5. Texto
6. FX: vinheta, grão, glow no texto sobre escuro

**Elementos recorrentes (biblioteca M1):**
- **Mockup de celular que se monta:** começa em silhueta cinza (skeleton), os blocos vão preenchendo (foto de perfil, números, bio, destaques, grade de posts). Isso transmite "perfil sendo construído".
- **Card vermelho arredondado com gráfico:** quadrado `#E10600`, linhas horizontais finas brancas, linha de gráfico branca que desenha para baixo (queda), contador acima ("$711 → $1,000").
- **Leque de 3 celulares/anúncios** com rotação leve.
- **Duotone vermelho:** foto recortada em tom vermelho (halftone), sobre fundo claro com moldura cinza ornamentada; sobre fundo escuro dentro de um post de Instagram.
- **Estátua clássica vermelha** segurando um celular, em moldura cinza barroca, com ramos de cerejeira rosa nos cantos (cena clara com grade).
- **Figura 3D branca** (boneco de escritório) sobre cartão vermelho ou círculo branco que dá zoom.
- **Numeração "#1 … #5"** em cromado 3D com sombra, com uma curva branca fina cruzando a tela, sempre antes de cada ponto da lista.
- **Caixa de contorno** ("Results") com linhas verticais ligando blocos de texto (organograma simples).
- **Ícones em quadrados brancos** (cursor, curtida, olho) com ícone vermelho, entram em cascata.
- **Cursor de mão** que clica em ícones (WhatsApp, Booking) e em botões.
- **Selo estrela vermelha (starburst)** atrás de palavra importante.
- **Iris-out final:** vinheta que fecha como elipse até preto.

**Animação:**
- Entrada de objeto: 0,3 a 0,5 s, vindo de fora do quadro com rotação, ou escala com overshoot.
- Palavra-chave: aparece dentro de uma caixa vermelha que varre da esquerda ("waste"), e depois o vermelho vira texto.
- Contagem de número: rola de baixo ($711 → $1,000).
- Celulares: entram girando em 3D leve, estabilizam, ficam com float de ±6 px.
- Câmera: push-in contínuo de 1,00 para ~1,06 por plano.

**Transições:** whip com blur, zoom que atravessa o celular, círculo vermelho crescendo (scene de "ads" para perfil), mudança brusca de escuro para claro com varredura, fade para preto no fim.

**Estrutura do roteiro (modelo, linha do tempo observada):**

| Tempo | Função | O que aparece | Visual |
|---|---|---|---|
| 0–3,5 s | Gancho com dor e valor | "você está prestes a desperdiçar $1.000 em anúncios" | notas de dólar, card vermelho com gráfico caindo |
| 3,5–5 s | Quebra de crença | "não porque anúncios não funcionam" | leque de 3 anúncios no celular |
| 5–7,5 s | Virada | "mas seu perfil não está pronto" | fundo claro, celular escuro → vermelho |
| 7,5–21 s | Problemas em sequência (4 a 5 falhas) | "sem bio clara", "post aleatório", "último post semanas atrás", "eles saem em 4 s" | celular se montando, estátua vermelha, polaroid |
| 21–26 s | Insight numérico | "8 em cada 10 negócios cometem esse erro" | 3D branco, círculo, número grande vermelho |
| 26–31 s | Contra-intuitivo | "anúncios trazem atenção, o perfil faz a venda" | 3 ícones + selo estrela |
| 31–35 s | Promessa do método | "antes de rodar qualquer anúncio, corrigimos 5 coisas" | wireframe, cursor, blur para preto |
| 35–61 s | Lista numerada #1 a #5 | cada item: título curto + 1 a 2 detalhes (bio, destaques, 9 últimos posts, CTA, branding) | celular + numeral cromado + curva |
| 61–69 s | Metáfora | "seu perfil é sua vitrine; convidaria clientes para uma loja bagunçada?" | vitrine 3D, mira vermelha |
| 69–73 s | CTA | "comente PALAVRA que faremos uma análise gratuita" | celular, forma rosa, caixa de texto |
| 73–77,8 s | Assinatura | botão FOLLOW + logo + slogan | fundo branco com ornamentos pretos, iris-out |

**Áudio:** medido: o arquivo original é quieto (-26 LUFS), então não use como alvo; impactos graves coincidem com 8 de 24 cortes e rajadas agudas com 9 de 24. Recomendado (não medido): aplicar -14 LUFS, impacto nos números e viradas, whoosh na entrada de celular, tick no texto, ding no CTA.

**Prompts de imagem (fal.ai) — todos com fundo neutro, sem logos de terceiros, sem texto:**
- Celular: `photorealistic modern smartphone, front view, slightly tilted, clean generic social media profile screen with abstract placeholder content (no real brand logos), soft studio light, realistic shadow, isolated on plain black background`
- Duotone: `photorealistic person from the waist up holding a smartphone, strong red duotone halftone treatment, cutout style, isolated on neutral background, no text`
- Estátua: `classical marble sculpture of a young man holding a smartphone, solid red monochrome tint, studio light, isolated on neutral background`
- Boneco 3D: `3D render of a white clay figure sitting at a desk with laptop, soft studio light, isolated on neutral background`
- Folhas: `dark red monstera leaves, shallow depth of field, isolated on black`

**Spec proposto para o motor (campos novos marcados com ★, requerem implementação):**

```json
{
  "format": {"w":1080,"h":1920,"fps":30},
  "palette": {"bg":"#101010","fgLight":"#EDEDED","accent":"#E10600"},
  "scenes": [
    {"dur":3.5,"theme":"dark",
     "decor":["★monstera:red","★dollarDrift","★hairGrid","★ruler:right"],
     "text":[{"value":"You're | about to *waste*","style":"★lightItalic+boldCaps","highlight":"★boxWipe:#E10600"}],
     "items":[{"type":"★redCard","x":0.5,"y":0.55,"size":620,"chart":"★lineDown","counter":"★count:711->1000"}]},
    {"dur":2.4,"theme":"light","in":{"type":"circle","color":"#E10600","dur":0.5},
     "decor":["★palmShadow"],
     "items":[{"type":"★phoneBuild","from":"skeleton","fill":["avatar","stats","bio","highlights","grid"]}]}
  ]
}
```

**Checklist M1:** celular se monta (não aparece pronto) · pelo menos 1 duotone vermelho · numerais cromados #1 a #N · palavra-chave em caixa vermelha varrendo · cena clara e cena escura · CTA com palavra para comentar · assinatura final com logo da marca (use a logo do cliente, nunca a da referência).
