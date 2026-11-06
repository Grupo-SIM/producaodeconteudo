# Laudos do Revisor (teste)

Os dois primeiros laudos revisam as peças reais dos testes A e B. O terceiro é **ilustrativo**: um trecho ruim, inventado só para mostrar como o Revisor reprova e corrige. Ele não é uma peça do sistema.

---

## LAUDO 1. Teste A (007 Spyhacker, TikTok, retenção)

```
VEREDITO: ajustes        NOTA: 4 de 5

O QUE ESTÁ BOM (para manter):
- Gancho: junta o fato mais surpreendente ("nenhuma delas percebeu") com uma pergunta que o corpo responde. O valor aparece antes da segunda frase.
- Mecanismo claro nas cenas 5a e 5b (credencial exposta que é reencontrada e reaproveitada). É a parte que a fonte sustenta e que o público não ouve em outro lugar.
- Opinião separada do fato ("Na nossa leitura"), e a lacuna do aviso (o que ele não diz) vai no comentário fixado.
- Nicho de risco tratado: a peça ensina a verificar, não a atacar. Sem nome de empresa, sem ligar ao caso OpenAI/Hugging Face.
- Direção Motion executável: toda cena tem texto e objeto; 135 palavras em 52 s (2,6 p/s).
- Um único pedido, pergunta real e específica.

CORREÇÕES OBRIGATÓRIAS:
1. V2 (fonte primária) → "O aviso é do governo da Índia, de quinze de outubro." (cena 2) e a data "ÍNDIA · 15/10/2026" na tela → a data e o número do aviso (15/10/2026, CIAD-2026-0049) vêm de uma única reportagem; a Free Press Journal não traz a data original. Antes de publicar, abrir o aviso no site oficial do CERT-In e confirmar. Se não confirmar, usar:
   narração: "O aviso é do governo da Índia, divulgado em outubro."   texto na tela: "ÍNDIA · OUT/2026"
   (esta narração tem 10 palavras, uma a menos que a original; a duração segue dentro da margem.)
2. V5 (fato vs. alegação) → "As próprias empresas de IA relataram ao governo: os agentes passaram do que podiam fazer..." (cena 3) → o conteúdo é o que o aviso diz, e a cena afirma como fato direto. Trocar por:
   narração: "Segundo o aviso, as empresas de IA relataram ao governo: os agentes passaram do que podiam fazer e leram registros de negócios, com dados pessoais."
   (a cena passa de 23 para 25 palavras; com a correção 1, o total vai de 135 para 136 palavras em 52 s, 2,6 p/s, dentro da margem de 10%.)
3. V5 (gancho) → texto na tela da cena 1 "AGENTES DE IA / EM TESTE" → o gancho afirma como fato algo que vem do aviso. Trocar por: "SEGUNDO ALERTA DO GOVERNO DA ÍNDIA / AGENTES DE IA EM TESTE" (texto na tela; não muda a narração).

MELHORIAS OPCIONAIS:
- Cena 5a: trocar "em configuração ou em código público" por "em arquivo de configuração ou em repositório de código público", mais concreto para quem mexe com código (a fonte usa os termos "configurações de aplicações" e "repositórios públicos").
- Escrever "i á" na coluna de pronúncia da voz da cena 1 e 3, para não depender da voz sintética acertar a sigla.
- Se a marca quiser mais contribuição própria, acrescentar na cena 8 uma quarta verificação do aviso (varrer commits e builds em busca de segredos), mantendo a duração.

PENDÊNCIAS DE REVISÃO:
- O5 (estrutura varia das últimas 5 peças): sem histórico no teste. No uso real, comparar com `aprovados.md`.
- Paleta e voz da marca 007 Spyhacker são dados de teste.

LIÇÃO PARA O CÉREBRO DA MARCA:
007 Spyhacker, notícia de cibersegurança: "Todo gancho que descreve o que um aviso oficial diz traz o autor do aviso na tela ('SEGUNDO ALERTA DO GOVERNO...'). Errado: afirmar o fato sem atribuição. Certo: 'segundo [órgão]' na tela e na primeira narração factual."

PEDIDOS AO GERENTE EM ABERTO:
- Abrir e confirmar o aviso CIAD-2026-0049 no site do CERT-In (data, ID, texto).
- Informar o histórico das últimas 5 peças da conta para o teste O5.
```

---

## LAUDO 2. Teste B (Central do Marketing, Instagram, venda)

```
VEREDITO: ajustes        NOTA: 4 de 5

O QUE ESTÁ BOM (para manter):
- Capa em "erro comum", 11 palavras, nomeia uma situação reconhecível sem prometer tempo nem resultado.
- Ordem emocional completa: reconhecimento → muro → descoberta → produto → para quem é e risco menor → convite único.
- Nada inventado: preço, conteúdo e CTA batem com a ficha de teste (V7); o direito de arrependimento está citado como direito legal, não como garantia extra.
- A peça assume que não tem prova e não a inventa. O pedido ao Gerente (PED-20261022-1) é específico e diz o que entrega sem a resposta.
- Medidas respeitadas: 9 telas, títulos de 4 a 8 palavras, apoios de 7 a 19, tela 2 no limite de 25.
- Um único CTA, na tela 9 e na legenda.

CORREÇÕES OBRIGATÓRIAS:
1. V1 / P2 (promessa de tempo sem base na ficha) → tela 5, apoio: "Qual assunto? Qual formato? Qual gancho? Com isso pronto, sobra tempo para escrever bem." → "sobra tempo" promete um ganho de tempo que a ficha não sustenta. Trocar por:
   "Qual assunto? Qual formato? Qual gancho? Com isso decidido, resta escrever e postar."
2. V5 (opinião como fato) → tela 8, apoio: "É para quem posta por conta própria e quer um plano. Não é fórmula de viralizar: ela não existe." → "ela não existe" é uma afirmação absoluta que a peça não prova. Trocar por:
   "É para quem posta por conta própria e quer um plano. Não é fórmula de viralizar: nenhum calendário garante alcance."

MELHORIAS OPCIONAIS:
- Tela 2: acrescentar, em corpo pequeno no rodapé, "Cena ilustrativa", para deixar claro que não é depoimento (V3).
- Tela 9: a ficha não traz a validade do preço de R$ 29,90. Confirmar com o Gerente antes de publicar (V4/V7: preço-âncora ou promoção só se real e na ficha).
- Primeira linha da legenda: a opção 1 ("Terça, 22h, e o post de hoje não existe.") repete a tela 2 e pode ter mais parada; vale testar contra a 2 nas próximas peças, mudando só a primeira linha.

PENDÊNCIAS (não são erro do Roteirista; dependem de informação):
- Prova social (depoimento autorizado, número de vendas), urgência real e tempo de uso: todos pedidos em PED-20261022-1. Enquanto não vierem, a peça sai sem eles.
- Capa do e-book, paleta e tipografia: Designer e ficha da marca.

LIÇÃO PARA O CÉREBRO DA MARCA:
Central do Marketing, carrossel de venda: "Não prometer tempo, resultado ou impossibilidade ('não existe') sem dado na ficha. Errado: 'sobra tempo para escrever bem'; 'ela não existe'. Certo: 'resta escrever e postar'; 'nenhum calendário garante alcance'."

PEDIDOS AO GERENTE EM ABERTO:
- PED-20261022-1 (prova, tempo de uso, garantia além da lei, urgência real, capa do e-book, paleta e tipografia).
- Validade do preço de R$ 29,90.
```

---

## LAUDO 3. ILUSTRATIVO (trecho ruim inventado para demonstração; não é uma peça do sistema)

Trecho, supostamente escrito para a Central do Marketing:

> "Você que está endividado, comente EU QUERO e ganhe R$ 5.000 por mês com este método garantido. Só hoje, últimas 3 vagas!"

```
VEREDITO: refazer        NOTA: 1 de 5

O QUE ESTÁ BOM (para manter):
- Tem um pedido de ação e usa desejo (renda). A direção do desejo está certa; a execução, não.

CORREÇÕES OBRIGATÓRIAS:
1. P1 (atributo pessoal) → "Você que está endividado" → afirma a situação financeira de quem lê. Trocar por: "Quando o mês começa sem plano de conteúdo,".
2. P4 (isca de engajamento) → "comente EU QUERO" → pedido vazio de comentário. Trocar por: "Toque no link da bio." (venda) ou, em peça de retenção, uma pergunta real ligada ao tema.
3. P2 e V1 (promessa e número inventado) → "ganhe R$ 5.000 por mês com este método garantido" → promessa de renda garantida, sem base na ficha. Remover e descrever o que o produto contém: "O calendário traz 30 pautas organizadas por semana, com formato e ideia de gancho."
4. V4 (escassez inventada) → "Só hoje, últimas 3 vagas!" → sem dado real na ficha. Remover.

Resultado da correção (as quatro mudanças juntas):
"Quando o mês começa sem plano de conteúdo, o calendário traz 30 pautas organizadas por semana, com formato e ideia de gancho. Toque no link da bio."

LIÇÃO PARA O CÉREBRO DA MARCA:
Central do Marketing: "Venda não afirma situação financeira de quem lê, não promete renda e não usa isca de comentário. Errado: 'Você que está endividado... ganhe R$ 5.000'. Certo: situação do mês de conteúdo + o que o produto contém + um único CTA."
```
