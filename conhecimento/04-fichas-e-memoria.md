# 04. Fichas e memória por marca (modelos)

Tudo aqui é **dado**, não código. Cada arquivo fica no cérebro, entra no backup e na exportação, e é lido pelo Roteirista na ordem do prompt. Campo sem informação **fica vazio e vira Pedido ao Gerente**; nunca é preenchido de cabeça.

## 1. Ficha da marca (`marcas/<marca>/ficha.md`)

```
# Ficha da marca: <nome>
Atualizada em: AAAA-MM-DD  |  Responsável: Gerente  |  Aprovada pelo dono: sim/não

## Identidade
- O que a marca é (1 frase):
- Para quem (público principal, idade, momento de vida, nível de consciência típico):
- Desejo número 1 do público (na palavra dele):
- Dores principais (como a situação, não como o atributo):
- Inimigo de ideia (a crença ou prática que a marca combate):
- Arquétipo principal / secundário:
- Promessa de marca (sem promessa de resultado):
- Personagem ou mascote (nome, voz, o que nunca faz):

## Voz (6 linhas, M02 §7)
- Quem fala:
- Registro:
- Ritmo:
- Emoção dominante:
- 5 expressões do público:
- Palavras proibidas:

## Plataformas
| Rede | Conta | Objetivo (retenção/venda) | Formatos | Frequência | Programa de monetização e requisitos | Observações |

## Produção
- Estilo de vídeo padrão (VSL / Motion):
- Voz (ElevenLabs) e tom:
- Paleta, tipografia, logo, regras de uso:
- Skill ou manual de design da marca:

## Limites
- Temas proibidos:
- Concorrentes que não se citam:
- Termos jurídicos obrigatórios (avisos, +18, etc.):
- Material de terceiros autorizado (com prova de autorização):

## Fatos reais usáveis
- Quem está por trás (apenas o que o dono autorizou):
- Números reais (com fonte e data):
- Casos e depoimentos autorizados (texto exato, nome ou iniciais):
- Produtos cadastrados (ids):

## Pedidos respondidos (informações gravadas)
(Ver informacoes-gravadas.md)
```

## 2. Ficha do produto (`produtos/<id>/ficha.md`)

```
# Produto <id>: <nome>
Marca: <marca>  |  Status: ativo / pausado  |  Cadastrado em: AAAA-MM-DD

- O que é (1 frase) e o formato (e-book, curso, software, serviço...):
- Para quem é e para quem NÃO é:
- Resultado sonhado do público (em palavra de desejo, não de promessa):
- Mecanismo (por que funciona):
- O que contém (lista exata):
- Preço e condições de pagamento (com data de validade):
- Bônus reais:
- Prova real (números, casos autorizados, com fonte e data):
- Garantia e reembolso (o que a lei garante + o que a marca oferece além):
- Urgência ou escassez REAL (regra, datas):
- Canal de compra (link) e canal de suporte:
- Objeções mais frequentes (ditas pelo público):
- Restrições legais ou de plataforma:
- CTA padrão (texto exato):
```

**Regra:** sem esta ficha preenchida nos campos de preço, o que contém, canal de compra e CTA, o Roteirista não escreve peça de venda.

## 3. Lições da marca (`marcas/<marca>/licoes.md`)

Formato do M17 (seção 4). Exemplo:

```
## L-20261022-01 | Central do Marketing | Instagram
Padrão observado: carrosséis com capa em formato "erro comum" tiveram mais salvamentos que capas em formato lista (peças A, B, C).
Resultado: salvamentos ~2x a mediana da conta.
Causa provável: a capa promete evitar uma perda  (grau: provável)
Regra para o futuro: priorizar capa "erro comum" em carrossel educativo; manter 1 em 4 como lista para teste.
Evidência: A, B, C (09/2026)
Validade: reconferir em 90 dias
```

## 4. Aprovados, reprovados, performance

- `aprovados.md`: id da peça, data, plataforma, formato, texto final e **por que o dono aprovou**.
- `reprovados.md`: id da peça, data, motivo **nas palavras do dono**, o que evitar.
- `performance.md`: tabela por peça: id, data, rede, formato, gancho usado, visualizações em 3 s, retenção média, conclusão, comentários, envios, salvamentos, cliques, observação. Preenchida pelo Gerente (ou pelo Social Media) em 24 h, 7 e 30 dias.

## 5. Informações gravadas (`marcas/<marca>/informacoes-gravadas.md`)

Cada resposta a um Pedido ao Gerente fica **registrada para sempre**, para a pergunta não ser repetida:

```
## PED-AAAAMMDD-NN  |  respondido em AAAA-MM-DD por <dono/Gerente>
Pergunta: <o que faltava>
Resposta: <o texto exato>
Vale para: <marca inteira / produto id / plataforma>
Validade: <permanente / até AAAA-MM-DD>
```

Quando a resposta vale para a marca inteira, o Gerente também a **move para a ficha** e marca a linha como "incorporada".

## 6. Pedido ao Gerente (formato)

```
PEDIDO AO GERENTE
id: PED-AAAAMMDD-NN
marca: <marca>   produto: <id ou "-">
bloqueio: <o que não consigo fazer sem isso>
falta: <a informação exata>
por que preciso: <como entra na peça>
se não vier: <o que faço, ou não faço>
gravar em: marcas/<marca>/informacoes-gravadas.md (e ficha, se valer para a marca)
```

O pedido sobe pela **escada** do arquivo 00 (cérebro → Pesquisador → dono). Pedido respondido nunca é refeito: o Roteirista consulta `informacoes-gravadas.md` **antes** de abrir um novo.

## 7. Capacidades da produção (`producao/capacidades-atuais.md`)

Modelo no M16 (seção 1). **Regra de atualização:** o Gerente atualiza sempre que o Editor ou o Designer ganha ou perde um recurso, e **registra a data**. O Roteirista não pressupõe capacidade que não esteja ali; pede.

## 8. Lições globais (`roteirista/licoes-globais.md`)

Mesmo formato, mas com **"GLOBAL"** no lugar da marca. Só entra lição observada em **duas marcas ou mais**, ou regra de plataforma com fonte e data.

## 9. Backup e exportação

Entram **todos** os arquivos desta lista por marca (`ficha`, `licoes`, `aprovados`, `reprovados`, `performance`, `informacoes-gravadas`), as fichas de produto, `licoes-globais.md`, `capacidades-atuais.md`, `pautas/` e `pedidos-ao-gerente/`. Exportar uma marca deve levar **tudo que a faz ser ela**: ficha, memória e histórico, para que ela possa ser reimportada em outro ambiente sem perda.

## 10. Estrutura de pastas (resumo)

```
cerebro/
  roteirista/
    prompt.md
    manuais/ M00 ... M17
    licoes-globais.md
  producao/capacidades-atuais.md
  marcas/<marca>/{ficha, licoes, aprovados, reprovados, performance, informacoes-gravadas}.md
  produtos/<id>/ficha.md
  pautas/AAAA-MM-DD/<pauta>.md
  pedidos-ao-gerente/PED-AAAAMMDD-NN.md
```
