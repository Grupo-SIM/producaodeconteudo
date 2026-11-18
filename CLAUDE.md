# Regras do projeto (Produção de Conteúdo / PDC)

## Treino dos agentes muda o sistema inteiro
O sistema está sendo montado antes de o treino terminar. O Roteirista (copy) é a base; Designer e Editor de vídeo dão vida ao que o copy escreve.
Sempre que um treino novo entrar (novo formato de copy, novo formato que o Designer sabe fazer, novo estilo de vídeo do Editor), atualize TODOS os lugares:
- `conhecimento/formatos-novo-conteudo.json`: formatos e tipos que aparecem em "Novo conteúdo" (só o que já está treinado).
- `fluxo-v2.mjs` (`FORMATOS_PADRAO`, `raiaDe`) e `public/app.html` (`COLS`, `SUBR`, `RHORA`): raias, colunas e horários do Fluxo e da Publicação.
- `conhecimento/agentes/<agente>/`: a base do agente.
- `conhecimento/produtos.json`: produtos confirmados pelo dono.
- Templates de arte (`TEMPLATES_CASA` em `server.js`, numerados "N · Nome"): só template APROVADO pelo dono fica visível; o resto leva `oculto: true`. O visível aparece sozinho na checklist de Marcas → Formatos e metas (agrupado em Jornalístico, Feed estático, Carrossel, Stories): confira lá a cada template novo aprovado ou removido.
Hoje: Editor de vídeo só faz motion. Designer: jornalístico aprovado (1 a 5 + contracapa 6) e os carrosséis aprovados 7 · Lista de erros (`erros-*`, peças em `banco/tpl-erros/`) 8 · Fogo (`fogo-*`, `banco/tpl-fogo/`) , 9 · Identidade visual roxo (`idv-*`, `banco/tpl-idv/`) , 10 · Xadrez mostarda (`xadrez-*`, `banco/tpl-xadrez/`) , 11 · Tipos de clientes verde neon (`clientes-*`, `banco/tpl-clientes/`) e 12 · Colagem pink e roxo (`colagem-*`, `banco/tpl-colagem/`), modelos em `public/arte-modelos.js`; texto na fonte da marca (sem fonte cadastrada, a fonte da arte) e copy maior ganha páginas no miolo sem perder as transições; fundo NUNCA se mistura entre templates, só elementos quando combinarem com a copy (`conhecimento/agentes/designer/13-recursos-aprovados-misturar.md`). Pasta nova de peças entra em `TPL_PASTAS` no `server.js`. Biblioteca separada: seção **Artes** (`colecao='arte'`) é só do Designer e só tem peças aprovadas pelo dono; Motion/VSL/Geral são do Editor de vídeo e não se mexe nelas no treino do Designer; estático, outros carrosséis e stories vão ser refeitos do zero a partir de referências do dono (kits: arte final + fundo da faixa + elementos soltos, replicados igual e depois ajustados).

## Deploy
Push no `main` gera a imagem `ghcr.io/grupo-sim/producaodeconteudo:latest`; o dono faz o Deploy no Komodo.
