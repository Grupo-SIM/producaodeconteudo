<!-- modo: sempre -->
# SEO de notícias e busca por IA: o manual do especialista

Base consolidada a partir da documentação pública do Google Search Central (Notícias, Discover, sistemas de ranqueamento, políticas de spam, dados estruturados) e das práticas de otimização para buscadores de IA. Regras de plataforma mudam: quando o dono trouxer documentação mais nova, ela vale mais que esta.

## 1. Como o Google trata notícia
- **Atualidade:** para assunto quente, o Google privilegia conteúdo recente (os "sistemas de atualidade"). Publicar rápido e com data clara conta muito. Data visível no topo e em `datePublished`/`dateModified`.
- **Originalidade:** os sistemas de ranqueamento dão destaque à reportagem original e a quem traz informação nova. Quem só reescreve outra matéria tende a ficar atrás de quem deu a notícia primeiro.
- **Conteúdo útil e feito para pessoas:** o Google avalia se a página existe para informar gente ou para pegar busca. Sinais de texto feito para robô (enchimento, palavra-chave repetida, resumo de outros sem acrescentar nada) rebaixam o site inteiro, não só a página.
- **E-E-A-T (experiência, especialidade, autoridade, confiança):** não é um "ponto" de ranqueamento, é o que os avaliadores e sistemas tentam medir. Na prática: autor identificado, página "sobre" e "política editorial" no site, fontes citadas, correções transparentes, foco de assunto (o jornal de tecnologia escreve sobre tecnologia).
- **Políticas de spam a evitar:** abuso de conteúdo em escala (muitas páginas geradas com pouco valor, inclusive com IA), abuso de reputação do site (publicar assunto fora do foco para aproveitar a autoridade), páginas portal, texto oculto, excesso de palavra-chave. Conteúdo feito com IA é aceito, desde que útil, original e revisado.

## 2. Google Notícias, Principais Matérias e Discover
- Não existe inscrição obrigatória: o Google descobre o site pelo rastreamento. Ajuda ter: sitemap de notícias (`news sitemap`) com as matérias dos últimos 2 dias, URL estável e única por matéria, data clara, autor, página de contato e transparência editorial.
- **Discover** vive de imagem e interesse: imagem grande e de boa qualidade (pelo menos 1200 px de largura, com a configuração `max-image-preview:large`), título que descreve o fato sem caça-clique. Título enganoso ou sensacionalista é proibido nas políticas do Discover.
- **Principais Matérias (Top Stories):** favorecem página rápida, boa experiência no celular, dados estruturados de artigo e atualidade. AMP não é mais requisito.

## 3. Palavra-chave e intenção
- Notícia tem dois tipos de busca: o **nome do acontecimento** ("Instagram séries", "Pix Europa") e a **pergunta** que vem depois ("como funciona…", "quando começa…", "o que muda…").
- Escolha 1 principal (o que a maioria digitaria) e 3 a 6 relacionadas (sinônimos, nome completo, perguntas). Use o vocabulário do público brasileiro (ex.: "celular", não "smartphone", se o público fala assim).
- Posição natural: título SEO, H1, primeira frase do lide, um H2, slug, alt da imagem. Depois disso, escreva normal; repetir mais não ajuda e piora a leitura.
- Densidade de palavra-chave não é métrica: não conte porcentagem.

## 4. Anatomia on-page
- **Título SEO (`<title>`)**: até ~60 caracteres para não cortar; palavra-chave no começo; conta o fato. Pode ser diferente do H1.
- **Meta descrição:** ~140 a 155 caracteres; o Google pode reescrever, mas uma boa meta aumenta o clique.
- **H1:** a manchete. Um só por página.
- **Lide:** pirâmide invertida, o essencial primeiro. É o trecho mais usado em resumos de IA e trechos em destaque.
- **H2/H3:** organizam por pergunta ou tema; deixam o leitor (e o robô) pular para o que quer.
- **Slug:** curto, descritivo, com hífen, sem data, sem acento, sem stopwords desnecessárias. Nunca mude o slug depois de publicado (se mudar, redirecionamento 301).
- **Imagens:** foto relevante com direito de uso; `alt` descreve a imagem com o assunto; nome de arquivo descritivo; formato leve (WebP/AVIF).
- **Links internos:** 1 a 3 para matérias relacionadas do mesmo jornal, com texto âncora descritivo (não "clique aqui"). Crie páginas de tema/tag que reúnam a cobertura de um assunto.
- **Links externos:** para a fonte original e documentos oficiais. Isso é sinal de confiança, não "vazamento".
- **Canonical:** cada matéria aponta para si mesma. Se a mesma notícia sair em vários jornais do grupo, cada um precisa de texto próprio; texto igual em dois sites = um dos dois some (e pode parecer spam).

## 5. Dados estruturados (JSON-LD)
Toda matéria leva `NewsArticle` com: `headline` (até 110 caracteres), `image` (lista com URLs de alta resolução, proporções 16x9, 4x3 e 1x1 quando possível), `datePublished` e `dateModified` em ISO 8601 com fuso (-03:00), `author` (Person com `name` e `url` da página do autor), `publisher` (Organization com `name` e `logo`). Opcional: `BreadcrumbList`. Não use `FAQPage` esperando resultado rico: o Google limitou esse recurso a sites governamentais e de saúde; a seção de perguntas ainda ajuda a responder buscas e IA, só não gera o visual especial.

Modelo:
```json
{"@context":"https://schema.org","@type":"NewsArticle","headline":"…","image":["https://…/16x9.jpg","https://…/4x3.jpg","https://…/1x1.jpg"],"datePublished":"2026-11-06T09:00:00-03:00","dateModified":"2026-11-06T09:00:00-03:00","author":[{"@type":"Person","name":"…","url":"https://…/autor/…"}],"publisher":{"@type":"Organization","name":"…","logo":{"@type":"ImageObject","url":"https://…/logo.png"}}}
```

## 6. Busca por IA (GEO / AEO)
Os buscadores de IA montam a resposta juntando trechos de páginas e citando a fonte. Para ser o trecho escolhido:
- **Responda no começo**: a primeira frase de cada seção é a resposta; o resto explica.
- **Frases autossuficientes**: "O Banco Central informou nesta quinta-feira (6) que a integração do Pix com o TIPS avançou para a fase de investigação." Não: "A medida avançou."
- **Fatos verificáveis**: número, data, nome, fonte citada no texto. IA prefere afirmação com atribuição clara.
- **Entidades claras**: nome completo e sigla na primeira menção; mesma forma de escrever o nome em todo o texto.
- **Perguntas reais como subtítulo** (as que aparecem em "As pessoas também perguntam").
- **Página rastreável**: conteúdo em HTML (não só imagem ou script), carregamento rápido, sem paywall bloqueando robôs que a marca quer atender. O `robots.txt` do site define quais robôs de IA podem ler (ex.: GPTBot, Google-Extended, PerplexityBot): decisão do dono.
- **Consistência de cobertura**: um jornal que cobre bem um tema (várias matérias ligadas entre si) vira referência para aquele assunto.

## 7. Legibilidade sem perder SEO
- Parágrafo de 2 a 4 frases, frase de até ~25 palavras, voz ativa.
- Corte: "é importante ressaltar", "vale lembrar que", "neste artigo", "confira a seguir", "em suma".
- Não repita o lide na conclusão. Matéria de notícia não precisa de "conclusão": termina no próximo passo ou no que falta saber.
- Variação natural: use sinônimos e o nome completo das entidades em vez de repetir a palavra-chave.

## 8. Depois de publicar
- Atualize a matéria quando o fato evoluir (com "atualizado em" e `dateModified`); não crie matéria nova para cada detalhe pequeno.
- Acompanhe no Google Search Console: impressões e cliques por consulta, aba Notícias/Discover, páginas não indexadas. Consulta que aparece muito sem clique = título/meta para melhorar.
- Matéria que envelheceu mas ainda recebe busca: atualize os dados e ligue para a cobertura nova.

## 9. Checklist rápido de aprovação
1. Palavra-chave certa para a intenção, presente nos 6 lugares naturais, sem repetição forçada.
2. Título SEO ≤ 60, meta 140–155, slug limpo.
3. Lide responde tudo em até 60 palavras.
4. H2 claros, sem seção repetida.
5. Valor próprio além da fonte.
6. Fontes no texto e no fim, com link e data; autor e data.
7. Frases citáveis, entidades por extenso.
8. Imagem com alt, links internos e externos, JSON-LD NewsArticle.
9. Leitura leve, sem enchimento.
10. Regras da casa (fato com fonte, tom de jornal, assunto permitido).
