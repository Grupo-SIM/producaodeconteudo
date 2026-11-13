# Regras do projeto (Produção de Conteúdo / PDC)

## Treino dos agentes muda o sistema inteiro
O sistema está sendo montado antes de o treino terminar. O Roteirista (copy) é a base; Designer e Editor de vídeo dão vida ao que o copy escreve.
Sempre que um treino novo entrar (novo formato de copy, novo formato que o Designer sabe fazer, novo estilo de vídeo do Editor), atualize TODOS os lugares:
- `conhecimento/formatos-novo-conteudo.json`: formatos e tipos que aparecem em "Novo conteúdo" (só o que já está treinado).
- `fluxo-v2.mjs` (`FORMATOS_PADRAO`, `raiaDe`) e `public/app.html` (`COLS`, `SUBR`, `RHORA`): raias, colunas e horários do Fluxo e da Publicação.
- `conhecimento/agentes/<agente>/`: a base do agente.
- `conhecimento/produtos.json`: produtos confirmados pelo dono.
Hoje: Editor de vídeo só faz motion; Designer ainda não foi treinado em todos os formatos.

## Deploy
Push no `main` gera a imagem `ghcr.io/grupo-sim/producaodeconteudo:latest`; o dono faz o Deploy no Komodo.
