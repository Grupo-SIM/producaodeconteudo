<!-- modo: auto -->
# Cores e tipografia das marcas

Fonte: o manual de cor e tipografia que o dono enviou em 18/11/2026. As cores foram medidas nos arquivos das logos.

Cada marca tem a paleta e as fontes no `marca.json` da sua pasta em `banco/marcas/`. Quando o servidor sobe, os dados entram **uma vez** na Identidade visual da marca:
- só nas linhas de cor e de fonte;
- o resto do texto fica como está;
- depois disso, o dono edita na tela da marca.

As fontes que o sistema ainda não tinha entram como arquivo da marca:
- Rajdhani: 007 Spyhacker;
- Quicksand: Atlas Hosting;
- Noto Serif: Corte dos Ricos;
- Cinzel: Grana na Hora.

| Marca | Principal / destaque | Paleta | Título · Texto | Fundo |
|---|---|---|---|---|
| 007 Spyhacker | Ciano Neon `#13ECE9` | Verde-água `#0F7D82`, Turquesa `#10B0B3`, Grafite `#252F30`, Preto Carvão `#0C0F0F` | Rajdhani Bold · Rajdhani | escuro |
| Atlas Hosting | Azul Atlas `#1A97C3` sobre Azul Noite `#000F19` (base) | Azul Claro `#33B5FF` (secundária), Azul Royal `#3259D2`, Violeta `#4F26DD`, Branco | Quicksand Bold · Quicksand | escuro |
| Central do Marketing | Verde Central `#0DE450` | Preto `#111111`, Branco | Poppins Bold · Poppins | escuro |
| Corte dos Ricos | Preto `#000000` | Branco Gelo `#F6F6F6`, Cinza Claro `#D7D7D7`, Cinza do Anel `#BBBBBB` | Noto Serif Bold · Open Sans | — |
| Marketing Raiz | Preto `#010101` e Branco (principais) | Lilás `#857CD5`, Pêssego `#F2AB7A`, Magenta Suave `#BD61AB` só como detalhe; Cinza `#626161` | Montserrat Bold · Montserrat Regular | claro |
| PagaTG | Roxo `#834DEB` | Lilás Claro `#B495F2`, Roxo Profundo `#22143D`, Preto, Branco | Poppins SemiBold · Poppins | escuro |
| Seguidores em Alta | Roxo `#9B23B7` | Azul `#009CFF`, Laranja Foguete `#FB611D` só como detalhe (a chama), Branco Gelo `#FEF9FB` | Poppins SemiBold · Poppins | — |
| SimIntPay | Roxo `#761FE3` (o do site) | Azul Pay `#5294FF` e Azul Marinho `#0A2F72` (logo), Preto, Branco | Poppins SemiBold · Poppins | escuro |
| Sim Intermediações | Violeta `#8351F1` (botões do site) | Roxo `#8C359B` e Magenta `#CC2F9C` (logo), Rosa Violeta `#B7349E`, Preto, Branco | Montserrat Bold Italic · Montserrat | escuro |
| Teron | Azul Elétrico `#1A71FE` | Azul Royal `#003FAE`, Azul Profundo `#00276D`, Navy `#001233` | Orbitron · Orbitron | escuro |
| Vivendo de Bet | Verde Neon `#21DC0D` e Branco | Verde Escuro `#116106`, Preto | Anton · Anton | — |
| Fraternidade* | Preto | Branco | Montserrat Bold Italic | — |
| Grana na Hora* | Preto `#070707` / Branco | Cinzas `#CACACA`, `#595959` | Cinzel | — |
| Marketplace* | Laranja `#FF5F00` | Laranja Claro `#FF7E3C`, Pêssego Claro `#FFDCD0`, Branco | Poppins SemiBold | — |

\* Essas três ainda não são marcas no sistema. Os dados entram sozinhos quando o dono criar a marca com esse nome.

## Regras
- O destaque vai na palavra-chave, no botão e no CTA. As outras cores da paleta são base e apoio.
- O mascote mantém as cores dele, mesmo quando elas forem diferentes da paleta. O Marketing Raiz, por exemplo, tem o mascote preto e dourado.
- Nenhuma cor de fora da paleta entra na marca, a não ser foto e objeto com cor própria.

## Troca de cor nos templates (ligada em 18/11, aprovada pelo dono)
- Vale para todos os templates aprovados, do 7 ao 13. A cor-assinatura do template vira o **destaque** da marca, e as cores de apoio do template mudam de tom junto, mantendo a relação entre elas.
- O fundo e as peças do template também mudam de tom.
- Fogo, nota de dinheiro e as peças de xadrez **não** mudam, porque têm cor própria.
- Fotos, mascotes e objetos de outros kits também não mudam.
- Para desligar numa peça: `cor_marca: false`.
- Em marca preto e branco (Marketing Raiz), o fundo e as peças ficam em preto e branco.
- Correção do dono (18/11): no Seguidores em Alta a cor principal é o roxo, e o laranja é só detalhe; no Marketing Raiz as principais são preto e branco, e o lilás é detalhe.
- Conferido nos sites das marcas (18/11): SimIntPay e Sim Intermediações usam roxo/violeta como cor principal (a logo tem outras cores), PagaTG e Central batem com o manual, Marketing Raiz é preto e branco em fundo claro, Teron é preto e branco com brilho azul. O 007 Spyhacker usa no site um ciano mais claro (`#6FDCF4`) que o da logo (`#13ECE9`). O site do Atlas é atlashosting.com.br (o .com é de outra empresa): base azul noite e botão azul claro.

## Regras do dono para as cores (18/11)
- **A base é sempre a cor mais escura da marca.** Ela é o fundo e o que dá a cara da marca. As cores mais claras são secundárias, para destaque e detalhe.
- **A variação é bem-vinda, sem fugir da identidade.** Dentro da mesma família de cor dá para variar conforme a arte e o contexto. No 007 Spyhacker, por exemplo, tanto o ciano neon da logo (`#13ECE9`) quanto o ciano claro do site (`#6FDCF4`) servem. Não é regra exata: escolha o tom que funciona melhor naquela arte.
- **O site da marca é a referência** quando o manual e o site discordarem.
