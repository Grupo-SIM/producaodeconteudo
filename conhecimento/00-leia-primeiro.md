# Leia primeiro: diagnóstico, conflitos e estrutura

## O que é este pacote

Tudo o que o Roteirista precisa para virar o especialista de copy e roteiro do Agentes SIM: o prompt final, 18 manuais de conhecimento (um por tema), as fichas e a memória por marca, o fluxo de pedido ao Gerente, o Pesquisador de Pautas, o Revisor e quatro peças de teste. Cada bloco tem botão de copiar, para colar direto no painel (campos "Prompt / treinamento", "Aprendizados" e "Evitar") ou na base de conhecimento.

Os manuais foram escritos com conhecimento real e as regras de plataforma foram checadas em outubro de 2026. Onde o número veio de fonte de terceiros e não da página oficial, o manual diz isso.

## 1. Como o agente está hoje, e o que falta

**Limite importante: eu não tenho acesso ao seu painel, ao código nem ao prompt atual do Roteirista nesta conversa.** O quadro abaixo vem do que você me contou nas conversas anteriores sobre o Agentes SIM. Se você colar aqui o prompt atual e a lista de manuais cadastrados, eu faço o comparativo linha a linha.

**O que sei do estado atual (por você):**

- O Roteirista existe como agente, com painel de três campos: Aprendizados (sempre fazer), Evitar (nunca fazer) e Prompt / treinamento.
- Ele é treinado com uma base de histórias, notícias, eventos e cartas de vendas, e você quer modelar VSLs e séries que já validaram.
- As fichas de marca estão sendo montadas à mão, uma por vez (Central do Marketing foi a primeira), com segmento, tom, identidade visual e copy.
- Você trabalha em modo chat, sem API: o painel monta o pedido, você cola a resposta de volta. A API entra depois que o fluxo estiver 100%.
- O antigo Gerente virou Revisor. O novo Gerente é o cérebro do sistema, um chat onde você testa, ensina e dá ordens.
- Aprovar ou reprovar com motivo deve ensinar o Cérebro.

**Lacunas em relação ao seu documento (o que provavelmente falta):**

| Item do documento | Situação que presumo | O que falta | Onde está neste pacote |
|---|---|---|---|
| 1. Papel e limites | Roteirista genérico | Prompt com papel fechado (só escreve, escreve pronto para produção) | Prompt do Roteirista |
| 2. Duas regras absolutas | Não sei | Regra 1 (venda × retenção) e Regra 2 (qualidade) como lei, com critérios verificáveis | Prompt, M00, M07, M08 |
| 3. Formatos | Carrossel e vídeo | Anatomia de cada formato, contagem de palavras por duração, stories, YouTube longo, X/Threads | M04 |
| 4. Conhecimento | Base de histórias e VSLs | Manuais por tema: algoritmos, monetização, psicologia, cultura pop, nichos | M01 a M17 |
| 5. Herdar os 27 manuais | Não migrados | Adaptação ao conteúdo de rede social | Mapa do PDF |
| 6. Factualidade | Regra solta | Protocolo de fonte, ficha de fonte, 2 fontes, fato × alegação | M12 |
| 7. Marcas e produtos | Fichas à mão | Ficha padrão, ficha de produto, pedido ao Gerente que grava a resposta | Fichas e memória |
| 8. Memória e aprendizado | Cérebro central | Lições por marca, formato de lição, ordem de consulta | Fichas e memória |
| 9. Capacidades da produção | Não sei se existe | Documento "capacidades atuais", mantido pelos agentes de edição e design | Fichas e memória, M16 |
| 10. Pesquisador de Pautas | Não existe | Agente novo, prompt e formato de briefing | Pesquisador |
| 11. Formato de entrega | Livre | Entrega em 7 blocos fixos | Prompt |
| 12. Revisor | Existe | Checklist numerado com regra → trecho → correção | Revisor, M00 |

## 2. Conflitos com a sua arquitetura, e como resolvi

Você pediu para eu avisar antes de adaptar. Como não tenho como te perguntar no meio do trabalho, segui o caminho mais seguro em cada ponto e deixei cada decisão isolada para você poder vetar.

**C1. O Pesquisador "varre diariamente", mas você opera em modo chat sem API.** Varredura diária exige busca na web e agendamento. Em modo chat ele roda quando você (ou o Gerente) abre um chat com busca ligada e pede "pautas de hoje". O prompt funciona nos dois modos. A rotina diária automática só existe quando a API ou uma tarefa agendada entrar.

**C2. "O Gerente obtém a informação e ela é gravada."** O Gerente é um chat e não tem como descobrir sozinho o preço de um produto seu. Defini uma escada de três degraus: (1) procurar no cérebro, (2) pedir ao Pesquisador o que for público, (3) perguntar a você. A resposta sempre é gravada na ficha, no campo exato.

**C3. A Regra 1b manda provocar comentário e compartilhamento, mas as plataformas punem isca de engajamento.** A Meta lista "comente SIM", "curta se", "marque 3 amigos" como problema de qualidade (está no seu PDF, manual de Meta Ads), e o YouTube e o TikTok tratam engajamento artificial do mesmo jeito. Resolvi assim: o comentário e o compartilhamento são provocados pelo conteúdo (um dilema, uma opinião defensável, uma situação em que a pessoa se reconhece, uma utilidade para alguém específico). O pedido final é uma pergunta de verdade, nunca uma ordem de engajamento.

**C4. Seu pipeline autônomo tem o perfil exato do que o YouTube e a Meta mais punem.** O YouTube (política de conteúdo inautêntico, desde julho de 2025) lista como não monetizável: conteúdo feito com template, slideshows, leitura de notícia de terceiros, narração por IA sobre imagem de banco. A Meta (março de 2026) despriorizou e pode desmonetizar quem publica principalmente conteúdo não original. Um sistema que produz em escala com templates e voz sintética está exposto. Por isso toda peça precisa de uma "contribuição própria declarada" (o que a marca acrescenta que o leitor não teria só lendo a fonte) e de variação real de estrutura entre peças (M06). Isso é uma exigência nova do prompt, e é a decisão que mais protege suas contas.

**C5. "Venda agressiva."** Resolvi como: agressivo em clareza, em tensão, em especificidade, em quebra de objeção e em chamada direta. Nunca em promessa falsa, escassez inventada ou prova inventada, que derrubam conta e geram reembolso. Isso não reduz a força da copy; os manuais ensinam como atacar forte dentro da regra.

**C6. Cultura pop.** O agente pode citar por nome e por alusão. Não pode reproduzir fala, letra, trecho, imagem, personagem ou música. Toda peça com referência traz o aviso "sem uso de imagem ou áudio do original" para o Designer e o Editor (M13). Isso vale também para a marca 007 Spyhacker: o arquétipo de espião é livre, mas o logo, o tema musical e as frases-assinatura de James Bond não são.

**C7. Seu documento de "capacidades atuais da produção" provavelmente ainda não existe como arquivo.** Entreguei o modelo e a regra de quem atualiza. Nas peças de teste eu assumi capacidades razoáveis (motion com tipografia, objetos gerados por fal.ai, vetores, voz ElevenLabs, os dois estilos de vídeo que você definiu: VSL e Motion) e marquei isso.

**C8. Brasil e regras específicas das suas marcas.** Vivendo de Bet (apostas) e Corte dos Ricos (cortes de podcast) têm regras próprias que o seu documento não citava: publicidade de apostas é regulada, e cortes de terceiros caem direto na regra de conteúdo não original. Estão no M14 como "nichos de risco".

## 3. Estrutura proposta

```
cerebro/
  roteirista/
    prompt.md                    prompt final (campo "Prompt / treinamento")
    manuais/M00 ... M17.md       um manual por tema
    licoes-globais.md            lições que valem para todas as marcas
  marcas/<marca>/
    ficha.md                     o que a marca faz, público, tom, pode / não pode
    licoes.md                    correções e padrões aprovados da marca
    aprovados.md  reprovados.md  exemplos com o motivo
    performance.md               o que performou, com número
    informacoes-gravadas.md      tudo que o Gerente respondeu
  produtos/<id>/ficha.md         preço, o que inclui, prova real, link, proibições
  producao/capacidades-atuais.md o que o Editor e o Designer conseguem hoje
  pautas/AAAA-MM-DD/<pauta>.md   briefing do Pesquisador, com fontes
  pedidos-ao-gerente/<id>.md     o que falta, por que, resposta gravada
```

**Carregamento por pedido (economia de espaço).** Não cole os 18 manuais em todo pedido. O painel junta apenas o que o pedido usa:

| Pedido | Manuais carregados além do prompt |
|---|---|
| Sempre | M00, M15, M16 e o M04 do formato pedido |
| Vídeo vertical curto | M01, M03, M05 (da plataforma), M06 |
| Carrossel ou estático | M01, M03, M05 (da plataforma) |
| Notícia | M12, M14 (do nicho), M13 |
| Retenção e monetização | M07, M11 |
| Venda | M02, M08, M09, M10 |
| YouTube longo | M03, M05, M07 |
| Pesquisa de produto ou marca | M02, M14 |
| Peça que voltou do Revisor | M17 |

Um pedido típico carrega entre 6 e 10 mil palavras de manual. Cabe em chat comum.

## 4. Fluxo de uma peça

1. O **Pesquisador de Pautas** entrega o briefing (retenção) ou você escolhe um produto cadastrado (venda).
2. O pedido chega ao Roteirista com marca, plataforma, formato e objetivo.
3. Ele lê a ficha da marca, as lições, a ficha do produto (se venda), o briefing (se notícia) e as capacidades atuais.
4. Se faltar informação essencial, **abre um pedido ao Gerente** e para. O Gerente responde pela escada (cérebro, Pesquisador, você) e grava na ficha.
5. Escreve: grande ideia, 3 a 5 ganchos com justificativa, roteiro completo, legenda, fontes e checklist.
6. O **Revisor** reprova ou aprova, citando regra, trecho e correção exata.
7. Reprovada, a peça volta; a correção vira lição no cérebro da marca.
8. Aprovada, segue para o Designer e o Editor, depois para a sua aprovação final e a postagem.
9. Com os números da peça publicada, o Gerente grava a lição de performance.
