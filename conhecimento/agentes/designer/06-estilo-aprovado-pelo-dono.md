<!-- modo: sempre -->
# Estilo de arte aprovado pelo dono (padrão de todas as marcas)

O dono aprovou este estilo em outubro de 2026. Ele vale para TODAS as marcas. O que muda de uma marca para outra são as cores, a identidade (logo, fonte, mascote) e o assunto; a estrutura é sempre a mesma. Na dúvida, siga este documento antes de qualquer outro.

## O que o dono aprovou
1. **Capa em camadas.** Ambiente escuro desfocado, personagem recortado e grande, partículas do tema em volta e o texto por cima. Modelos de capa: "revista" (título gigante e personagem logo abaixo, com a cabeça encostando no título) ou "heroi" (personagem à direita e texto à esquerda). A capa é o que converte: capriche nela.
2. **Logo centralizada no alto**, sempre no mesmo lugar e no mesmo tamanho em todas as páginas. Sem contador de páginas.
3. **"Arraste para o lado" centralizado no rodapé**, em todas as páginas menos a última. A capa não leva outra pílula de arrastar.
4. **Hierarquia de cor: uma coisa em destaque por página.**
   - Título de uma palavra só ("SUCESSO"): o título fica branco e a chamada pequena de cima vai na cor da marca.
   - Título com palavra marcada ("O digital não é *mágico*"): só essa palavra vai na cor da marca e a chamada fica branca.
   - Nunca marque mais de uma palavra ou expressão por título.
5. **Personagem com a cor natural.** A cor da marca entra só na luz: contorno, brilho do canto e partículas. Nunca pinte a pele ou a roupa com a cor da marca.
6. **Fundo escuro e fiel à marca.** Preto dominante, com a luz da cor de destaque vindo do canto.
7. **Páginas internas: texto forte com mídia misturada.** Alterne entre página só de texto, página com o mascote ou objeto recortado saindo pelo canto ("objeto") e página com foto em cartão ("foto"). Alterne também o fundo escuro e o claro quando a marca usa páginas claras.
8. **Contatos só na última página** (ou no post único).
9. **Última página: uma frase de fechamento e um botão**, com a palavra-chave em destaque.

## Como escrever a capa
- Chamada pequena de 2 a 5 palavras que cria curiosidade: "4 mitos que te travam", "O que ninguém te conta".
- Título de 1 a 5 palavras. Uma palavra gigante funciona muito bem no modelo revista ("SUCESSO", "DINHEIRO", "ATENÇÃO").
- Personagem expressivo, ligado ao assunto, olhando para a câmera, com um objeto do tema na mão quando fizer sentido (celular, dinheiro, notebook).
- Partículas do tema: "flying banknote", "gold coin", "chess pawn", "glowing notification icon".

## Ordem de um carrossel de 7 páginas (referência)
1. Capa (revista ou heroi)
2. texto com objeto ou mascote
3. numero com foto em cartão (fundo claro, se a marca usa)
4. texto só com tipografia
5. numero com objeto
6. lista (resumo do que funciona)
7. cta

## Erros que o dono apontou e que não podem voltar
- **Quebra de linha ruim.** Nenhuma linha do título termina em palavra fraca ("de", "não", "o", "que", "para"), e nenhuma palavra curta fica sozinha numa linha. Quebre você mesmo com "|" pensando no sentido: "O digital | não é *mágico*", "Tem que viralizar | *logo*".
- **Personagem cobrindo letra.** Com título de 2 linhas, o personagem fica logo abaixo, sem cobrir nenhuma letra. A cabeça só encosta no título quando ele é uma palavra só.
- **Objeto cortado ou em cima do texto.** Mascote e objetos das páginas internas ficam inteiros, dentro do quadro e acima do rodapé, sem encostar no texto. Peça objetos com forma clara e fundo simples (o painel recorta).
- **Halo colorido em volta do recorte.** Nada de contorno verde/azul em volta de objeto recortado: a luz da marca vem do fundo, atrás do objeto.
- **Letra gigante decorativa sem motivo.** "fantasma" só quando a marca usa (ex.: palavra fantasma da Central); não use em lista.
- **Duas cores de destaque na mesma página.** Uma coisa em destaque por página, sempre.
- **Última página vazia.** Feche com a frase, o botão e, se fizer sentido, o mascote ou o objeto da capa voltando ("objeto" no modelo cta).

## Templates: a mesma estrutura, vários conteúdos, todas as marcas
- Todo pedido de arte vem com o catálogo de TEMPLATES (os da casa e os que o dono salvou). Leia o roteiro e escolha o template cujo "quando usar" combina com a copy: lista de ferramentas ou números vai no "Lista numerada"; quebra de crença no "Mitos e verdades"; tutorial no "Passo a passo"; venda no "Oferta"; opinião no "Opinião / frase forte".
- Simples = conteúdo direto e rápido de ler (lista, números). Robusto = capa de impacto e mais mídia (mitos, oferta, tutorial). Em dúvida, prefira o robusto para a capa chamar mais atenção.
- Informe "template":"id" no JSON e escreva as páginas na ordem da estrutura. O painel completa o modelo de cada página, o mascote e o fundo claro.
- O template é o mesmo para todas as marcas: o que muda é a cor, a logo, o mascote e o assunto.

## Mascote
- Toda marca deve ter o seu mascote cadastrado (Conhecimento › Arquivos, tipo "mascote"). Ele aparece na capa quando não há personagem, em páginas internas alternadas e na última página.
- Varie a pose entre as páginas: use as poses já aprovadas (arquivos do mascote) ou peça uma pose nova escrevendo "nome-do-mascote (pose: sitting relaxed with a laptop)". O painel gera a pose fiel ao mascote original.
- Poses que funcionam: apontando para quem vê (capa), sentado com notebook, correndo, joinha, pensando, comemorando, acenando (última página).

## Roteiro no modelo do dono
- O roteirista entrega cada página como "📌 Slide N — NOME" com linhas "Rótulo: texto". O painel já lê essas páginas e manda junto do pedido ("PÁGINAS JÁ LIDAS DO ROTEIRO"). Parta delas: mantenha os textos, encurte só para caber e reescreva o "Visual" em inglês nos campos foto, objeto e partículas.
- Página de contraste ("Como o amador faz:" / "Como a marca forte faz:", "O que te disseram:" / "A realidade:") vai no modelo "lista" com "contraste": true: sem número, letras maiores e o lado certo na cor da marca. O título dessa página fica sem destaque, porque o destaque já é o lado certo.
- Lista numerada ("1. Item: explicação") vai no modelo "lista" normal.
- Capa com manchete longa ("NEUROCIÊNCIA CONFIRMA: 95% DAS DECISÕES…"): o que vem antes dos dois-pontos vira a chamada pequena e o resto o título, com o número em destaque. Subtexto entre parênteses vira o texto de apoio da capa ("texto" no modelo heroi).
- Última página: "Texto" vira a frase (se for longa, fique com a pergunta) e a "Chamada" vira o botão curto: "Comente MINDSET", "Link na bio", "Acesse o site".
- Marca com mascote: o mascote é o protagonista da capa, na pose que o "Visual" pede e com o cenário do tema atrás (ex.: astronauta fincando a bandeira na Lua, com a Terra ao fundo). Pedido de pose do roteirista entre colchetes ("[mascote: correndo]") vale para aquela página.
