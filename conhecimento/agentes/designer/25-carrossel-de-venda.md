<!-- modo: formato venda -->
# Carrossel de venda: template 15 · Carrossel de venda (aprovado pelo dono, 19/11/2026)

Formato próprio do carrossel de venda, diferente de todos os outros (educativos, investigativo, estáticos). Vale para TODAS as marcas, sempre nas cores e na fonte da marca que publica. No JSON use `"template":"venda-ebook"`.

## Estrutura
1. **Capa (`venda-capa`):** a frase de capa da copy, grande, com entrelinha mais justa que o miolo (dono: a capa ficava espaçada demais), na fonte de título da marca, com o trecho-chave em marca-texto (`*assim*`) e a pílula "Arraste para o lado →". É ESTA a capa do carrossel de venda (aprovada no feed simulado da Marketing Raiz); não use estático como capa aqui.
2. **Miolo (`venda-pagina`, repete):** uma frase grande por página (campo `titulo`), com o trecho-chave em marca-texto; quando a copy tiver explicação, ela vai menor embaixo (campo `texto`).
3. **Páginas com foto (`venda-pagina` + `foto`): OBRIGATÓRIAS**, 2 ou 3 no carrossel, a cada 3 ou 4 páginas de texto, onde a copy marcou `[foto: ...]`; se a copy não marcou, escolha você as páginas em que uma cena real reforça a frase. Carrossel de venda sem foto: o sistema escolhe as páginas sozinho e o Gerente avisa o dono. A foto (cantos arredondados, ~60% da página) fica em cima e a frase embaixo.
4. **Fim (`venda-fim`, versão B aprovada):** a pergunta da copy grande com marca-texto (`titulo`), uma linha com o preço e a condição (`texto`) e "Clique no link da bio" com o círculo e a seta (`cta`).

## Foto: SEMPRE real, de banco. NUNCA gerada
- Neste formato a foto é sempre REAL, buscada nos bancos integrados (Pexels, Unsplash, Pixabay; se um falhar, o sistema segue nos outros e avisa o dono). Nunca gere imagem por IA aqui (outros formatos geram; este não).
- No campo `foto`, escreva o termo de busca EM INGLÊS do que a frase mostra, concreto e visual (ex.: "old laptop forgotten in office desk drawer", "frustrated business owner looking at spreadsheet on laptop", "person scanning barcode label on office chair with smartphone"). A foto tem que mostrar exatamente o que a frase diz, estilo foto editorial: real, limpa, sem texto nem número.
- Não achou nada que combine: a página fica só com texto (não force foto genérica).

## Visual fixo (o sistema monta sozinho pela marca)
- Fundo da seção **História e venda**, escolhido pela cor da marca (Corte dos Ricos = cinza papel; Marketing Raiz = branco granulado; roxos = roxo pincelado; verdes = verde neon escuro; azuis/ciano = preto com círculos).
- Logo pequena da marca discreta no canto de cima à DIREITA (dono, 19/11: à esquerda sumia no fundo granulado); número da página embaixo à direita.
- Fonte de título da marca na frase; texto de apoio menor (fonte de texto da marca ou Inter).
- Marca-texto: fundo claro = faixa preta com letra clara; fundo escuro = faixa na cor da marca; fundo colorido (roxo, laranja) = faixa clara. Entrelinha folgada para as faixas não encostarem de uma linha para outra.
- Sem mascote, ícone ou enfeite no miolo.

## Quando o dono pede ajuste neste formato
O desenho da página é fixo do template: mudar a posição de um texto no JSON não adianta, porque o sistema remonta a página pelo modelo. Para atender o dono, use os campos de ajuste de cada página (em `dados`):
- `entrelinha`: 1 a 2,2 (menor = linhas mais juntas; "texto muito espaçado" → diminua, ex.: capa 1.2, miolo 1.4).
- `escala`: 0,6 a 1,4 (tamanho do texto da página; "letra pequena" → 1.15).
- `logo`: "direita" (padrão) ou "esquerda".
- `foto`: termo em inglês para pôr foto real numa página ("senti falta das imagens" → ponha foto em 2 ou 3 páginas).
Aplique em TODAS as páginas quando o pedido for geral, e só na página citada quando ele apontar uma.
Desde 20/11/2026 o painel aplica esses ajustes SOZINHO, direto nos campos, antes de chegar a você ("capa menos espaçada, logo do outro lado e põe as fotos" → capa 1,6 → 1,33, logo à direita em todas, foto real em 2 ou 3 páginas). Se um pedido chegar até você neste formato, mexa só nos `dados`: NUNCA troque o fundo (é sempre o da seção História e venda), NUNCA acrescente degradê, sombra ou elemento, e nunca use entrelinha abaixo de 1,25 (o marca-texto encavala). O painel confere e desfaz o que fugir do pedido.

## Fotos: quem decide é você (dono, 20/11/2026)
O copy não marca foto. Você lê o texto pronto e escolhe 2 ou 3 páginas em que existe foto REAL fácil de achar que mostre literalmente um trecho específico do que a página diz (pessoa fazendo a ação dita, objeto citado, cena descrita). Página abstrata (conceito, promessa, número) fica sem foto. O painel busca várias opções com os seus termos em inglês, mostra para você e você fica com a que mostra o trecho; se nenhuma serve, tenta outro termo e, sem nada bom, a página fica sem foto e o dono é avisado. Foto genérica ou "mais ou menos" é pior que nenhuma. Reprovado pelo dono: tesoura e celulares velhos para "Pix que não confirma"; prédio de vidro para "checkout só".
Qualidade (dono, 20/11/2026): foto nítida, boa luz, cores fortes e vivas, assunto grande e fácil de ver no celular. Rede social é briga de atenção o tempo inteiro: foto apagada, escura, desbotada, granulada ou de baixa resolução não entra, mesmo que mostre o assunto (só fotos de 1600 px ou mais).

## Ritmo do miolo: três formas, nunca tudo igual (dono, 20/11/2026)
Referência aprovada (Controle Patrimonial, 9 páginas): capa · narrativa · foto · narrativa · foto · virada · foto · virada · fim.
- **narrativa** (`forma: "narrativa"`): só a frase grande; marca-texto no máximo no fim da frase, ou nenhum.
- **foto** (`forma: "foto"`): foto real em cima, frase embaixo com destaque no fim.
- **virada** (`forma: "virada"`): a frase INTEIRA em marca-texto + texto de apoio menor (`texto`), na página que apresenta a solução/produto e na que mostra o resultado. Virada nunca leva foto.
- Nunca duas páginas seguidas na mesma forma de texto; foto nunca em páginas vizinhas.
- Fotos: no máximo 2 (3 só em carrossel de 9+ páginas). Só em página de cena concreta, e só se a foto, vista sem o texto, já contar o trecho. Reprovado pelo dono: foto de "views/algoritmo" no celular para um trecho que falava de outra coisa. Melhor 1 foto certeira que 2 mais ou menos.
- O painel monta esse ritmo sozinho (`ritmoVenda`) quando a forma não vem; foto que falha refaz a página só com texto (sem buraco).

## Padrão aprovado (dono, 20/11/2026): pronto só com texto + até 3 sugestões de foto
O carrossel de venda sai PRONTO só com texto (capa, narrativa/virada alternadas, fim): é o post que pode ser postado. Depois, você deixa até 3 sugestões de foto (página + trecho + foto escolhida olhando as opções do banco). Na Mesa elas aparecem como etiqueta "💡 Sugestão de foto · página N" em cima do editor; o dono clica, vê a foto ao lado da página e aprova a troca ou recusa. Sugestão ruim não atrapalha nada: o post já está pronto. Só sugira foto que conte o trecho sozinha.
