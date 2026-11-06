<!-- modo: auto -->
# Motion — Estilo M4 Diorama de Papel Teatral

> Observação do sistema Agentes SIM: o motor de vídeo renderiza sempre em 30 fps e só entende o vocabulário do guia de SPEC (look, decor, in, items orb/ring/chart/card/profile/gradientWord/img, text mode stack/ticker/word). Campos marcados com ★ não existem no motor: use o que existe e traduza o resto em imagem da biblioteca Motion. O herói visual de cada cena vem da biblioteca (img pelo nome exato).

## Prompt curto do estilo
**M4 Diorama de Papel Teatral:** "Estilo M4. Vertical 1080x1920, 15 fps sem interpolação suave. Cenografia de papel em camadas com parallax (1x, 1,5x, 2x): cortinas vermelhas, bilheteria, piso xadrez, ondas de papel, estrelas penduradas. Cartas e cartas de tarô numeradas com palavras de valor. Zoom atravessando moldura dourada. Título gigante em condensada pesada atrás do personagem; frases poéticas em slab com contorno; elipse vermelha desenhada. O personagem é o mascote da marca. Final em amarelo radial com o site em branco."

## Detalhe do estilo
"Diorama de Papel Teatral" (referência: EarnEdits personagens, 29 s)

**Quando usar:** narrativa com personagem, rivalidade, "psicologia de uma marca/pessoa", campanha emocional. Visual de teatro/baralho/papel recortado, com personalidade. É o único estilo **a 15 fps de propósito**, para o ritmo de stop-motion de papel.

**Formato:** vertical 1080x1920, **15 fps**, 25 a 40 s. Plano médio 2,9 s; cada plano é uma "cenografia" onde as peças balançam.

**Paleta:**
- Vermelho veludo `#A82A2A`, losangos preto `#111111` / vermelho `#B7282E` / creme `#F1E8D6` (padrão arlequim)
- Dourado `#C9962B` (molduras)
- Azul noite `#0E1B3A`, ondas de papel `#1E5BB8 → #4FA3E8`, estrelas laranja `#D98A2B`
- Fundo menta pálido com raios `#CFE3DD`
- Amarelo final radial `#F2E600` no centro até `#C9C400` nas bordas
- Cena de mesa de madeira quente `#6B3F26`

**Tipografia:**
- **Caixa-alta condensada pesada** (tipo Bebas Neue / Anton) em branco, tamanho gigante, para o título que fica **atrás** do personagem
- **Slab serifada display** (tipo Clarendon / Alfa Slab) em caixa-alta, branca com contorno preto e sombra, para frases poéticas
- **Sans arredondada com contorno cinza/3D** (tipo Fredoka) para "EDITORS" no fecho
- Palavras-chave com **elipse vermelha desenhada à mão** em torno

**Camadas:**
1. Cenografia de papel em camadas (fundo, meio, frente) com **parallax** diferente por camada
2. Personagem recortado (cutout) com sombra projetada
3. Props pendurados (relógio de bolso, lua crescente, estrelas em fio) que balançam
4. Título que **passa atrás do personagem** (letra parcialmente coberta pelo corpo)
5. Vinheta, grão de papel, marcas de dobra

**Elementos (biblioteca M4):**
- **Carta de baralho/tarô** com personagem e legenda em faixa; as cartas deslizam, se empilham e giram
- **Cartas de tarô numeradas** (algarismo romano no topo e palavra embaixo: MONEY, POWER, RESPECT) entrando uma por uma
- **Bilheteria de teatro** com letreiro "TICKETS 10c", cortinas vermelhas laterais, piso de listras preto e branco em perspectiva circular (op-art)
- **Zoom-through de moldura dourada** para a cena seguinte (papel de parede de redemoinhos azuis estilo pintura com várias molduras de pôsteres)
- **Moldura oval com correntes** balançando em pêndulo
- **Mar de ondas de papel recortado** em azul, céu estrelado, nuvens gravadas, estrelas laranja pendurando por fios
- **Globo de papel** num palito subindo das ondas
- **Mesa de madeira vista de cima:** máscara, jornais impressos, mão entrando com carta, outra mão com punho de babado
- **Skyline de prédios** em colagem com nuvens gravadas e céu preto estrelado; personagem flutuando com a capa ondulando
- **Piso xadrez** preto/vermelho/creme com duas lanternas acesas e o personagem no centro
- **Mesa de papel quadriculado** (graph paper) com objetos de escritório (calculadora, teclado) e cartas espalhadas
- **Três ícones de arquivo** (After Effects) lado a lado com **elipse vermelha desenhada**
- **Fundo amarelo radial** com o nome do site em branco com contorno

**Animação:**
- 15 fps: todo movimento tem passo discreto de 1/15 s, nada de interpolação suave (é o charme)
- Peças entram com **pequeno overshoot** e balançam ±3° depois
- Parallax: fundo move 1x, meio 1,5x, frente 2x
- Texto em letra por letra com leve "estalo" de escala
- Elipse vermelha desenha em 0,4 s (traço animado)

**Transições:** zoom atravessando moldura/carta/olho, cortina que abre, whip, flash de cor, corte seco no beat da música.

**Estrutura do roteiro (observada):**

| Tempo | Função | Visual |
|---|---|---|
| 0–2 s | Gancho: carta do vilão/rival gira e abre | carta com sol e nuvens, fundo menta |
| 2–4,5 s | Contraponto: carta do herói | piso arlequim, relógio de bolso, lua |
| 4,5–7,5 s | Mundo do herói | bilheteria, cartas de tarô (dinheiro, poder, respeito) |
| 7,5–10 s | Tese | "[ele] é definido por [o passado]" com elipse vermelha, molduras de pôsteres |
| 10–11,5 s | Humanização | moldura oval com correntes |
| 11,5–15 s | Valor / crença | ondas de papel, "ele ainda acredita…", globo de papel |
| 15–19,5 s | Antagonista | mesa com máscara, carta "NO RULES", cenas de filme |
| 19,5–24 s | Duelo de títulos | skyline, depois piso xadrez com título gigante atrás do personagem |
| 24–27 s | Virada para o negócio | mesa quadriculada, ícones de arquivo com elipse |
| 27–29 s | Assinatura | amarelo radial, nome do site em branco |

**Áudio:** medido: conduzido pela música (só 1 em 9 cortes tem rajada própria). Recomendado (não medido): whoosh de papel e impacto curtos nos zooms de moldura; sincronizar os cortes com a batida em vez de usar SFX em todo plano.

**Importante:** o vídeo de referência usa personagens e marcas de terceiros. **O agente nunca reproduz esses personagens.** No lugar entram o mascote/avatar da marca e personagens originais.

**Prompts de imagem (fal.ai):**
- Carta: `vintage playing card illustration of [mascote original], hand-engraved style, cream paper, ornate border, isolated`
- Bilheteria: `miniature paper-craft theater ticket booth with red velvet curtains, black and white striped circular floor, navy starry sky, diorama, soft studio light`
- Ondas de papel: `layered paper-cut blue ocean waves with white cutout clouds and hanging orange paper stars on strings, navy night sky, craft diorama`
- Moldura: `ornate baroque gold oval picture frame hanging on chains, front view, soft shadow, isolated`
- Piso xadrez: `dramatic checkered floor in black red and cream in perspective, two glowing vintage street lamps, warm dark background`
- Globo: `paper-cut Earth globe on a wooden stick, craft style, isolated`
- Skyline: `vintage engraved clouds over New York style brick buildings, starry black sky, collage style`

**Spec proposto:**

```json
{
  "format": {"w":1080,"h":1920,"fps":15},
  "palette": {"bg":"#A82A2A","gold":"#C9962B","night":"#0E1B3A","accent":"#F2E600"},
  "scenes": [
    {"dur":2,"theme":"paper","parallax":[1,1.5,2],
     "items":[{"type":"★card","src":"carta-rival.png","enter":"★spinIn","idle":"sway"}]},
    {"dur":3.5,"theme":"stage","in":{"type":"★frameThrough"},
     "items":[{"type":"★ticketBooth"},{"type":"★tarotStack","cards":["MONEY","POWER","RESPECT"],"step":0.5}]},
    {"dur":3,"theme":"floor","text":[{"value":"TITULO","layer":"★behindSubject","font":"★condensedHeavy","size":260}],
     "items":[{"type":"img","src":"mascote.png","layer":"front"}]}
  ]
}
```

**Checklist M4:** 15 fps sem interpolação suave · parallax em 3 camadas · título gigante atrás do personagem · zoom-through de moldura · cartas de tarô numeradas · elipse vermelha desenhada · fundo amarelo radial no fim · personagem é o mascote da marca.
