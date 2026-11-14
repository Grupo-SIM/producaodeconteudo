# Checklist do treino do Designer

Regra do treino (decisão do dono, 14/11/2026): dar vida, formato a formato, à copy que já foi aprovada em `carrosseis-aprovados-producao.md`, sem escrever copy nova. Formato que ainda não tem copy aprovada: o time de copy escreve, entrega ao Designer e o dono corrige os dois.
Como mandar: Fluxo → **Treino do Designer** → escolhe a peça e a marca → Mandar. A peça entra direto na etapa de arte; o dono corrige na Mesa de revisão. Cada correção do dono vira regra em `conhecimento/agentes/designer/`.

## Ordem (o dono quis começar pelas peças menores)
- [ ] 1. Feed estático: 17 (Vivendo de Bet, 2 cards)
- [ ] 2. Feed jornalístico (cards da matéria): 37 (Seguidores em Alta) e 36 (Vivendo de Bet)
- [ ] 3. Carrossel educativo (1 a 10, 14, 15, 23 a 26)
- [ ] 4. Carrossel de história real (11, 12, 13, 16)
- [ ] 5. Carrossel de venda (21, 22)
- [ ] 6. Stories de venda (18, 19, 20, 43, 44)
- [ ] 7. Estático de venda e carrossel de notícia (sem copy aprovada: Copy escreve antes)

## Como cada correção entra
- Vira regra na base do Designer (`conhecimento/agentes/designer/`) e, ao mesmo tempo, item de conferência na base do Revisor (`conhecimento/agentes/gerente/`), igual ao treino do Copy: o Revisor passa a cobrar do Designer o que o dono corrigiu.
- No treino, a peça vai direto para a Mesa do dono: uma chamada do Designer, sem inspeção visual, sem refazer automático e sem as rodadas do Revisor.

## Correções do dono
- 14/11/2026 · Teste 37 (Zyrion): foto de fundo sem letras/números; foto chocante e ligada ao assunto; capa até 100 caracteres e contracapa até 130, texto maior volta para o Copy encurtar; no editor, o fundo pode ser apagado (clique no fundo + Delete ou botão).
- 14/11/2026 · Feed jornalístico: referências Zyrion (capa dividida, foto + círculo, foto única; contracapa com cartão de post do X) e Nuvo. Base `09-feed-jornalistico.md`; fotos de banco em alta, vivas; preto e branco em notícia triste.
(registrar aqui e na base do Designer a cada rodada)

## Onde paramos (14/11/2026, para a próxima conversa)
- Sistema zerado: só trabalha o que o dono pede (Treino, + Novo conteúdo, Gerente) ou a grade de Produção diária (tudo em 0). Cérebro diário e relatório automático desligados.
- Treino do Designer começa pelo feed jornalístico: 37 (Seguidores em Alta, estilo Zyrion), depois 36 (Vivendo de Bet, estilo Nuvo). No treino a peça vai direto para a Mesa do dono (sem Revisor).
- Primeiro teste da 37 (antes das correções): foto de cartaz com letras, capa cortada (157 caracteres) e cartão da contracapa cortado. Corrigido: limites capa 100 / contracapa 130 (Revisor de Copy barra e o Designer devolve ao Copy), contracapa usa o texto do Copy, regras de foto (sem letras, chocante).
- Próximo passo: descartar a 37 antiga, mandar de novo pelo Treino e conferir capa e contracapa. Pendente do dono: chaves dos bancos de imagem (PEXELS_API_KEY, UNSPLASH_ACCESS_KEY, PIXABAY_API_KEY) no Komodo.
- Guardado para depois: escritório 3D (docs/pendente/escritorio3d.patch) e Cérebro; botão do Treino vai para dentro do "+ Novo conteúdo" no fim do treino.
