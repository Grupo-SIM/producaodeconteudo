# M17. Revisão em passadas e aprendizado com números

Duas rotinas que transformam o agente em algo que **melhora**: a revisão do próprio roteiro antes de entregar, e o aprendizado com o desempenho depois de publicar.

## 1. Revisão do Roteirista em 7 passadas (antes de entregar)

Cada passada olha **uma coisa só**. Fazer tudo de uma vez deixa passar erro.

| Passada | Foco | Pergunta |
|---|---|---|
| 1. **Verdade** | fatos, fontes, datas (M12) | cada afirmação tem fonte e data? o que não tem saiu? |
| 2. **Políticas** | P1 a P7, O1 a O6 (M00) | há atributo pessoal, isca, promessa, material de terceiros? |
| 3. **Gancho e promessa** | M01 | passa no teste de 2 s? o conteúdo entrega a promessa? |
| 4. **História e retenção** | M03, M07 | tem "mas... então"? loops todos fechados? |
| 5. **Voz e português** | M15 | lido em voz alta, sem tropeço? ortografia, acento, números? |
| 6. **Produção** | M04, M16 | cada cena executável? contagem de palavras bate com a duração? zonas seguras? |
| 7. **Marca e objetivo** | ficha, Regra 1 | a voz é da marca? o CTA é único? o objetivo (venda ou retenção) está claro? |

**Regra de parada:** se uma passada encontra um problema grave (V, P ou O), **volta à passada 1** depois de corrigir.

**Contagem:** conte as palavras narradas, divida pela duração e confira com a tabela do M04 (variação de até 10%).

## 2. O Revisor (agente separado)

O Revisor **não escreve**: aponta. Para cada problema, entrega **regra violada → trecho exato → correção exata** (formato no prompt do Revisor). O Roteirista aplica as correções, e as lições vão para o cérebro. A diferença entre as duas revisões: o Roteirista revisa **para entregar**, o Revisor revisa **como terceiro, sem ter visto o processo**.

## 3. Aprendizado com números

Os números só ensinam se forem ligados à **parte da copy** que os causou.

| Métrica | O que mede | Parte da copy responsável | O que testar |
|---|---|---|---|
| **Visualização em 3 s / taxa de parada** | gancho | primeiros 3 s (fala, imagem, texto) | outro tipo de gancho (M01) |
| **Retenção média e curva** | corpo da peça | ritmo, loops, cortes | onde cai a curva: reescrever esse trecho |
| **Conclusão e replay** | fecho e loop | último trecho | loop ou pergunta |
| **Comentários** | tensão aberta e pergunta | pergunta final, tema | outra pergunta, outro ângulo |
| **Compartilhamentos e envios** | utilidade e identidade | "para quem mandaria?" | reforçar o destinatário |
| **Salvamentos** | valor duradouro | carrossel, lista, método | mais exemplo, mais passo |
| **Cliques e conversão** | oferta e CTA | CTA, prova, objeção | CTA, ordem da oferta |
| **Seguidores por peça** | identidade e promessa de perfil | voz e série | consistência |
| **Sinais negativos** (não tenho interesse, ocultar) | promessa quebrada ou tema errado | gancho vs. entrega | ajustar a promessa |

**Heurística das 3 repetições.** Uma peça que vai bem ou mal **não é lição**. Três peças com o **mesmo padrão** e o **mesmo resultado** são uma lição. Antes disso, é **hipótese** (registrada como hipótese).

## 4. Formato de lição (vai para `licoes.md` da marca ou `licoes-globais.md`)

```
## L-AAAAMMDD-NN  |  <marca ou GLOBAL>  |  <plataforma>
Padrão observado: <o que se repetiu nas peças X, Y, Z>
Resultado: <métrica e ordem de grandeza>
Causa provável: <parte da copy>  (grau: hipótese / provável / confirmada por teste)
Regra para o futuro: <instrução curta, aplicável>
Evidência: <ids das peças e período>
Validade: <até quando conferir de novo>
```

Lições **globais** (valem para todas as marcas) só entram depois de aparecer em **pelo menos duas marcas** ou em uma regra da plataforma com fonte. O que é de uma marca fica **na marca**.

## 5. Ciclo de aprendizado

1. **Publicação:** o Social Media registra data, plataforma, formato e id da peça.
2. **Coleta (24 h, 7 dias, 30 dias):** o Gerente cola as métricas em `performance.md` da marca.
3. **Leitura:** o Roteirista compara com a mediana da conta e com a meta.
4. **Hipótese:** liga a métrica à parte da copy (tabela acima).
5. **Teste:** uma peça muda **só** o gancho, ou só o fecho, mantendo o resto.
6. **Lição:** quando o padrão se repete, registra.
7. **Revisão de lições:** a cada 90 dias, lições velhas ou contraditórias são reconferidas (uma lição pode ter caducado com um algoritmo novo).

## 6. Aprovados e reprovados

- `aprovados.md`: peças aprovadas pelo dono, com o **porquê** (a estrutura, o gancho, a emoção). Serve como **exemplo vivo** da voz.
- `reprovados.md`: peças reprovadas, com o **motivo** (o que o dono disse). Serve como **lista de "evitar"**.
- Ambos são lidos **antes** de escrever para a marca e entram no backup e na exportação.

## 7. O que o Roteirista **não** faz com números

Não inventa métrica; não generaliza de uma peça; não atribui sucesso a uma causa única sem teste; não ignora sinal negativo por causa de um pico de visualizações; não repete a mesma estrutura só porque funcionou uma vez (risco de conteúdo repetitivo, M06).

## 8. Checklist de entrega final

1. As 7 passadas foram feitas?
2. Contagem de palavras bate com a duração?
3. Inventário de afirmações com fontes e datas anexo?
4. Contribuição própria escrita?
5. Lista de itens sintéticos e capacidades usadas no rodapé?
6. Pedidos em aberto ao Gerente listados?
7. Checklist de aprovação preenchido, sem "talvez"?
