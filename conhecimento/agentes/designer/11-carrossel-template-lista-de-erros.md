<!-- modo: auto -->
# Template de carrossel aprovado: 7 · Lista de erros (editorial P&B)

Aprovado pelo dono em 18/11/2026. É o primeiro carrossel aprovado. Foi feito como réplica do kit editorial P&B (referência R08): primeiro a arte foi copiada igual e depois recebeu os ajustes do dono.

## Quando usar
Copy em lista: "N erros que…", "N sinais de…", "N coisas que…". Cada item tem um título curto e 2 a 3 linhas de explicação.

## Estrutura (template `lista-erros` em `server.js`)
1. **Capa (`erros-capa`):** número pincelado magenta com círculo desenhado à mão; título serifado magenta (DM Serif Display) em 2 linhas; apoio em Barlow Condensed cinza com um trecho _sublinhado_; botão retangular magenta "Arraste para o lado ⟶".
2. **Miolo (`erros-par`, repete):** 2 itens por página em zigue-zague. Cada item tem o rótulo "ERRO N :" em pincel com a mãozinha, o título colorido com ✓✓ e a explicação com trechos sublinhados. A numeração segue a página sozinha. Os fundos 2, 3 e 4 se repetem nessa ordem.
3. **Fim (`erros-fim`):** o último item (opcional) e uma caixa de contorno magenta com o fechamento, o foguete com a frase de apoio e o botão arredondado do CTA.

## Regras do dono
- **Não leva** a pílula com avatar e @, a barra de busca com seta, nem rodapé com telefone, endereço ou redes.
- **"Arraste para o lado" só na capa.** O miolo fica sem botão: as fotos cortadas na divisa já mostram que continua.
- A caixa grande do último slide é o lugar do CTA, com o botão dentro.

## Visual fixo
- Fundo: faixa contínua de 5 páginas (`tpl-erros-fundo-1` a `-5`), com fotos P&B vintage recortadas e raízes.
- Cores: magenta `#f41ae2`, verde-água `#2ed1b4`, texto `#3a3a3a`. Nas páginas 2 e 4 os títulos são magenta com ✓✓ verde; na página 3 e no fim, verde com ✓✓ magenta.
- Fontes: Barlow Condensed 500/700 e DM Serif Display.
- Peças recortadas da arte original em `banco/tpl-erros/`: o "7", os rótulos 1 a 7, a mão, os ✓✓ e o foguete. Para número diferente de 7, o número sai em fonte de pincel com círculo. Acima de "Erro 7", o rótulo sai em texto.

## Texto
- `|` quebra a linha e `_trecho_` sai sublinhado.
- Título do item: até cerca de 30 caracteres. Explicação: até 3 linhas curtas. Texto maior volta para o Copy encurtar.
