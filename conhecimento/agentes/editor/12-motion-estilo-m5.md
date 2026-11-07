<!-- modo: auto -->
# Motion — Estilo M5 Storytelling Retrô CRT

> Observação do sistema Agentes SIM: o motor de vídeo renderiza sempre em 30 fps e só entende o vocabulário do guia de SPEC (look, decor, in, items orb/ring/chart/card/profile/gradientWord/counter/img, text mode stack/ticker/word). Campos marcados com ★ não existem no motor: use o que existe e traduza o resto em imagem da biblioteca Motion. O herói visual de cada cena vem da biblioteca (img pelo nome exato).

## Prompt curto do estilo
**M5 Storytelling Retrô CRT:** "Estilo M5. Vertical 1080x1920, 30 fps, 20 a 40 s. Scanlines horizontais e RGB split em tudo, papel cinza `#CFCFCB`, serifa minúscula pequena (texto 2 a 4 palavras). Ilustração IA de época original (P&B → cor). Cenas de respiro com 1 palavra. Troca de objeto com seta circular azul (moeda, cartão, nota, celular). Mãos, ícones 3D macios, parede de código verde. Plano médio menor que 1,2 s. Final com cursor clicando e site digitado."

## Detalhe do estilo
"Storytelling Retrô CRT" (referência: EarnEdits história de época, 26,3 s)

**Quando usar:** explicar como algo funciona contando uma história antiga ou uma metáfora ("um comerciante no mercado… como pagar?"), passando depois para o presente com tecnologia. É o estilo com **mais cortes por minuto** (plano médio 0,9 s). Muito bom para tema de tecnologia, pagamento, IA, finanças, "como surgiu".

**Formato:** vertical 1080x1920, 30 fps, 20 a 40 s.

**Paleta:**
- Cinza papel `#CFCFCB` com **linhas horizontais de scanline** atravessando
- P&B real, sem sépia, no início; as imagens ficam P&B ou em cor (a cena de virada recoloriza)
- Texto quase preto `#151515` (sobre papel) ou branco `#FFFFFF` (sobre imagem)
- **Uma cor viva por objeto:** moedas amarelas `#E8B923`, cédula verde `#2E9E3E`, setas e cartão azul `#1E73D8`, matrix verde `#1BE05A`, ícone violeta escuro
- Final: interface escura com verde `#2EBD4E`

**Tipografia:**
- **Serifa transicional em minúsculas** (tipo Newsreader / Source Serif / Tiempos), pequena, centrada, 22 a 28 px no 720p
- Branca sobre imagens, preta sobre o papel cinza, com **aberração cromática azul/vermelha** nas bordas das letras (efeito CRT)
- Texto entra **palavra a palavra**, em frases curtas que continuam entre cenas ("A merchant is standing / in a busy market")

**Camadas e efeitos:**
1. Imagem fotográfica ou ilustração IA com estilo vintage (início P&B)
2. Textura CRT: **scanlines horizontais** em todo o quadro (≈20 a 30% de opacidade) e leve RGB split
3. Vinheta e grão
4. Texto minúsculo
5. Ícones 3D leves em cima do papel cinza

**Elementos (biblioteca M5):**
- **Ilustração IA de época:** mercado do século XIX (P&B), rua com carro antigo (cor), loja de boticário com letreiro e balão de fala ("HOW COULD YOU PAY"), quarto visto de cima com homem de pijama na cama
- **Mãos** fotografadas ou em halftone cinza: duas mãos trocando moedas; mão com moeda dourada e um "?" aparecendo embaixo
- **Moedas amarelas** brotando na palma da mão
- **Ícone de notificação** deslizando sobre a imagem (nota verde com sinal de proibido)
- **Moeda grande "LIBERTY"** com **ícone de duas setas azuis circulares** (câmbio/troca) girando, depois **cartão azul**, depois **maço de notas**, depois **celular sobre jornais antigos**, cada objeto trocando o outro com o mesmo ícone de seta — a "troca de objeto" é o motor visual do estilo
- **Parede de código verde (matrix)** passando, e silhueta de pessoa diante de uma "parede de dados" brilhante
- **Cartões de ID 3D macios** em pastel azul-turquesa
- **Mão segurando celular** com cartão flutuando sobre a tela
- **Ícone de arquivo (AEP) + cursor** que clica e o ícone encolhe
- **Barra de busca digitando** o site em cima de um fundo borrado da página

**Animação:**
- Imagem: push-in lento (1,00→1,10) e **troca de P&B para cor** num corte seco
- Texto: blur-in 0,2 s; frases curtas (2 a 4 palavras) mudam a cada 0,6 a 0,9 s
- Objetos: entram vindo de fora com rotação leve, **swap por seta circular** (o objeto novo aparece no lugar do antigo girando em 3D)
- Cursor: curva suave até o ícone, clique (escala 0,9), ícone reage
- Cena de respiro: papel cinza com 1 palavra serifada ("wonders", "impossible", "But", "Slowly"), fica 0,6 a 1 s

**Transições:** corte seco no ritmo da música; flash; blur curto; trocas de objeto por seta; fade para preto antes da cena de matrix.

**Estrutura do roteiro (observada):**

| Tempo | Função | Texto | Visual |
|---|---|---|---|
| 0–2 s | Personagem em cena P&B | "um comerciante está em um mercado movimentado" | ilustração IA, push-in |
| 2–3,5 s | Desejo | "ele quer comprar algo" | rua em cor, costas do personagem |
| 3,5–4,5 s | Conflito | "mas há um problema" | papel cinza |
| 4,5–6 s | Escassez | (mãos com moedas) | foto das mãos |
| 6–6,5 s | Respiro | "maravilhas" | papel cinza |
| 7–9 s | Primeira camada do problema | (homem na cama, ícone de pagamento bloqueado) | vista de cima |
| 9–10,5 s | Respiro | "no começo / parecia impossível" | papel cinza |
| 11–14 s | Pergunta-chave | "como você pagaria?" | loja, mão com moeda, "?" |
| 14–15 s | Virada | "mas / aos poucos" | papel cinza |
| 15–20 s | Evolução tecnológica | (moeda → cartão → nota → celular, trocas por seta) | matrix, ícones 3D |
| 20–23 s | Chamada ao público | "editores" | pessoa, cartões ID |
| 23–26,3 s | CTA | clique no arquivo + site digitado | cursor, barra de busca |

**Áudio:** medido: música conduz; 12 de 29 cortes têm rajada aguda (whoosh/ruído) e só 1 tem impacto grave. Recomendado (não medido): tick suave por palavra, whoosh nas trocas por seta, clique no cursor, ding no site digitado.

**Prompts de imagem (fal.ai):**
- Mercado: `19th century crowded covered bazaar, arched ceiling with hanging lanterns, merchant in top hat holding fabric, black and white engraving-photograph look, film grain`
- Rua em cor: `1920s American street with vintage cars, brick buildings, warm muted color grade, painting-like illustration`
- Boticário: `vintage apothecary and general store interior with wooden counter, sepia-free black and white photo look, shop sign text generic`
- Quarto: `top-down view of a man in pajamas lying on a single bed on cobblestone-like floor pattern, black and white, soft shadow`
- Ícones 3D: `3D soft clay style icon of a [credit card / ID card / banknote / coin], pastel, isolated on light gray`
- Seta de troca: `blue circular double-arrow swap icon, glossy 3D, isolated`
- Matrix: `green matrix code rain, shallow depth of field, mirrored characters`
- Papel CRT: `light gray paper with fine horizontal scanlines, slight chromatic aberration, vignette`

**Spec proposto:**

```json
{
  "format": {"w":1080,"h":1920,"fps":30},
  "palette": {"bg":"#CFCFCB","ink":"#151515"},
  "fx": ["★scanlines:0.25","★rgbSplit:1.5px","grain","vignette"],
  "scenes": [
    {"dur":2,"theme":"photo","bg":"mercado-pb.png","cam":{"from":1,"to":1.1},
     "text":[{"value":"a merchant is standing | in a busy market","font":"★serifLower","size":42}]},
    {"dur":0.8,"theme":"paper","text":[{"value":"but there's a problem.","font":"★serifLower","size":54}]},
    {"dur":1.2,"theme":"paper","items":[{"type":"img","src":"moeda.png","enter":"pop"},{"type":"★swapArrows","to":"cartao.png"}]}
  ]
}
```

**Checklist M5:** scanlines + RGB split em tudo · texto serifado minúsculo pequeno · pelo menos 3 cenas de respiro com 1 palavra · uma troca de objeto com seta circular · P&B → cor · fecho com cursor clicando e site digitado · plano médio < 1,2 s · ilustrações de época originais (nunca ilustrações de terceiros).
