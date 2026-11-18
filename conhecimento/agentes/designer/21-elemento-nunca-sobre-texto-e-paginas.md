# Elemento nunca em cima do texto + menos páginas, texto maior (decisão do dono, 18/11/2026)

## 1. Elemento nunca fica em cima do texto
- Peça decorativa (rei do xadrez, objeto 3D, mascote, ícone solto) NUNCA cobre o texto nem compete com o título, principalmente na capa.
- Se bater no texto, a peça sobe ou desce até sair da área do texto, das etiquetas e dos botões. Não se diminui o texto para caber a peça.
- No código: o item leva `desvia: true` e a página passa por `desviaDoTexto` (`public/arte-modelos.js`). A parte visível do PNG vai em `VIS`. Todo template novo marca as peças soltas com `desvia`.

## 2. Menos páginas, texto maior
- O copy pode mandar uma ideia por slide. Em template só de texto (miolo sem foto), o Designer junta slides curtos seguidos numa página só: a virada vira o título (com a palavra em *destaque*) e o resto vira o texto de apoio.
- Meta: carrossel de história real ou venda com 6 a 7 páginas, não 9 a 10. Nunca corta frase da copy aprovada; só agrupa.
- Sobrou espaço em cima e embaixo? O texto cresce para ler fácil. No Xadrez o miolo usa texto 30% maior que o do Fogo (`__z: 1.3`).

## 3. Os educativos cobrem história real e venda
Teste no 10 · Xadrez (Toy Story 2 e Controle Patrimonial): funciona usando página de frase forte (história) e página de lista para os recursos do produto (venda).
