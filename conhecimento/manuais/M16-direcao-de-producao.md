# M16. Direção de produção (o que o Roteirista entrega ao Editor e ao Designer)

O Roteirista **só escreve**: não edita vídeo, não faz arte. Mas escreve de modo que o Editor e o Designer executem **sem adivinhar**. Roteiro que depende de recurso que a produção não tem é roteiro ruim.

## 1. O documento "capacidades atuais da produção"

Arquivo: `cerebro/producao/capacidades-atuais.md`. É mantido pelo Gerente e **lido pelo Roteirista antes de dirigir qualquer peça**. Se estiver desatualizado, o Roteirista **escreve com o que está nele** e abre pedido de capacidade.

**Conteúdo esperado (modelo):**

```
# Capacidades atuais da produção
Atualizado em: AAAA-MM-DD  |  Responsável: Gerente

## Vídeo
- Estilos disponíveis: VSL, Motion (só esses dois)
- Resoluções: 1080x1920 (vertical), 1920x1080 (horizontal)
- Duração máxima por peça: __ s
- Voz: ElevenLabs (vozes disponíveis por marca: ...)
- Imagens: fal.ai (estilos que funcionam bem: ...; o que não funciona: ...)
- B-roll gerado: sim/não (limites: ...)
- Legenda queimada: sim; fonte e posição padrão: ...
- Efeitos sonoros: biblioteca ...; trilha: biblioteca livre ...
- Transições e efeitos disponíveis: ...
- Vídeo só de texto: NÃO (sempre com imagem, elemento, vetor ou 3D)

## Arte
- Formatos: carrossel 1080x1350, estático 1080x1350, stories 1080x1920, capa de YouTube 1280x720
- Mascotes e personagens por marca: ...
- Fontes e paleta por marca: (ver ficha da marca)
- O que o Designer ainda não consegue: ...

## Limites conhecidos
- ...

## Pedidos de capacidade em aberto
- ...
```

**Regra:** se a capacidade **não aparece** no documento, o Roteirista não a pressupõe. Ele escreve o roteiro com a **melhor alternativa dentro do documento** e abre pedido: "preciso de [X] para [peça]; sem isso, uso [alternativa]".

## 2. Os dois estilos de vídeo

| | **VSL** | **Motion** |
|---|---|---|
| O que é | vídeo direto, imagem e cena como suporte da fala; ritmo de edição de feed | animação gráfica (tipografia cinética, elementos, 3D simples), mais "desenhado" |
| Bom para | notícia, explicação, história com cenas | conceito, lista, dado, mecanismo, pergunta |
| Texto na tela | palavra-chave, número, lugar | texto como elemento central, **com** objeto ou ícone |
| Cuidado | banco de imagens genérico; precisa de imagem **com função** | excesso de texto parado; precisa de movimento e hierarquia |

O Roteirista **escolhe um estilo por peça** (e justifica em uma linha) ou segue o que a ficha da marca define. Não inventa um terceiro.

## 3. Vídeo nunca só de texto

Cada cena tem **texto + imagem ou elemento visual**: objeto 3D, ícone, vetor, gráfico, cena gerada, personagem, mapa. Texto sozinho em fundo liso **não é uma cena**.

## 4. Como descrever cada cena (o que o Editor precisa)

Na tabela do M04, a coluna **Visual** responde:
- **O que aparece** (objeto, cenário, personagem, gráfico) e **onde** (centro, terço superior).
- **O que se move** (entra, sai, cresce, treme) e **quando** (na palavra X).
- **Estilo da imagem** (realista, vetor, 3D, noir, neon), coerente com a marca.
- **Cor e luz** (só se importar para a emoção).
- **Enquadramento** (plano aberto, close, zoom lento).
- **Efeito sonoro e ritmo** (corte seco, impacto, silêncio de meio segundo, trilha sobe).
- **Palavra-gatilho:** o ponto exato da narração que sincroniza a imagem.

**Exemplo de linha boa:** "Palavra 'senha': close em post-it amarelo colado num monitor, zoom lento; texto na tela: SENHA (vermelho); efeito: batida seca na palavra." **Linha ruim:** "mostrar algo de segurança."

## 5. Zonas seguras e legibilidade

- **Vídeo 1080×1920:** nada importante nos 15% de cima, nos 20% de baixo e na borda direita (botões e legenda do app). Legenda queimada na faixa central-inferior, em no máximo 2 linhas.
- **Carrossel e estático 1080×1350:** margem de 60 px; título acima de 38 px; contraste alto; no máximo 3 níveis de hierarquia.
- **Horizontal 1920×1080:** miniatura e abertura legíveis em tela de celular.
- **Acessibilidade:** contraste de texto suficiente; não depender só de cor para informar; legenda para quem assiste sem som.

## 6. Voz e trilha

- **Voz:** a configurada para a marca (ElevenLabs). O roteiro indica **tom** por trecho (calma, tensa, firme) e as palavras com **ênfase** e **pausa**.
- **Trilha:** descrita por **clima e ritmo** (pulsante, tensa, leve, épica); **nunca** nome de música com direitos (M06).
- **Efeito sonoro:** do documento de capacidades; o roteiro marca onde entra (impacto, whoosh, clique, silêncio).

## 7. Arte para carrossel e estático

O Roteirista entrega, por slide: **título, apoio, elemento visual sugerido, hierarquia e o que puxa o próximo**. Cor, fonte e logo seguem a ficha da marca e a skill do designer da marca. **O Roteirista não escolhe paleta nem tipografia fora da ficha.**

## 8. Pedido de capacidade ao Gerente (formato)

```
PEDIDO DE CAPACIDADE
id: CAP-AAAAMMDD-NN
peça: <marca / formato / tema>
preciso de: <o quê>
para quê: <o ganho na peça>
alternativa se não houver: <o que faço dentro do documento>
gravar em: cerebro/producao/capacidades-atuais.md (seção "Pedidos em aberto")
```

## 9. Checklist de direção

1. Estilo de vídeo escolhido e justificado?
2. Toda cena tem texto **e** visual?
3. Cada linha de visual diz o que aparece, onde, quando e como se move?
4. Zonas seguras respeitadas?
5. Voz, tom e ênfases indicados?
6. Trilha descrita por clima, sem nome de música?
7. Nada fora de "capacidades atuais" sem pedido aberto?
8. Itens sintéticos listados no rodapé?
