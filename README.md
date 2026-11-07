# Agentes SIM — Criação autônoma de conteúdo

Painel CRM + equipe de agentes (Roteirista, Designer, Editor de Vídeo, Revisor, Social Media) que trabalha sozinha no seu servidor.
**Sem dependências:** só Node 22+ (usa SQLite e `fetch` nativos). São 2 arquivos de código: `server.js` e `public/index.html`.

## Dois jeitos de usar

**Modo chat (padrão, sem API e sem custo extra):** o painel organiza tudo — pipeline, base de conhecimento, revisões, métricas — e, a cada etapa, monta o **pedido pronto** para o papel certo (Roteirista, Revisor, Designer, Editor, Social Media). Você copia o pedido, cola no chat com o Claude, e cola a resposta de volta no painel. O painel valida a resposta e cria a próxima etapa sozinho.

**Modo automático (opcional):** se você colocar `ANTHROPIC_API_KEY` no `.env`, a equipe passa a trabalhar sozinha 24h, sem você colar nada.

## Como o fluxo funciona

```
Pedido (você, "Gerar pautas" ou programado para um horário)
   └─► Roteirista escreve ─► Revisor revisa o roteiro (nota 0–10, diretrizes e fatos)
          ▲                         │ reprovou? volta ao Roteirista (até N vezes)
          └─────────────────────────┘
                                    │ aprovou
                                    ▼
              Designer (arte) e/ou Editor (decupagem de vídeo)
                                    ▼
                    Revisor revisa a entrega (arte + vídeo)
          ▲                         │ reprovou? volta a quem fez, com ajustes
          └─────────────────────────┘
                                    │ aprovou
                                    ▼
        Social Media monta o pacote (legenda final, hashtags, horário)
                                    ▼
                  VOCÊ aprova no painel  ◄── nada sai sem isso
                                    ▼
              Webhook opcional (Make/n8n/Zapier) ─► posta nas redes
```

### Rotina no modo chat

1. **Conhecimento:** cadastre marca, diretrizes, tom de voz e produtos. Use **Copiar contexto da marca** e cole uma vez no começo de um chat novo com o Claude.
2. **+ Novo conteúdo** (ou **Gerar pautas agora**): cria o pedido na **Fila para o Claude** do Escritório.
3. **Abrir pedido → Copiar pedido:** cole no chat. Se já colou o contexto da marca nesse chat, desmarque “Incluir a base de conhecimento” para o pedido ficar menor.
4. Cole a **resposta do Claude** no painel e clique em *Enviar resposta*. Se a resposta vier fora do formato (por exemplo, a revisão sem JSON), o painel avisa e o pedido continua na fila.
5. Repita até o conteúdo chegar em **Aguardando você**; aprove, copie legenda e pacote, poste e marque como postado.

- **Revisor (métricas):** lance (ou importe em CSV) os números dos posts e clique em *Rodar análise*; o pedido do relatório entra na fila e o resultado alimenta as próximas pautas.
- **Treinamento:** a aba *Conhecimento* (marca, diretrizes, tom de voz, produtos, histórias, notícias, exemplos) e a aba *Agentes* (prompt de cada papel) definem o comportamento da equipe.

## Testar no seu computador antes de subir

**Windows:** instale o Node.js 22+ (nodejs.org), extraia o zip, dê dois cliques em `iniciar-windows.bat`, troque só o `ADMIN_PASSWORD` no Bloco de Notas que abrir e salve (a chave da API é opcional). O painel abre em http://localhost:3000.

**Mac/Linux:** na pasta do projeto, `cp .env.example .env`, edite o `.env` e rode `npm start`.

Os dados ficam na pasta `data/`. Para subir depois, copie a pasta inteira (com `data/`, se quiser levar o que já cadastrou) para a VPS e siga a instalação abaixo.

## Fluxo e aprovações (versão atual)

- **Imagem** (post, carrossel): Roteirista → Revisor revisa → Designer (arte) → Revisor revisa a entrega → Social Media monta o pacote → **você aprova no final** e posta.
- **Vídeo** (vertical e horizontal): igual, mas entram o Designer (capa) **e** o Editor (decupagem), e o Revisor revisa os dois juntos.
- **Texto** (carta de vendas, texto): Roteirista → Revisor revisa → pacote → **você aprova** → pronto.
- O pacote (legenda, hashtags, checklist) sai do roteiro na hora. Em Configurações dá para ligar o "Social Media com IA" e, se quiser, a aprovação do roteiro antes da produção (desligada por padrão).

## Instalação na VPS (Ubuntu 22.04/24.04)

```bash
# 1. Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Código
sudo useradd -r -m -d /opt/grupo-sim gruposim
sudo unzip grupo-sim.zip -d /opt/ && sudo chown -R gruposim: /opt/grupo-sim
cd /opt/grupo-sim
sudo -u gruposim cp .env.example .env
sudo -u gruposim nano .env        # ADMIN_PASSWORD (e ANTHROPIC_API_KEY, se quiser o modo automático)
sudo chmod 600 .env
```

### Serviço (systemd) — `/etc/systemd/system/grupo-sim.service`

```ini
[Unit]
Description=Agentes SIM
After=network.target

[Service]
User=gruposim
WorkingDirectory=/opt/grupo-sim
ExecStart=/usr/bin/node --disable-warning=ExperimentalWarning server.js
Restart=always
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now grupo-sim
sudo systemctl status grupo-sim        # deve mostrar "Agentes SIM em http://127.0.0.1:3000"
```

### Domínio com HTTPS (Caddy)

Aponte o DNS do seu domínio (registro A) para o IP da VPS e instale o Caddy (`sudo apt install caddy`). Em `/etc/caddy/Caddyfile`:

```
studio.seudominio.com.br {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
```

Pronto: `https://studio.seudominio.com.br` abre o login. O Caddy emite e renova o certificado sozinho. Na VPS, mantenha `HOST=127.0.0.1` e coloque `TRUST_PROXY=1` no `.env`.

## Primeiros passos

1. Entre com a senha do `.env`.
2. **Conhecimento:** cadastre identidade da marca, público, tom de voz, produtos e 3–5 exemplos que funcionaram. Quanto mais fatos reais, melhor (os agentes nunca devem inventar dados).
3. **Pipeline → + Novo conteúdo** para testar um pedido manual. Acompanhe no *Escritório*.
4. **Configurações:** defina temas de pauta, nota mínima e limite diário; ligue o **Modo autônomo**.
5. **Métricas:** lance os números dos posts; rode a análise.

## Operação

| Tarefa | Como |
|---|---|
| Ver logs | `journalctl -u grupo-sim -f` |
| Atualizar código | substitua os arquivos e `sudo systemctl restart grupo-sim` |
| Backup | copie a pasta `data/` (banco `studio.db` + segredo de sessão) |
| Trocar a senha | edite `ADMIN_PASSWORD` no `.env` e reinicie |
| Trocar o modelo | Configurações (padrão) ou aba Agentes (por agente) |

## Integração de postagem (webhook)

Em *Configurações → Webhook ao aprovar*, informe a URL de um cenário do Make, n8n ou Zapier. Ao aprovar um conteúdo, o painel envia um `POST` JSON:

```json
{ "event": "content.approved",
  "content": { "id": 12, "title": "...", "format": "video_vertical", "platform": "Instagram", "kind": "educativo",
               "script": "...", "art": "...", "video": "...",
               "pack": { "legenda_final": "...", "hashtags": ["#..."], "primeiro_comentario": "...", "horario_sugerido": "...", "checklist": ["..."] } } }
```

Sem webhook o fluxo é manual: copie a legenda/pacote, poste e clique em **Marcar como postado**.

## Limites desta versão (Fase 1) e próximos passos

- No modo chat, a produção acontece enquanto você estiver colando pedidos; para rodar 24h sozinho é preciso o modo automático (API).
- Designer entrega **direção de arte** em texto (a renderização automática de PNG de post/carrossel ainda não existe). O Editor entrega a decupagem **e**, no vídeo vertical, o spec que o motor de vídeo renderiza sozinho (veja “Motor de vídeo”).
- A publicação direta nas APIs do Instagram, TikTok e YouTube exige apps aprovados por cada plataforma; por isso a Fase 1 usa aprovação manual + webhook.
- A base de conhecimento entra por relevância de palavras-chave dentro de um orçamento de caracteres. Para bases muito grandes, o próximo passo é busca semântica.
- Métricas são lançadas manualmente ou por CSV (a leitura automática das contas depende das mesmas aprovações de API).
- A senha é única (um dono). Para equipe com vários usuários, seria preciso adicionar contas e permissões.

## Segurança

Senha com limite de tentativas, sessão assinada (HttpOnly, SameSite, Secure atrás de HTTPS), proteção CSRF por cabeçalho, CSP restritiva e todo texto gerado é renderizado sem HTML. Nunca exponha a porta 3000 diretamente na internet; use sempre o proxy com HTTPS.

## Arquivos da marca (logo, fundos, mascote…)
Conhecimento → escolha a marca → **📎 Arquivos** → **+ Arquivos**. Os arquivos ficam em `data/assets/` (copie a pasta `data` inteira ao subir para a VPS).
Os agentes recebem o catálogo (nome, tipo, etiquetas) e citam cada arquivo pelo nome exato; na tela de aprovação aparecem os arquivos citados, para baixar. Se faltar algum, o agente escreve "ARQUIVO FALTANDO" e o painel avisa.

## Produtos e os dois modos de conteúdo
- **Conhecimento → 🛒 Produtos:** ficha de cada produto (tipo, link da página de vendas, entregável, promessa, público, dores, objeções, bônus, garantia). O botão “🔎 Ler a página” busca o texto do link pelo servidor.
- **+ Novo conteúdo:** escolha o objetivo — 💰 Vender um produto (história que vende, venda natural), 📺 Monetizar o conteúdo (série/novela, retenção) ou 📣 Conteúdo da marca. O Roteirista aplica o método de contador de histórias e o Revisor avalia com critérios do objetivo.
- Há um item de diretrizes sobre monetização por plataforma (YouTube conferido na fonte oficial em 14/10/2026; as demais plataformas devem ser conferidas nos painéis oficiais).

## Motor de vídeo (vídeo vertical em motion 2D, automático)
**Para testar:** menu **Estúdio de vídeo**. Escolha “Vídeo de exemplo” (instantâneo, sem IA) ou “Com o meu tema” (o Editor cria as cenas), a marca, e siga as 4 etapas: cenas → prévia → vídeo rápido → vídeo final. Os testes não aparecem no Pipeline.

Fluxo: **Editor** (decupagem + spec JSON) → objetos 3D (fal.ai) → narração sincronizada (ElevenLabs ou Murf) → trilha base → render (Chromium + ffmpeg) → **MP4 1080x1920** no projeto (aba Vídeo).

**Instalar (uma vez):** Windows → rode `instalar-motor.bat`. Linux/VPS → `sudo apt install ffmpeg`, depois na pasta do painel `npm i playwright && npx playwright install chromium --with-deps`. Confira em **Configurações → Motor de vídeo**.

**Chaves (opcionais), só no arquivo `.env`:** `ELEVENLABS_API_KEY` + `ELEVENLABS_VOICE_ID`, `MURF_API_KEY` + `MURF_VOICE_ID`, `FAL_KEY`. Sem elas o vídeo sai sem narração e com emojis no lugar dos objetos 3D.

**No projeto (vídeo vertical → aba Vídeo → cartão “Vídeo motion”):**
- 👁 **Prévia das cenas:** um quadro por cena, grátis, em segundos.
- ⚡ **Vídeo rápido:** meia resolução, sem voz e sem objetos 3D (não gasta crédito).
- 🎬 **Renderizar vídeo final:** voz + objetos + 1080x1920. Leva cerca de 5 a 10 s de render por segundo de vídeo.
- “Ver / editar o spec” permite ajustar cenas à mão. Logo, mascote e fotos entram com `"asset":"nome-do-arquivo"` (arquivos cadastrados na marca em Conhecimento → Arquivos; use PNG com fundo transparente). Trilha própria: um arquivo de áudio da marca citado em `"music_asset"`.
- Em Configurações dá para escolher a voz, limitar os objetos 3D por vídeo (custo) e ligar **“Renderizar sozinho quando o Editor terminar”** (recomendado só na VPS, com a API).

Os vídeos ficam em `data/renders/` (o cache dos objetos 3D em `data/renders/_objetos/`: não paga duas vezes pelo mesmo objeto). Os scripts de linha de comando continuam na pasta `motor/` (`node motor/pipeline.mjs spec.json saida.mp4`).


## Formato × tipo de conteúdo × tema (build 2026-10-14.10)

- **Formato** = onde a peça é postada: carrossel, feed, stories, vídeo vertical, vídeo horizontal (igual para os 3 objetivos: vender produto, monetizar conteúdo, conteúdo da marca).
- **Tipo de conteúdo** = a natureza do texto: educativo, história real, ficção, notícia, venda, bastidores, opinião, história que vende, série, **texto** e **carta de vendas**. Texto e carta de vendas (em feed/carrossel/stories) não pedem arte nem vídeo.
- **Tema manual**: você escreve o tema e o briefing. **Tema automático**: em “Novo conteúdo → 🤖 Automático” (ou no botão “Pautas automáticas” do Escritório e no modo autônomo diário) o **Revisor** lê a base, os produtos, o histórico e as métricas, escolhe o ângulo, o formato, o tipo, a marca e o produto de cada pauta; o **Roteirista** escreve e a peça segue para revisão e produção. Dá para travar objetivo, marca, produto, formato, tipo e plataforma e deixar o resto por conta do Revisor.
- Conteúdos antigos foram migrados sozinhos (reel→vídeo vertical, vídeo longo→vídeo horizontal, post→feed, carta de vendas/texto→feed + tipo).

## Catálogo de produtos (build 2026-10-14.18)

- Os produtos agora são **únicos**: você cadastra cada um uma vez (menu **Produtos**) e escolhe em quais marcas ele vale.
- Na tela **Produtos**: cartão de cada produto com as marcas dele; **Editar ficha** e **🏷 Marcas** (marcar/desmarcar as marcas).
- Dentro de cada marca (Conhecimento → aba **🛒 Produtos**): **🔗 Selecionar produtos** abre o catálogo com caixas de seleção (marcar todos, buscar) e salva o conjunto da marca.
- Produto sem nenhuma marca = **Geral**: aparece como opção em qualquer marca ao criar conteúdo e para o Revisor.
- Os produtos que já existiam foram migrados sozinhos para a marca em que estavam.

## Cérebro e tela de Agentes (build 2026-10-15.20)
- **Cérebro** (menu lateral): memória central que dita as regras de cada agente. Cada regra é “sempre faça”, “nunca faça” ou “o que funciona”, vale para um agente ou para todos e, se quiser, para uma só marca. Todas as regras ativas entram automaticamente em **todo pedido** do agente (e no modo chat também), e o Revisor confere o roteiro contra elas na revisão.
- **Como ele aprende:** o painel registra as reprovações e aprovações do Revisor, os ajustes que você pede, o que você aprova e as métricas que você lança. Uma vez por dia (horário em Cérebro → “Como o Cérebro aprende”, padrão 21h) ou ao clicar em **Aprender agora**, o Cérebro consolida isso em lições curtas. Só roda se houver novidade, então não gasta à toa.
- **Aprovação:** por padrão cada lição nova fica “aguardando seu OK”. Para 100% autônomo, ligue “Aplicar lições sem pedir meu OK”. Regras que você arquivar não voltam sozinhas.
- No modo chat o aprendizado vira um pedido na fila (como os outros): copie, cole no Claude e traga a resposta.
- Os campos antigos “Aprendizados” e “Evitar” dos agentes viraram regras do Cérebro automaticamente na primeira inicialização.
- **Agentes:** tela nova com a equipe em cartões, o detalhe de cada agente (visão geral, regras do Cérebro, treinamento e modelo) e o botão Salvar fixo no topo.

## Escritório e Agentes (build 2026-10-15.23)
O Escritório e a tela Agentes voltaram ao visual de antes (cartões da equipe e os campos Aprendizados, Evitar, prompt e modelo). O Cérebro continua como tela separada no menu e soma as lições aprendidas aos campos de cada agente. Se uma versão anterior tinha movido seus “Aprendizados” e “Evitar” para o Cérebro, eles voltam aos campos automaticamente na primeira inicialização.

## Tela Agentes: visual novo (build 2026-10-15.24)
A lista dos agentes fica à esquerda e o agente escolhido abre à direita, com os mesmos campos de antes: Ativo, Modelo, Aprendizados (sempre fazer), Evitar (nunca fazer), Prompt, Salvar e Restaurar padrão, mais entregas, fila e tokens. O que você digita em um agente não se perde ao trocar para outro. O Escritório continua como era.

## Agentes que conhecem o sistema (build 2026-10-15.25)
- Cada agente já vem com **Aprendizados** e **Evitar** iniciais (só regras de ofício, que valem para qualquer marca). Em instalações existentes eles só entram nos campos que estavam vazios; o que você já escreveu não é tocado.
- Todo pedido agora leva um bloco “Como o sistema funciona”: o fluxo da linha de produção, a etapa daquele agente (o que recebe e o que entrega) e a ordem de prioridade das fontes (diretrizes de honestidade, ficha da marca, regras do Cérebro, Aprendizados e Evitar, prompt-base). Ele é montado na hora, então sempre reflete o fluxo atual.
- Tom de voz, identidade e produtos continuam na ficha de cada marca (Conhecimento); regras de uma marca só vão no Cérebro com a marca escolhida.

## Tela Agentes compacta (build 2026-10-15.26)
Cada agente é uma linha com nome e função. Clique para abrir e colar os Aprendizados e o Evitar (o Prompt e o Modelo ficam em seções recolhidas). Clique de novo para fechar; o que você digitou não se perde ao abrir outro agente.

## Tela Agentes em quadrinhos (build 2026-10-15.27)
- Antes de clicar: um quadradinho por agente (avatar, nome, função e selo de status).
- Ao clicar: abre abaixo o editor com Ativo, Salvar, Fechar, Aprendizados / Evitar lado a lado, Prompt e Modelo recolhidos.
- Os textos digitados ficam guardados ao trocar de agente até você salvar.

## Visual mais limpo (build 2026-10-15.28)
- Base de conhecimento: abas agrupadas ("Essencial da marca" e "Conteúdo e material"), cards uniformes com faixa de cor por assunto, estatísticas em linha. Dados e back-end intactos.
- Agentes: quadrinhos neutros, sem brilhos; cor do agente aparece só ao passar o mouse/abrir.

## Ajuste de proporções (build 2026-10-15.29)
Abas em uma única barra, busca em largura total, cards sem altura sobrando, quadrinhos de agentes compactos e campos de texto menores.

## Cérebro: base geral + novo visual (build 2026-10-15.30)
- As diretrizes gerais (sem marca) saíram da Base de conhecimento e foram, uma única vez, para a **Base geral do Cérebro** (Cérebro › Base geral). Diretrizes de uma marca específica continuam em Conhecimento.
- Todo agente recebe a base geral + as regras do Cérebro em todo pedido e a usa para conferir a base de conhecimento da marca.
- Tela nova: cérebro desenhado com os 5 agentes ligados; a linha acende quando o agente trabalha. Abas: Base geral, Regras dos agentes, Diário de aprendizado, Ajustes. O aprendizado diário e as regras seguem como antes.

## Cérebro como super prompt (build 2026-10-15.31)
Saiu a tela de regras por agente. O Cérebro agora é: Super prompt (base de conhecimento de todos os agentes + lições aprendidas), Diário e Ajustes. Botão "Ver super prompt" mostra tudo em um texto só.

## Tema preto e cinza + Cérebro novo (build 2026-10-16.32)
- Sistema todo em preto e cinza (cores só para status); cérebro maior com rede neural e agentes ligados por pulsos.
- Conhecimento: sem aba Diretrizes; na aba Produtos da marca só se seleciona produtos já cadastrados (criação fica na tela Produtos).

## Voz da marca (build 2026-10-16.33)
Conhecimento › Tom de voz tem provedor (ElevenLabs/Murf/outra), nome e ID da voz. Os agentes recebem a voz no contexto da marca e o render usa o ID da marca no lugar do ELEVENLABS_VOICE_ID/MURF_VOICE_ID do .env (a chave continua no .env).

## Build .34
- Escritório em pixel art escuro: uma sala por agente (cor própria), mesas, monitores animados, servidores do Cérebro, andarilhos levando papéis entre as salas, balão com a tarefa atual e log de atividade ao vivo com filtro por agente.
- Configurações reorganizadas em seções (Automação, Qualidade, IA e custo, Cérebro, Vídeo e voz, Postagem, Sistema) com um único botão Salvar. A aba "Ajustes" do Cérebro aponta para cá.
- Métricas: KPIs, gráfico de views por dia, ranking e plataformas. Produtos: filtro de marcas em chips.
- Base de conhecimento: cartões de categoria (com "Vazio" nas essenciais) no lugar das abas.
- Pipeline em estilo Trello: listas de largura fixa com rolagem horizontal, faixa colorida por etapa, cartões com etiquetas (marca, formato, nota) e botão "Adicionar um cartão".
- Pipeline idêntico ao Trello: cartão só com o título; ao clicar abre a gaveta com o Andamento (etapas), pedido pendente e ações.
- Cores das marcas: a cor principal vem da Identidade visual (campo Principais); sem ela, cor automática por nome. Aparece na lateral, no cabeçalho da marca, nas etiquetas e nos filtros de Produtos.
- Agentes e Cérebro usam as cores do Escritório; status voltaram a ter cores vivas (verde/amarelo/vermelho). Botão de adicionar único (ao lado da busca) na Base de conhecimento.

## Build .35
- Novo agente **Revisor** (laranja): depois que a peça fica completa (roteiro, arte e/ou vídeo), faz a revisão final, dá veredito (aprovar/ajustar), ajustes para a tarefa e feedback para as próximas; o feedback alimenta o Cérebro. Fica na aba Revisão da gaveta e num aviso antes de você aprovar; botão "Pedir esses ajustes ao Roteirista". Liga/desliga em Configurações › Qualidade (`gerente_on`) ou desativando o agente. Nova coluna no Pipeline: "4 · Revisão do gerente". Migração automática: o agente e a coluna `manager` são criados ao iniciar.
- Cérebro em grafo estilo Obsidian: núcleo central, agentes ao redor, pontinhos = itens da base e lições; pulsos dos agentes nutrindo o Cérebro.
- Escritório com 8 salas (inclui Revisor e uma copa).
- Emojis trocados por ícones SVG em todo o sistema (conversão automática na tela).
- Base de conhecimento: tela inicial com quadradinhos das marcas (cor, itens e essenciais); ao clicar abre a marca com todos os assuntos; botão "Todas as marcas" volta. Sem mudança de funções.

## Fluxo v2 (build 2026-10-16.36)
- O Analista foi fundido no **Revisor**: todo trabalho passa por ele. Pedido → Roteirista → Revisor revisa o roteiro (reprovado volta ao Roteirista) → Designer e/ou Editor → Revisor revisa a entrega (reprovado volta a quem fez, com ajustes) → Social Media monta o pacote → você aprova só no final, na hora de postar.
- Devoluções limitadas por "Revisões automáticas máximas" (Configurações › Qualidade); estourou, vai para "Precisa de atenção".
- O Revisor também faz pautas, relatório de métricas e o aprendizado do Cérebro. Não pode ser desativado.
- O Publicador agora se chama **Social Media** (id interno `publicador`).
- **Programar pedidos**: em "Novo conteúdo", campo "Quando começar" (Agora / Esta noite / data e hora). Com API, a equipe trabalha sozinha no horário e o conteúdo chega pronto para aprovar. No modo chat, o pedido só aparece na fila no horário. Hora de "Esta noite" em Configurações › Automação.
- "Eu também aprovo o roteiro antes da arte e do vídeo" continua disponível (desligado por padrão).
- A migração roda sozinha na primeira inicialização (dados, regras do Cérebro e histórico do Analista passam para o Revisor).

## Auditoria (build 2026-10-16.36)
Testado em modo API com um Claude simulado: fluxo completo automático (devoluções ao Designer, ajustes do dono, reprocessar), pautas, Cérebro (regras propostas e aprovadas), relatório de métricas, pedido programado rodando sozinho na hora, modo autônomo diário, limite diário de tarefas, render de vídeo com logo da marca e falha da API (bloqueia em ~90 s com mensagem clara). Cada agente recebe: descrição, identidade visual, tom de voz, histórias/notícias relevantes, produto, catálogo de arquivos, base e regras do Cérebro. Peça sem marca ("Geral") só enxerga o conteúdo geral.

## Entrega: onde você pega o que foi produzido

Toda peça termina na aba **Entrega** do painel da tarefa (abre sozinha quando a peça chega para a sua aprovação):

- **Artes (feed, carrossel, stories, capa)**: o Designer entrega a direção de arte e uma especificação visual; o painel gera os fundos por IA (opcional, fal.ai) e compõe os PNGs finais com texto, cores, fonte e logo da marca. Você vê as miniaturas, baixa cada imagem ou o ZIP com todas. Botões: **Recompor** (refaz a composição sem gastar IA) e **Refazer fundos** (gera novos fundos).
- **Vídeo**: player e download do MP4.
- **Roteiro / texto**: aparece na tela, com Copiar e Baixar arquivo (.md). Pedidos só de texto terminam aqui.
- **Legenda e pacote de postagem**.
- O Revisor recebe as imagens renderizadas (visão do Claude) para aprovar a entrega.

Requisitos na VPS: `npm i playwright && npx playwright install --with-deps chromium` (veja `instalar-motor`), fonte Poppins instalada no sistema (ou suba um arquivo de fonte, tipo "fonte", na marca) e, para fundos por IA, `FAL_KEY` no `.env` (modelo em `FAL_IMG_MODEL`, padrão `fal-ai/flux/schnell`; para mais qualidade use `fal-ai/flux/dev`). Sem `FAL_KEY` as artes saem com cor/foto da marca, texto e logo. Ajustes em Configurações › Vídeo e voz.

## Poses do mascote e custos

- **Conhecimento › Arquivos › Poses do mascote** (aparece quando a marca tem um arquivo do tipo "Mascote"): escolha as poses, veja a estimativa de custo, gere, e aprove as que ficaram fiéis. Cada pose aprovada vira um arquivo da marca (`nome-do-mascote-pose`, PNG com fundo transparente) e entra no catálogo que o Roteirista, o Designer e o Editor leem.
- O Roteirista indica a pose de cada cena/slide; o Designer escolhe entre as poses aprovadas. Se nenhuma serve, ele pode pedir uma pose nova na hora (limite em Configurações › Vídeo e voz, "poses novas por arte").
- Modelo de pose: `FAL_POSE_MODEL` (padrão `fal-ai/flux-pro/kontext`); recorte: `FAL_BG_MODEL` (padrão `fal-ai/birefnet/v2`).
- Custos: o painel soma uma estimativa de cada imagem gerada (Configurações › Vídeo e voz mostra o total do mês; cada peça mostra o gasto dela na aba Entrega). Preços de referência ajustáveis em `FAL_PRECO_FUNDO`, `FAL_PRECO_POSE`, `FAL_PRECO_RECORTE` (US$ por imagem). O valor real é o da sua conta no fal.ai.
- A fidelidade ao mascote depende do desenho dele; por isso as poses passam por aprovação sua antes de serem usadas.

## Pedir ajustes: para quem vai o pedido

Em "Pedir ajustes" você escolhe o que mudar: **só a arte** (diagramação, posição do texto, mascote, cores, fundo), **só o vídeo** ou **o texto/roteiro**. Arte e vídeo voltam só para o Designer ou o Editor, com o roteiro aprovado intacto, e depois o Revisor confere a entrega de novo. Só o texto/roteiro reinicia o ciclo completo. O Designer recebe a especificação anterior e mantém o que você não pediu para mudar, e os fundos de IA iguais saem do cache (sem custo extra).

## Meta diária e proteção de créditos

Em **Configurações › Automação** você define quantos feeds, carrosséis, stories, vídeos verticais e horizontais o modo autônomo produz por dia, em quais dias da semana, a partir de que hora, e as especificações (slides por carrossel e por stories, duração do vídeo). O Revisor cria só as pautas que faltam para bater a meta; ao cumpri-la, o painel para de pedir pautas e não gasta mais nada até o dia seguinte (no Escritório, o cartão "Meta de hoje" mostra o andamento). Pedidos e ajustes feitos por você continuam funcionando.

Proteções: no máximo 3 pedidos de pautas por dia; a meta é contada por peças criadas (peça travada não é substituída sozinha); "Limite de tarefas por dia" (Claude); "Limite de gasto com imagens por IA por dia" (fal.ai); máximo de fundos e de poses novas por peça.

## Vídeo avulso (Estúdio de vídeo)
Botão **Vídeo avulso** no Escritório (ou menu Estúdio de vídeo). Crie um vídeo de exemplo (instantâneo) ou com o seu tema/roteiro pronto (o Editor divide em cenas mantendo o seu texto). Depois escolha: **Prévia**, **Vídeo rápido**, **Vídeo sem áudio** (grátis), **Gerar sem voz** (qualidade final com objetos 3D, trilha e efeitos, sem narração) ou **Gerar com voz** (narração ElevenLabs/Murf; se nenhuma voz estiver configurada, o aviso aparece e o vídeo sai sem narração).

Se o Designer entregar sem a especificação visual, o painel pede de novo sozinho (modo API) e, em qualquer modo, você pode colar o JSON na aba Entrega.

## Biblioteca de mídia
Menu **Biblioteca**: um lugar só para imagens, vídeos, músicas, narrações, efeitos e fontes, organizado por tipo e por marca (arquivos “Geral” valem para todas as marcas). Arraste os arquivos para a tela (vários de uma vez), ou use **Enviar arquivos**. Limites: imagens e fontes 25 MB, áudios 60 MB, vídeos 120 MB. O sistema lê a duração e o tamanho do vídeo/áudio (precisa de ffprobe, que já vem com o ffmpeg) e cria a miniatura. Dê **etiquetas** e **descrição** (clima, assunto): o Editor lê o catálogo e escolhe por elas.

O Editor usa a biblioteca no spec do vídeo, sempre pelo nome:
- `"bg":{"asset":"nome","shade":0.45}` dentro da cena: foto ou vídeo de fundo (`start` opcional, em segundos, para vídeos; `shade` escurece para o texto ficar legível).
- `"music_asset":"nome"`: trilha. Sem isso, o sistema usa a trilha base.
- `"voice_asset":"nome"`: narração já gravada (tipo Narração). Ao clicar em **Gerar com voz** ela é usada no lugar da voz sintética (ElevenLabs/Murf). **Gerar sem voz** ignora.

Na aba **Vídeo** de cada peça, o bloco **Mídia da biblioteca neste vídeo** deixa você escolher música, narração e fundo na mão. Os vídeos de fundo são convertidos em quadros (cache em `renders/_clips`) e se repetem se forem mais curtos que a cena.

### Coleções da biblioteca
Cada arquivo pode estar em uma coleção, que diz ao Editor para que ele serve:
- **Fotos e elementos para motion**: imagens soltas que entram na cena (objetos, pessoas, produtos, logo, mascote). Viram itens `img` do spec.
- **Fundos para motion**: fotos, texturas e vídeos de fundo. Viram o `bg` da cena.
- **Vídeos estilo VSL**: footage em que a cena inteira é vídeo e o texto fica por cima. O Editor usa um vídeo por cena, com o fundo levemente escurecido.
Ao enviar, escolha a coleção (ou deixe em Automático: logo, mascote e foto vão para Elementos; fundo e textura para Fundos). Músicas, narrações e fontes ficam sem coleção. Dá para trocar a coleção a qualquer momento abrindo o arquivo. Arquivos que você já tinha foram classificados sozinhos.


## Gerente (cérebro do sistema)

Menu **Gerente**: um chat com o agente-chefe. Ele conhece a produção, o Cérebro e o treinamento de cada agente e **executa o que você mandar**:

- testar qualquer agente com um pedido seu (a resposta aparece no chat; é sandbox, não cria peça nem conta na meta);
- ensinar ou corrigir um agente (aprender/evitar/prompt). Cada mudança vira uma versão e pode ser **desfeita** no próprio chat ou no painel lateral;
- criar conteúdo e pautas, pedir ajustes, aprovar roteiro/peça final, reprocessar;
- ligar/desligar o modo autônomo e mudar metas e configurações permitidas;
- guardar regras no Cérebro, rodar o Cérebro, pedir relatório.

Regra: ordem sua = autorização; sugestões dele só viram ação quando você aprova. O antigo Gerente passou a se chamar **Revisor** (só o nome) e continua revisando as entregas como checagem independente. No modo chat (sem chave), cada resposta do Gerente vira um pedido para colar no Claude.


## Dashboard, Escritório, Estúdio, Produtos e Usuários (build .45)

- **Dashboard** (primeira tela): produção, aguardando você, prontos, postados, nota média, meta do dia, modo autônomo, fila e itens esperando aprovação. **Escritório** ficou só com a sala dos agentes, a atividade ao vivo e o resumo “Rodando agora”.
- **Estúdio de vídeo**: redesenhado e ligado ao agente Editor (o bonequinho do Escritório aparece editando enquanto ele cria as cenas ou renderiza). Existem só dois estilos de edição: **Motion** e **VSL**; o escolhido segue no pedido ao Editor, junto com os arquivos da Biblioteca.
- **Produtos**: vitrine estilo marketplace, com imagem do produto (da Biblioteca ou enviada), preço em destaque e as logos das marcas no lugar das etiquetas.
- **Apelido dos agentes**: em Agentes, campo “Apelido” muda só o nome exibido; função e treinamento não mudam.
- **Usuários e permissões** (menu Usuários, só administradores): cada pessoa entra com usuário e senha; o dono continua entrando sem usuário, com `ADMIN_PASSWORD`. Por área: Sem acesso, Ver ou Editar; modelos Editor de conteúdo e Somente leitura. As regras valem no servidor. Usuários podem ser desativados sem apagar.


## Escritório 3D e aprendizado do Cérebro (build .46)

- **Escritório em 3D isométrico**: sala desenhada em canvas (sem bibliotecas), com cada agente na sua mesa. Quando trabalha, o boneco digita, a tela acende e a mesa brilha; livre, ele descansa; com pedidos esperando, aparece um aviso. Sobre cada mesa há uma etiqueta com nome e situação (Livre, Trabalhando, N pedidos esperando você, Desativado) e, abaixo da sala, um cartão por agente com a tarefa atual, entregas, fila e tokens. Clique na etiqueta ou no cartão para abrir o agente.
- **Cérebro aprende com cada resultado**: o Designer e o Editor agora aprendem com a aprovação ou devolução do Revisor e com a sua aprovação final; o Revisor aprende quando você pede ajuste em algo que ele aprovou. Todo evento de reprovação guarda o motivo, e o Cérebro transforma motivos em regras “evitar” e acertos em “padrão”.
- **Aprendizado rápido** (modo API): se houver reprovações ou ajustes acumulados (3 ou mais, ou um ajuste seu), o Cérebro roda sem esperar o horário diário, no máximo uma vez a cada 20 minutos.
- Na tela do Cérebro, o painel “O que cada agente está aprendendo” mostra aprovados, reprovados, por que foi reprovado e o que deu certo, por agente.


## Build .47 — Biblioteca de mídia em seções

A biblioteca agora é dividida pelos dois estilos de vídeo: **Motion** e **VSL**, cada uma com suas imagens e seus vídeos e animações. A seção **Geral** guarda o que serve aos dois estilos (logos, mascotes, fontes, músicas e narrações).

- O envio já cai na seção que está aberta; dá para trocar no diálogo de envio.
- O Editor usa só os arquivos da seção do estilo pedido: VSL usa apenas a seção VSL, motion usa a seção Motion. Arquivos de Geral servem aos dois.
- Arquivos antigos foram migrados uma única vez (fundos, texturas, fotos e mascotes foram para Motion; logos, fontes e áudios para Geral).
- O Estúdio de vídeo mostra quantos arquivos há em cada seção.

## Build .48 — Escritório 3D mais fluido e realista

- Piso, paredes, janelas, tapetes e luz agora ficam numa camada guardada e só são refeitos a cada poucos segundos; o quadro em si desenha só o que se mexe (cerca de 1 ms por quadro).
- O laço de desenho é único e continua entre as atualizações automáticas: a tela não pisca mais nem refaz o canvas quando algo muda.
- O desenho se adapta ao computador: se ficar pesado, reduz a taxa de quadros sozinho. Pausa com a aba escondida.
- Removidos o brilho pesado dos pulsos (shadowBlur) e o `image-rendering: pixelated`, que causava linhas e serrilhado ao reduzir a imagem. Frestas entre as faces dos móveis foram fechadas.
- Realismo: rodapés, brilho do piso, feixes de luz das janelas, sombras sob as cadeiras e poeira flutuando na luz.

## Build .49 — Gerente e Cérebro aprendendo de verdade

- **Cada regra mostra se funciona:** o Cérebro compara as reprovações do agente antes e depois da regra ("Reprovações: 50% antes → 12% depois · funcionando"), e quantas vezes ela foi usada em pedidos. Regras que não ajudam são sugeridas para arquivar ou reescrever.
- **Aprovação por agente:** cada agente mostra a taxa de aprovação dos últimos 30 dias e a variação contra o período anterior.
- **Gerente aprende na conversa:** quando você diz "nunca...", "sempre...", "prefiro...", isso vira um sinal para o Cérebro (aprende na hora, no modo API) e o Gerente guarda a regra sozinho.
- **Gerente enxerga o aprendizado:** vê aprovações, reprovações e motivos por agente e o efeito de cada regra. Pode editar ou arquivar regras do Cérebro pelo chat. Novas sugestões no chat: "Qual agente mais erra e por quê?" e "Alguma regra do Cérebro não está funcionando?".

## Build .50 — Auditoria da estrutura

- **Saúde do sistema** no Dashboard (e lida pelo Gerente): tarefas que falharam, tarefas travadas, peças bloqueadas, fila grande, limite diário, agentes desligados, Cérebro sem aprender, lições esperando OK e agentes sem sinais de aprendizado.
- **Revisor com as regras do Designer e do Editor:** a revisão da entrega agora confere a arte e o vídeo contra as regras do Cérebro desses agentes e devolve citando a regra.
- **Social Media passa a aprender:** o resultado real dos posts (acima ou abaixo da média de engajamento da plataforma) vira sinal para Roteirista, Designer, Editor e Social Media; postar o pacote sem refazer é sinal positivo.
- **Regra que piorou é marcada:** se depois de uma regra aprendida as reprovações subirem 20 pontos ou mais, ela aparece com o botão Arquivar.

## Build .51 — Designer ou Editor, nunca os dois

- Demanda de **vídeo** (vertical ou horizontal) roda só no **Editor de vídeo**. Demanda de **arte** (carrossel, feed, stories) roda só no **Designer**. Antes os vídeos também chamavam o Designer.
- O Revisor sabe o tipo da entrega e avalia só a arte ou só o vídeo.
- Pedidos de ajuste (na peça ou pelo Gerente) vão sempre ao agente certo do formato.
- O fluxo e o Pipeline mostram "Editor de vídeo" ou "Designer" na etapa de produção, conforme a peça.

## Build .52 — Gerente: aba Comandos (funciona sem API)

- A tela do Gerente ganhou duas abas: **Comandos** (sem IA, funciona com ou sem a chave da API) e **Conversa** (com a IA; sem API vira o pedido que você cola no Claude).
- **Precisa de você agora:** roteiros e entregas esperando aprovação, peças bloqueadas, lições do Cérebro esperando OK, pedidos para o Claude e alertas de saúde, cada um com o botão de resolver ali mesmo.
- **Mandar o Gerente fazer:** criar conteúdo, gerar pautas, ensinar um agente, guardar regra no Cérebro, pedir ajuste em uma peça, testar um agente, aprender agora e relatório, tudo por formulário. Chama a mesma lógica do chat (`POST /api/gerente/acao`) e registra na conversa, com Desfazer quando couber.
- Ligar e desligar o modo autônomo direto na aba.
- Sem API a aba abre em Comandos; com API, em Conversa.

## Build .55 (inclui .54) — Estilo de arte dentro da Marca (Conhecimento → Identidade)

A tela separada "Estilos de arte" foi removida. Tudo agora vive na **Identidade** de cada marca (Conhecimento → marca → Identidade), junto com cores, fontes, logo e fundos que já existiam, sem campos duplicados:

- **Visão da marca**: prévia ao vivo de uma peça (cores, fonte do arquivo enviado, logo e composição escolhida), cores, fontes, arquivos e o quadro **"Pronto para artes de qualidade"** (9 itens: cores, destaque, fundo padrão, fonte, arquivo da fonte, logo, fundos, composição e construção de imagem), cada pendência com botão de atalho.
- **Construção de imagem**: composição (alinhamento, margens, densidade, hierarquia), estilo visual, parâmetros dos fundos por IA (prompt base, estilo, luz, lente, textura, cores em palavras, negativo, seed, com prévia do prompt final), mascote e o que evitar.
- **Aprendizado**: o Designer aprende com artes aprovadas e devolvidas ou com imagens de referência (API); o Cérebro também propõe. Toda sugestão chega com as diferenças e só vale com o seu OK; há histórico.
- **Fonte única da verdade**: o motor de arte lê cores, fundo padrão (escuro/claro) e fontes direto da Identidade e usa o arquivo de fonte cadastrado em Arquivos; o perfil de estilo guarda só o que a Identidade não cobre. Em Geral, o mesmo painel vale para todas as marcas sem estilo próprio.
- Endpoints `/api/art-styles` (GET/PUT, `/proposta`, `/aprender`) e a ação `aprender_estilo` do Gerente continuam.

**Como o estilo chega na criação da arte (verificado de ponta a ponta):**
1. O Designer recebe, em todo pedido de arte, a Identidade da marca (cores, fontes), o estilo (composição, estilo visual, fundo por IA, mascote, o que evitar) e o guia de construção de prompt de imagem.
2. O motor completa o que o Designer não definiu com as cores, o fundo padrão e o arquivo de fonte da Identidade.
3. Cada fundo por IA sai com o prompt montado (prompt base + cena + estilo + luz + lente + textura + negativo) e a seed da marca.
4. A composição é **aplicada no desenho**: alinhamento do texto, margens seguras e largura máxima; slides com mais palavras que a densidade escolhida geram aviso na peça.
5. O Revisor recebe o mesmo estilo, vê os slides renderizados e devolve ao Designer se algo descumprir.

Atualização: substituir `server.js`, `public`, `motor`, `README.md` e reiniciar.

## Build .56 — Cérebro turbinado (Cérebro → Memória e limpeza)

- **Apagar de verdade**: botão Apagar em cada regra, atividade e registro do diário; limpeza em massa de regras (por agente e marca), arquivadas, atividade (só as já aprendidas ou tudo), diário, base e "Esquecer tudo" (pede para digitar APAGAR). Toda limpeza guarda uma cópia: o botão **Desfazer** aparece no topo da aba.
- **Cópia de segurança**: baixar tudo em JSON e restaurar (juntar ou substituir), inclusive em outra instalação.
- **Faxina inteligente**: acha regras repetidas (junta e soma o reforço), regras em conflito (uma manda fazer, outra evitar), paradas (45 dias sem reforço e sem uso), sem efeito (reprovações não caíram) e arquivadas/atividade antigas. Você vê a lista, marca o que quer e aplica.
- **Busca na memória**: procura em regras, base, atividade e diário e já permite apagar o que estiver errado.
- **Lembrança seletiva**: cada agente recebe no máximo 24 regras por pedido, escolhidas por peso, regras suas, regras da marca e relevância para a tarefa (título, briefing, formato e plataforma). Registra o último uso de cada regra.
- Endpoints: `/api/brain/limpar`, `/desfazer`, `/backup`, `/restore`, `/faxina`, `/buscar`.

Atualização: substituir `server.js`, `public`, `motor`, `README.md` e reiniciar.

## Build .57 — Gerente: caixa de ordens sempre à vista

- A tela do Gerente voltou a ser uma **caixa de texto no topo** onde você digita a ordem (sem abas escondendo o campo). Os botões de comando, o "Precisa de você agora" e a equipe ficam logo abaixo.
- **Sem API**, ordens escritas executam na hora, sem IA: aprovar roteiro ou peça (um número ou "tudo que está pendente"), reprocessar, criar carrossel/feed/stories/vídeo sobre um tema para uma marca, gerar N pautas, ensinar ou testar um agente, guardar uma regra no Cérebro, pedir ajuste em uma peça, arquivar regra, aprender agora, relatório, aprender estilo e ligar/desligar o modo autônomo. Tudo o mais continua virando pedido para colar no Claude. Com API, a conversa segue como antes (a IA interpreta e executa).
- Correção: desligar o modo autônomo (e outras chaves liga/desliga) pelo Gerente agora desliga de verdade.

Atualização: substituir `server.js`, `public`, `motor`, `README.md` e reiniciar.


## Build .58 — Revisão geral

Revisão de qualidade com testes de API (51 verificações), varredura de todas as telas em desktop e celular nos dois modos (manual e com API), e fluxo de ordens do Gerente.

Corrigido:
- Login agora exige o cabeçalho `X-Nerd` (proteção CSRF igual às demais rotas).
- Quem tem permissão de Conhecimento (sem Mídia) agora lê e edita a Identidade da marca (estilo de arte).
- Categoria de conhecimento inválida é normalizada para "outros" (comportamento intencional).
- Usuário "pipeline" só leitura pode ver o Conhecimento (intencional, o pipeline precisa dele).


## Build .59 — Novo nome

O sistema agora se chama **Agentes SIM** (título, barra lateral, login, super prompt, mensagem de início e scripts .bat). Caminhos e nome do serviço systemd (`grupo-sim`) foram mantidos para não quebrar instalações existentes.


## Build .60 — Logo

A logo do Agentes SIM (robô + nome, fundo transparente) está na tela de login, na barra lateral e como ícone da aba. Fica embutida no `index.html`, sem arquivo extra.


## Build .61 — Correção do Cérebro

Quando um pedido de aprendizado do Cérebro ficava na fila mas a atividade já tinha sido consolidada, abrir o pedido gerava `Error: Ainda não há atividade nova...` no console e um "Erro interno" na tela. Agora o painel mostra a mensagem clara, remove o pedido inútil da fila e não imprime mais o erro.


## Build .62 — Logo só com o nome

Logo atualizada para a versão apenas com o nome (símbolo A + AGENTES SIM), com fundo transparente, no login e na barra lateral. O ícone da aba usa o símbolo A.


## Build .63 — Aprendizado de arte e vídeo

- **Motivos categorizados.** Em "Pedir ajustes" você marca o que deu errado (texto cortado, fonte errada, cores fora da marca, fundo ruim, ritmo lento, legenda mal sincronizada, áudio...). O Cérebro aprende por motivo, sem adivinhar pelo texto livre. Se você só escrever, o painel marca sozinho pelas palavras usadas.
- **Checagem automática.** O renderizador mede cada slide (texto fora do quadro ou da margem, contraste, título longo, sobreposição, zona de interface do stories) e corrige sozinho em até 3 passes. No vídeo checa cena longa, texto fora da tela, arquivo inexistente na biblioteca, duração e áudio. O que falhar aparece em "Checagem automática" na peça e vira evento de aprendizado.
- **Moldes aprovados.** O que você aprova de primeira vira referência para o Designer e o Editor da mesma marca e formato.
- **Regras por marca, formato e agente.** Lição de carrossel não vai para vídeo; lição de uma marca não vaza para outra.
- **Regra em teste.** Regra nova nasce "em teste", vale já, e só fica definitiva depois de 2 peças sem o mesmo problema. Se o problema volta, ela vai para sua análise.
- **Galeria (Cérebro › Galeria).** Artes e vídeos por marca, com o motivo de cada ajuste, a regra que nasceu dali e a opção de corrigir o aprendizado olhando a peça.
- **Aviso de conflito.** Regra que contraria a Identidade da marca (cor, fonte, fundo claro/escuro) recebe aviso.


## Build .64 — Estúdio de vídeo com Biblioteca

- **A Biblioteca agora é uma aba do Estúdio de vídeo** (Criar vídeo, Meus vídeos, Biblioteca). O item saiu do menu lateral. Links antigos para a Biblioteca abrem a aba certa.
- **Criar vídeo em 3 passos:** 1) marca, 2) estilo de edição (Motion ou VSL, com a contagem de arquivos de cada seção), 3) tema e chamada final. "Criar com o meu tema" é o modo padrão; "Vídeo de demonstração" testa só o motor.
- **Avisos em linguagem simples antes de criar:** motor de vídeo ausente, voz não configurada, seção do estilo vazia, marca sem logo. Cada aviso tem o botão que resolve (Configurar voz, Abrir a Biblioteca). Quando está tudo certo aparece "Tudo pronto para criar".
- **Painel "O que acontece depois"** explica as 4 etapas (Cenas, Prévia, Vídeo rápido, Vídeo final) e vira o acompanhamento do vídeo assim que ele é criado. Os detalhes técnicos do motor ficam recolhidos.
- **Permissões:** quem tinha só a permissão Biblioteca continua vendo e usando a biblioteca, dentro do Estúdio de vídeo. Quem tem permissão de vídeo (editar) também pode enviar arquivos.


## Build .65 — Estúdio de vídeo mais organizado

- Cabeçalho do Editor mais enxuto: o formulário aparece sem precisar rolar.
- O acompanhamento do vídeo ganhou o aviso **"Próximo passo"**, que diz em uma frase o que fazer agora (copiar o pedido, aguardar o Editor, gerar a prévia, gerar o vídeo final).
- Título do vídeo limpo: antes ele mostrava o texto interno do estilo de edição; agora mostra o tema e o estilo (por exemplo "Por que postar todo dia… · Motion"). O estilo segue para o Editor em um bloco próprio do pedido.
- Vídeos de demonstração aparecem como "Demonstração · marca", sem a palavra "Teste".
- No celular, o acompanhamento do vídeo sobe para antes do formulário quando há um vídeo selecionado.

## Build .66 — Estilos de motion e fluxo do vídeo

**Novo fluxo do Estúdio de vídeo:** 1) tema ou roteiro, 2) tipo (Motion ou VSL) e estilo, 3) marca. O servidor obriga o Editor a seguir o estilo escolhido e confere se o vídeo usou os arquivos da seção certa da Biblioteca (Motion não mistura com VSL).

**6 estilos de motion prontos:** Editorial, Neon tech, Minimalista, Impacto bold, Gradiente fluido e Cinematográfico. Cada um muda paleta, tipografia, destaque de palavra-chave, decoração, câmera e ritmo. "O Editor escolhe" deixa a IA decidir pelo tema. Cada estilo tem **Ver exemplo** (vídeo de demonstração sem IA).

**Aprender de um vídeo de referência:** botão "Aprender de um vídeo" na galeria.
- Com chave de API: escolha o vídeo, o painel tira 8 quadros no navegador (o vídeo não é enviado) e a IA devolve o estilo pronto.
- Sem API (modo chat): copie o pedido, cole no Claude com o vídeo (ou a imagem dos quadros, que o painel baixa), e cole a resposta na caixa. O estilo vira uma opção sua, que pode ser apagada.

**Galeria em cartazes:** cada estilo aparece como um cartaz vertical com a imagem real do vídeo (pasta `public/estilos`); o selecionado mostra a descrição e o botão "Ver exemplo". Estilos criados por você aparecem com um degradê das cores do estilo.

**Sem emoji nos vídeos:** o Editor usa, nesta ordem, 1) elementos 3D e imagens da seção Motion da Biblioteca, 2) objetos 3D gerados por IA (fal.ai), 3) objetos gráficos do próprio motor: esfera 3D (`orb`), anel (`ring`) e gráfico (`chart`), nas cores do estilo. Se algum emoji escapar no spec, o servidor troca por uma esfera. Os ícones dos cartões viram número ou visto. Para o resultado ficar bonito, envie seus elementos 3D em Biblioteca > Motion.

**Tela mais limpa:** barra de status compacta no topo, painel do vídeo fixo ao lado enquanto você rola a galeria, e galeria em cartazes.

**Também:** o "Novo conteúdo" do pipeline ganhou o campo "Estilo do vídeo"; o motor ajusta o texto para nunca cortar nas bordas.

**Atualizar:** substitua `server.js`, `public/`, `motor/` (há arquivo novo `estilos-motion.mjs`) e `README.md`, e reinicie o painel.

### Biblioteca com fichas (o Editor conhece cada arquivo)
- Ao enviar uma imagem ou vídeo, o painel registra automaticamente o tamanho, se tem fundo transparente, o tom (claro/escuro), as cores dominantes e avisa se a resolução é baixa.
- Com a chave de API, a IA olha o arquivo e escreve a ficha: o que é, descrição, quando usar, quando evitar, momentos do vídeo (gancho, dor, solução, prova, oferta, chamada final) e estilos que combinam. Em Estúdio de vídeo › Biblioteca, o painel "O Editor conhece X de Y arquivos" mostra o que falta e analisa em lote.
- Sem a chave (modo chat): "Pedir análise ao Claude" gera um pedido para até 20 arquivos de uma vez; você anexa os arquivos no chat e cola a resposta. Também dá para escrever a ficha à mão, abrindo o arquivo.
- O Editor lê a ficha de todos os arquivos, escolhe o elemento de cada cena pelo assunto da fala e do momento do vídeo, e a decupagem traz as colunas "Elemento" e "Por que esse".
- Conferências novas no vídeo: elemento repetido em mais de 2 cenas, imagem de baixa resolução usada grande e Biblioteca ignorada.

### Cérebro: aprende na hora com aprovação e reprovação
- Em Estúdio de vídeo, todo vídeo com cenas tem o cartão "Este vídeo ficou bom?". **Aprovar** guarda o vídeo como molde do que funciona. **Reprovar e ensinar** pede os motivos (marcados e/ou escritos) e, se você quiser, refaz o vídeo com o ajuste.
- A reprovação vira regra **na hora**, sem IA e sem colar nada no chat: o motivo marcado vira a regra pronta daquele motivo, e o que você escreveu vira "o dono reprovou e não quer repetir: ...". A regra entra em teste (já vale para o próximo vídeo) e fica definitiva depois de 2 peças sem o erro voltar.
- Erro repetido não duplica regra: reforça a que já existe.
- A pergunta de consolidação ao Claude (Cérebro > Aprender agora) continua existindo e refina as regras, mas já não é necessária para ele aprender.

## Build .67 — Inspeção visual, princípios fixos e aprendizado em tudo

- **Estúdio não é mais "teste".** O que você aprova ou reprova no Estúdio ensina o Cérebro como qualquer peça. Só as demonstrações prontas (título "Demonstração …") não ensinam.
- **Inspeção visual.** O Revisor olha as imagens reais: os quadros do vídeo (um por cena) e os slides da arte. Procura texto cortado, imagem borrada ou esticada, elemento sem relação com a fala, emoji, sobreposição, baixo contraste, logo ausente e cena poluída. Cada problema vira uma checagem da peça (aparece em "Checagem automática"), alimenta o Cérebro e, quando é grave, volta ao Editor/Designer como correção.
  - Com chave de API: roda sozinha na revisão da entrega (vídeo) e na entrega da arte; também há o botão **Inspeção visual** no Estúdio e na peça. Para desligar: `visual_check` = `0` em Configurações.
  - Sem chave: o botão gera uma folha com os quadros e o pedido pronto; leve ao chat do Claude e cole a resposta.
- **Princípios fixos** para todos os agentes (qualidade antes de volume, fidelidade ao pedido e à marca, veracidade, foco em venda/monetização, aprender com erro e acerto, autoinspeção). O Revisor age como profissional sênior de marketing digital e confere fidelidade e veracidade.
- **Motivos novos de reprovação** (vídeo e arte): imagem borrada, elemento sem relação, cena poluída, sobreposição, contraste baixo, emoji, logo ausente, tamanho errado.

## Build .68 — Estilos prontos: apagar e visuais distintos

- Todo estilo da galeria (inclusive os prontos) tem o botão **Apagar**. Os prontos apagados ficam listados abaixo da galeria com **Trazer de volta**.
- Cada estilo agora tem fundo e paleta próprios: Editorial (papel e vermelho), Neon tech (azul-noite e ciano), Minimalista verde (sálvia e verde), Impacto bold (amarelo), Gradiente fluido (roxo), Cinematográfico (preto e dourado) e Tipografia cinética (coral e preto, destaque amarelo).

## Build .69 — Sem estilo só de texto
- Removido o estilo "Tipografia cinética" (só texto). O Editor não escolhe mais esse look e a checagem automática devolve ao Editor qualquer vídeo em que mais da metade das cenas tenha só texto: toda cena precisa de imagem, objeto 3D ou objeto gráfico.

## Build .70
- Corrigido no Windows: a folha de quadros da inspeção visual (sem chave de API) falhava com "Error opening input file ... v*.jpg" porque o ffmpeg do Windows não aceita curinga. Agora usa arquivos numerados em sequência.

## Build .71
- A prévia das cenas passa na frente dos vídeos completos na fila de renderização. Antes, com vários vídeos sendo gerados, a inspeção visual do Revisor esperava atrás deles e travava as tarefas.

## Build .72 — Correções do relatório de testes
- Quem não tem permissão de Conhecimento/Produtos (ex.: só "pipeline") vê os títulos da base, mas nunca o conteúdo.
- Categoria de conhecimento inválida agora devolve erro claro em vez de virar "outros" em silêncio.
- Aprovar uma peça estática cuja imagem não foi gerada pede confirmação ("Aprovar assim mesmo").
- Configurações › Automação: novo interruptor para a inspeção visual do Revisor.

## Build .73 — Estúdio de arte
Nova área **Estúdio de arte** no menu (permissão própria "Estúdio de arte"; quem já tinha acesso ao Estúdio de vídeo também entra).
- **Criar arte avulsa** de três jeitos: pedir ao Designer (descreve e ele monta; no modo chat abre o pedido para colar no Claude), montar no editor a partir de uma arte em branco da marca, ou partir de um layout salvo da marca.
- **Editor visual (estilo Canva)**: arrastar, redimensionar (alça no canto; alça lateral muda a largura do texto), editar texto, tamanho, peso, cor e alinhamento, trocar imagem (biblioteca da marca ou envio do computador), mudar o fundo (cor, imagem ou IA), acrescentar texto, imagem e formas (retângulo, círculo, linha), vários slides com miniaturas, desfazer/refazer, guias de centro e zonas seguras. Atalhos: Ctrl+Z, Ctrl+Y, Ctrl+D, Ctrl+S, Delete e setas. O desenho usa o mesmo módulo do motor (`public/arte-slide.js`), então o que aparece no editor é o que sai no PNG.
- **Também nas peças do Pipeline**: na aba Arte da peça há o botão "Editar no estúdio". Arte editada à mão não é mais reposicionada pela composição da marca nem pela correção automática (o que você posicionou vale); a verificação continua aparecendo como aviso.
- **Aprovar e ensinar**: ao aprovar, o painel compara a versão do Designer com a sua, guarda cada ajuste, a arte vira molde aprovado e o mesmo ajuste repetido em 2 artes da marca vira regra em teste para o Designer (aparece no Cérebro). Aprovar uma peça do Pipeline que você editou também ensina.
- **Layouts por marca**: "Salvar como layout" guarda posições, tamanhos, cores, formas e estilo de fundo. O Designer recebe os layouts da marca em todo pedido de arte (ou o escolhido, que ele reproduz exatamente) e você pode partir de um layout para criar uma arte nova. Aba "Layouts das marcas" para renomear, mudar a marca e apagar.
- Atualizar: substitua `server.js`, `public/`, `motor/` e `README.md` e reinicie.

## Build .101 — Ajuste do estilo por marca e regra de maiúsculas

- **Salvar estilo agora vale só para a marca da arte aberta no editor.** Cada marca guarda o próprio ajuste (posição, tamanho, cor, efeito, fundo, elementos). Ajustar a marca A não muda a marca B.
- Marca que ainda não tem ajuste próprio usa o de outra marca com as cores trocadas pela paleta dela, até você ajustar.
- Na galeria, o cartão do estilo mostra "Ajustado para <marca>" quando a marca escolhida já tem ajuste.
- **Tipografia da marca** (Conhecimento > marca > Identidade > Construção de imagem): títulos em MAIÚSCULAS, como foram escritos ou em minúsculas; botões e chamadas e rótulos pequenos em MAIÚSCULAS ou como foram escritos. Vale para todos os estilos e artes da marca.
- Fonte, logo, mascote e texturas (tipo "textura" na Biblioteca) já eram por marca e continuam entrando como base de toda arte dela.
- "Editar" abre o editor sem esperar a fila de prévias da galeria.

## Build .100 — Estúdio de arte virou a galeria de estilos

- O Estúdio de arte agora serve só para **criar e editar estilos**. Não tem mais campo de título, roteiro ou texto: o conteúdo vem do roteirista e o estilo cuida do visual.
- A tela abre em **Estilos**: escolha o formato (Feed, Carrossel, Stories) e a marca, e cada estilo mostra uma prévia com as cores, a fonte, a logo e o mascote da marca. Clique na prévia para ver todas as páginas.
- Cada estilo tem **Editar**, **Duplicar**, **Usar como padrão** (da marca escolhida) e **Apagar** (ou **Restaurar original**, nos estilos da casa).
- **Novo estilo**: dê o nome, escolha se parte do zero ou de outro estilo e o editor abre numa arte de exemplo.
- **Salvar estilo** guarda tudo o que você mexeu: a estrutura das páginas e o visual (posição, tamanho, cor e efeito de cada texto e imagem, formas que você acrescentou, fundo). As próximas artes saem iguais, trocando só texto, marca e imagens. Ao mudar de marca as cores acompanham a paleta da nova marca.
- Estilos da Biblioteca Central são só de leitura: duplique para criar a sua versão.
- As artes montadas pelo roteiro usam o estilo padrão da marca, quando há um.
- As abas "Minhas artes" e "Layouts das marcas" continuam.

## Build .99 — Mascote no tema da capa
- Quando a marca tem mascote, a capa montada pelo roteiro usa sempre o mascote como protagonista: a pose sai do "Visual" do roteiro (ex.: "mascote de astronauta fincando a bandeira na Lua") e o cenário do tema vai no fundo, em camadas.
- O "Visual" em português é traduzido para inglês antes de ir para o gerador (pelo próprio fal.ai, sem a API da Anthropic), separando a pose do mascote do cenário. A tradução fica guardada e não é paga duas vezes.
- O pedido de pose do roteirista entre colchetes ("[mascote: correndo]", "[mascote novo: comemorando]") vira a pose daquela página e não aparece mais como texto na arte. Se já existe uma pose aprovada que combina, ela é usada sem gerar outra.
- Títulos não deixam mais uma palavra curta ou fraca sozinha numa linha ("A / VOLTA / À LUA").

## Build .98 — Roteiro no modelo do dono e arte direto do roteiro
- O Roteirista aprendeu o formato de entrega aprovado (`conhecimento/agentes/roteirista/01-formato-de-entrega-carrossel-e-arte.md`): cada página abre com "📌 Slide N — NOME" e traz "Título:", "Texto:", "Visual:", lista "1. Item: explicação" ou contraste "Como o amador faz:" / "Como a marca forte faz:"; a última traz "Texto:" e "Chamada:"; a legenda vem no estilo "Legenda do Post".
- O painel lê esse roteiro e monta a arte no estilo aprovado com os textos exatos: capa com o número em destaque, páginas de contraste sem número e com o lado certo na cor da marca, lista numerada, chamada final com o botão tirado da chamada ("Comente MINDSET", "Link na bio").
- **Modo chat:** a arte de um roteiro nesse formato é montada sozinha, sem pedido para colar. **Com a API:** o Designer recebe as páginas já lidas e, se esquecer o bloco JSON, o painel monta pelo roteiro em vez de pedir de novo. Configurações › Vídeo e voz › "Montar a arte direto do roteiro" (só no modo chat e como plano B, sempre, ou nunca).
- Botão "Montar pelo roteiro" na peça; no Estúdio de arte, campo "cole o roteiro pronto"; no chat do Gerente, colar o roteiro já monta a arte.
- Legenda: o painel também reconhece "Legenda do Post" como a seção da legenda.
- Correções: as poses do mascote quebravam a renderização com o fal.ai ligado ("maxPose is not defined"); importar foto da internet com marca escolhida dava erro; o chat do Gerente aceita mensagens de até 20 mil caracteres.
- Vídeo: a renderização automática do MP4 vem ligada por padrão (Configurações › Vídeo e voz), para a produção seguir sozinha até a aprovação.

## Build .97 — Biblioteca Central para white label
- Nova pasta `biblioteca-central/`: um serviço separado (roda na sua VPS) que guarda o material oficial: conhecimento dos agentes, mídias, templates de arte e estilos de vídeo. Veja `biblioteca-central/README.md` para instalar.
- Cada painel white label recebe uma chave de licença e baixa o material sozinho: ao iniciar, a cada 6 horas e no botão **Configurações › Biblioteca Central › Atualizar agora**.
- Atualizou um item na Central, todos os painéis recebem a nova versão. Retirou, ele sai dos painéis. Conhecimento que o cliente editou não é sobrescrito.
- Cliente suspenso ou com a validade vencida para de receber atualizações e fica com o que já baixou.
- No painel matriz (com `BIBLIOTECA_ADMIN`), a mesma tela lista o que pode ser publicado e envia para a Central.
- Itens da Central aparecem com o selo "Biblioteca Central" nos templates.

## Build .96 — Templates, montar no estilo, Gerente sem API e Cérebro mais limpo

- **Templates de arte** (Estúdio de arte › Templates): a estrutura da arte, ou seja, o modelo de cada página e onde entram mascote, foto e fundo claro. Um template se repete com conteúdos diferentes e em qualquer marca, trocando cores, logo e mascote. Já vêm 8 da casa: Mitos e verdades, Lista numerada, Passo a passo, Oferta, Opinião, Post com personagem, Post com objeto e Sequência de stories. No editor, “Salvar como template” guarda a estrutura da arte aberta com nome, “quando usar” e tipo (simples ou robusto).
- **Criar arte › Montar com o estilo:** escolha o formato, as páginas, a marca e o template, e escreva o título da capa, a chamada, o personagem e os textos (uma página por linha: “Título: texto”; “[foto: cena]” pede foto em cartão; “item - explicação; item - explicação” vira lista). O painel monta tudo no estilo aprovado, sem IA, e abre no editor. O antigo “em branco” agora também parte do estilo.
- **O Designer escolhe o template pela copy:** recebe o catálogo (casa e os seus) com o “quando usar” e a estrutura, informa `"template"` e o painel completa modelos, mascote e fundo.
- **Mascote em todas as artes:** os mascotes da marca (o original e as poses aprovadas) giram entre a capa, as internas e a última página. Com só o original e o fal.ai ligado, o painel gera poses novas (apontando, sentado, correndo...).
- **Gerente funciona com e sem API:** ordens claras executam na hora nos dois modos. Novas ordens: “ajuda”, “adicione ao conhecimento do designer: Título | texto”, “crie a marca Nome”, “monte um carrossel de 7 páginas da marca X no estilo sobre: título”, “refaça a arte #12”, “mude a regra #5 para ...”, “desfaça a última mudança”, “o que o designer sabe”, “quais marcas”, “peça #12”. Sem API, o que não for ordem vira pedido para o Claude e o Gerente avisa.
- **Cérebro:** saiu o quadro “O que cada agente está aprendendo” e os emojis da tela. O aprendizado sem API continua: reprovação com texto vira regra na hora, motivo repetido vira regra em teste, ajuste aprovado vira regra e edição repetida no editor vira regra.
- **Recorte obrigatório:** se o recorte do fundo de um personagem ou objeto falhar, a página se refaz sem a imagem (antes entrava a foto quadrada, com cara de colagem).

## Build .95 — Correções do carrossel completo

- **Quebra de linha de designer:** o título não termina linha em palavra fraca ("de", "não", "que"...) nem deixa palavra curta sozinha.
- **Capa revista:** com título de 2 linhas, o personagem fica logo abaixo sem cobrir letra; a cabeça só encosta no título quando ele é uma palavra só.
- **Objetos e mascote** das páginas internas ficam inteiros, dentro do quadro e acima do rodapé, sem halo colorido em volta. A luz da marca vem de trás.
- **Lista:** sem a letra gigante automática ao fundo.
- **Última página:** aceita o mascote ou objeto da capa acima da frase.
- Designer: documento "Estilo aprovado pelo dono" com a lista dos erros que não podem voltar.

## Build .94 — Fotos da internet, hierarquia de cor e efeitos no editor

- **Biblioteca › Internet** no editor de arte: busca fotos em bancos com uso comercial liberado (Pexels, Unsplash e Pixabay com chave grátis no `.env`; sem chave, Openverse). Use como imagem, como fundo ou recortada (o fal.ai tira o fundo). A foto vai para a Biblioteca da marca com o crédito do autor.
- O Designer também pode pedir `"banco: termo"` em foto, objeto ou partículas. O painel busca, baixa (e recorta quando é personagem ou objeto) e guarda em cache. O crédito aparece na nota da arte.
- **Hierarquia de cor:** uma coisa só em destaque por página. Título todo marcado vira branco (a chamada pequena leva a cor da marca); com palavra marcada no título, a chamada fica branca. Mais de uma palavra marcada: só a primeira fica em destaque.
- **Efeitos no editor (estilo Canva):** no texto, fonte, caixa alta, itálico, espaço entre letras, altura da linha, cor do destaque, brilho, sombra, vazado, contorno, faixa, girar e transparência. Na imagem, desfoque, sombra, brilho na borda, na frente do texto, tratamento de cor (preto e branco ou na cor da marca) e girar.
- Configurações › Vídeo e voz mostra quais bancos de fotos estão ativos e onde pegar as chaves.

## Build .93 — Um estilo só para todas as marcas

- Mesmo padrão de arte para todas as marcas; só mudam as cores, a identidade e o assunto. Logo centralizada no alto, maior e com respiro, e "Arraste para o lado" centralizado no rodapé (menos na última página). Sem contador de páginas e sem pílula repetida na capa.
- Personagem com a cor natural (antes recebia um filtro verde que deixava a pele esverdeada). A cor da marca entra só na luz: contorno, brilho no canto e reflexos.
- Fundo mais escuro e fiel à marca: luz da cor de destaque vindo do canto, vinheta mais forte.
- Capa revista: a cabeça do personagem encosta na parte de baixo do título gigante (efeito capa de revista), calculado pelo tamanho do título.

## Build .92 — Moldura profissional e páginas internas com mídia

- **Grade fixa de marca:** cabeçalho com a logo (à esquerda por padrão, ou centralizada quando a Identidade pede) e o contador "01 / 05" à direita. No rodapé vai o "Arraste" discreto no canto (ou "Arraste para o lado" centralizado, quando a marca pede). Mesmas posições e tamanhos em todas as páginas; a capa não repete a pílula quando a marca já usa o rodapé.
- **Contatos** só no post único e na última página.
- **Capa revista:** a chamada vai acima do título gigante e embaixo fica só o botão: nada de texto em cima do corpo do personagem.
- **Páginas internas com mídia:** os modelos `texto` e `numero` aceitam `objeto` (mascote ou objeto recortado saindo pelo canto) ou `foto` (cartão de foto com cantos arredondados embaixo do texto).

## Build .91 — Capa em camadas (padrão das capas de agência)

- **Personagem recortado:** no modelo `heroi`, a foto deixou de ser um fundo chapado. A IA gera o personagem, o painel recorta e coloca grande à direita, saindo pela borda de baixo, com luz de contorno na cor da marca. Atrás dele vai um ambiente desfocado (campo `ambiente`), e na frente fica um escurecimento que funde o personagem no fundo e deixa o texto legível.
- **Novo modelo `revista`:** título gigante de lado a lado no alto, personagem na frente e apoio e botão embaixo.
- **Partículas do tema** (campo `particulas`: notas, moedas, peças): cinco cópias desfocadas em volta, umas atrás e outras na frente do personagem. A imagem é gerada uma vez só e reaproveitada.
- A logo da moldura fica sempre por cima de tudo.

## Build .90 — Modelos profissionais de arte (padrão de agência)

- **O Designer não posiciona mais texto no olho.** Cada página é montada a partir de um MODELO profissional (`public/arte-modelos.js`): `heroi` (personagem com luz da marca e título enorme), `dividido` (título partido pelo objeto), `capa-faixa`, `capa-minimal`, `frase`, `texto`, `lista`, `numero`, `pilulas` e `cta`. O Designer escolhe o modelo e escreve os textos. O painel mede cada título com as larguras reais das fontes (`public/arte-metricas.js`) para ele preencher o bloco, empilha os blocos sem sobreposição e aplica as cores, as fontes, a logo e a moldura da marca (logo no topo, "Arraste para o lado", contatos) igual em todas as páginas.
- **Profundidade de campanha:** foto por IA com o sujeito à direita e luz de contorno na cor da marca, objeto 3D recortado na frente do texto, cópias desfocadas nos cantos, granulado, vinheta e brilho. Sem fal.ai (ou se a geração falhar), o modelo se refaz sozinho com um objeto 3D desenhado, sem deixar buraco.
- **Editor de arte:** novo bloco "Modelo da página" para escolher o modelo, escrever título, apoio, botão, foto ou objeto e aplicar na página. Tudo continua editável peça por peça.
- **Conhecimento do Designer:** novo documento "Padrão de agência" (anatomia da peça, escolha do modelo, como pedir a foto e o objeto, coerência do carrossel, o que deixa a arte amadora). A regra 3 do Designer passa a exigir os modelos; se você tinha reescrito as regras, elas ficam como estão.
- **Editor de vídeo:** abre em **modo simples** (prévia, linha do tempo, textos e cena). Decoração, câmera, animações, tempos e transições ficam no **modo avançado**, a um clique. O painel lembra a sua escolha.
- **Aprovar arte com prévia:** clique numa miniatura para ver em tamanho grande, baixar uma página, baixar tudo em ZIP ou aprovar ali mesmo.
- **Cérebro › Evolução:** gráfico da nota média e, por agente, as entregas aprovadas e as devolvidas.
- **Formato pelo roteiro:** se o roteiro tem "Slide 1, Slide 2…" numa peça de post único, ela vira carrossel antes da arte.
- Atualizar: substitua `server.js`, `public/` (index.html, arte-slide.js, arte-modelos.js, arte-metricas.js), `motor/arte.mjs`, `conhecimento/agentes/designer/` e `README.md` e reinicie com o `iniciar-windows.bat`.

## Build .89 — Correção do carrossel cortado e Gerente respondendo sem API

- Carrossel que nascia como "feed" (pautas automáticas) tinha as páginas cortadas para 1 imagem. Agora: a pauta que pede carrossel já nasce carrossel; se o Designer entregar várias páginas numa peça "feed", ela vira carrossel e todas as imagens são geradas. Na primeira inicialização, as peças afetadas são recuperadas a partir da entrega do Designer e as imagens são geradas de novo.
- Posição do texto: com alinhamento à esquerda/direita, o Designer às vezes mandava o centro do bloco e o texto saía do quadro. O painel converte para a margem certa e alinha os blocos do mesmo lado na mesma margem; o guia do Designer explica a regra.
- Gerente no modo chat responde na hora, sem API: como está a produção, o que está pendente, o que o Cérebro aprendeu, qual agente mais erra e a saúde do sistema. Ordens (aprovar, criar, ensinar, ligar o autônomo…) já eram executadas na hora.

## Build .88 — Base de conhecimento da casa para Designer, Editor, Revisor, Social Media e Gerente

- Pesquisa de mercado (outubro de 2026) transformada em 16 documentos em conhecimento/agentes/<agente>/, carregados sozinhos na "Base de conhecimento deste agente" ao iniciar (e atualizados a cada versão; documento que o dono editou é preservado):
  - Designer: arte que para o dedo; medidas e zonas seguras 2026; carrossel que retém e vende; originalidade, IA e publicidade.
  - Editor de Vídeo: retenção em vídeo curto; duração por objetivo e plataforma (Reels, TikTok, Shorts, programas de monetização); zonas seguras; vídeo que vende; originalidade, direitos e IA.
  - Revisor: avaliação por resultado (nota de 0 a 10 por critério, reprovação direta); sinais das plataformas e métricas de referência.
  - Social Media: legenda, palavras-chave e hashtags; horário, frequência e testes; monetização por plataforma no Brasil.
  - Gerente: estratégia para monetizar e vender; métricas e decisões. O Gerente também ganhou "Aprendizados" e "Evitar" (estavam vazios).
- O agente de copy e o Revisor de Copy não foram alterados.

## Build .87 — Reformulação de qualidade de todos os agentes

- Princípios da empresa (vão para todos os agentes) ganharam: 8) ATRAIR E SEGURAR (primeiro segundo, retenção e ação; visual com um ponto focal, contraste, texto curto e marca reconhecível) e 9) ASSERTIVIDADE (direto, no formato pedido, decide e justifica; suposição escrita ou pedido do dado, nunca invenção).
- "Aprendizados" e "Evitar" reescritos para Designer, Editor de Vídeo, Revisor e Social Media com regras de resultado (capa que para o dedo, hierarquia, tamanhos mínimos, zonas seguras, ritmo de corte, primeiro segundo, legenda com segundo gancho, hashtags de nicho, revisão com correção pronta). As antigas ficam em settings (regras_antigas_<agente>).
- Os manuais do pacote agora também servem às outras etapas: Designer recebe M04 e M16, Editor recebe M16 e M07, Revisor recebe M00 e M17, Social Media recebe M05. Toda a equipe trabalha com os mesmos padrões do Roteirista.

## Build .86 — Aprendizados e "evitar" do agente de copy alinhados ao pacote

- Os campos "Aprendizados (sempre fazer)" e "Evitar (nunca fazer)" do Roteirista e do Revisor de Copy foram reescritos com base no pacote (regras absolutas, ordem de leitura, processo de escrita, verdade e fonte, políticas, originalidade, entrega em 7 blocos, pedido ao Gerente, laudo do Revisor). As regras antigas, que vinham do método anterior (padrões de persuasão, formato antigo de resposta, menção a Hard Copy), ficam guardadas em settings (regras_antigas_roteirista / regras_antigas_revisorcopy).
- iniciar-windows.bat fecha sozinho um painel antigo que tenha ficado aberto na porta.

## Build .84 — Base de conhecimento própria em todos os agentes

- Cada agente (Roteirista, Revisor de Copy, Revisor, Designer, Editor, Gerente, Social Media) tem agora "Base de conhecimento deste agente" em Configurações → Agentes: importar .md/.txt (cada título "# " vira um documento, com prévia para escolher o que entra), escrever um documento novo, editar, restaurar e apagar.
- Cada documento é "Sempre" (vai em todo pedido do agente) ou "Quando relevante" (entra só quando o assunto do pedido combina: formato, tema, plataforma). Limite de 45.000 caracteres por pedido, com barra de uso.
- Na importação dá para usar a primeira parte do arquivo como o prompt principal do agente (o anterior fica guardado em settings: prompt_antigo_<agente>). Importar de novo atualiza os documentos de mesmo título, sem duplicar.
- Funciona no modo chat e no modo API (o material vai no pedido do agente).

## Build .83 — Base de conhecimento dentro dos agentes de copy

- A base do pacote saiu da tela Conhecimento (que fica só para as marcas) e foi para dentro dos agentes: Configurações → Agentes → Roteirista e Revisor de Copy mostram "Base de conhecimento deste agente", com os manuais que cada um recebe ("sempre" ou "conforme a peça"), para ler, editar e restaurar, e o botão para importar o pacote.

## Build .81 — Importar o pacote do Roteirista pelo painel

- Configurações → Agentes mostra o cartão "Pacote do Roteirista" (Ativo / Incompleto). "Importar pacote (.md)" lê o arquivo pacote-roteirista-sim.md e: grava os prompts e os 18 manuais em conhecimento/, coloca o prompt do Roteirista (P01) no agente de copy e o prompt do Revisor (P03) no Revisor de Copy (cria o agente se ele não existir), e recarrega os manuais. Os prompts anteriores ficam guardados (prompt_rot_antigo e prompt_revcopy_antigo). Importar de novo atualiza sem duplicar; manual que você editou no painel é preservado.
- Se a pasta conhecimento/ não foi copiada na atualização, o cartão avisa o que falta.

## Build .80 — Carrossel de verdade no editor de arte e timeline de vídeo fluida

**Carrossel**
- Em "Criar arte", ao escolher Carrossel (ou Stories) aparece a quantidade de páginas (2 a 10). O editor em branco já abre com capa, páginas de conteúdo numeradas e a última com a chamada. No "Pedir ao Designer", a quantidade vai junto no pedido.
- Abriu um carrossel com uma página só? O editor pergunta quantas páginas ele deve ter.
- Faixa de páginas nova: miniaturas numeradas, arrastar para reordenar, "+" entre páginas para inserir, duplicar e apagar ao passar o mouse, botão "Quantidade" (cria repetindo a estrutura do meio; ao reduzir, a última página fica), PageUp/PageDown para trocar de página, e "Post / Carrossel" para transformar um post de feed em carrossel (ou "Nova página" no post, que já converte).
- Salvar guarda o formato novo da arte.

**Timeline de vídeo**
- A prévia não recarrega mais o motor a cada mudança: remonta as cenas no mesmo quadro (de ~1 s para ~0,1 s por edição).
- Arrastar texto, elemento ou a borda da cena na linha do tempo atualiza a prévia ao vivo.
- Arrastar em qualquer espaço vazio da linha do tempo move o cursor (como no CapCut). Botão "Ajustar" encaixa o vídeo inteiro na largura; ao abrir, já encaixa.
- Atalhos: J volta 1 s, K pausa, L toca, Home e End, S divide, Espaço toca/pausa.

## Build .79 — Vídeo com voz e editor de arte

- Vídeo com voz: o motor chama as etapas (voz, trilha, render) com o mesmo Node do painel, sem depender do "node" no PATH do Windows. Junto com a correção do EPERM (.78), o "Final com voz" não para mais ao salvar. Teste completo aqui: voz sincronizada + trilha + MP4 com áudio.
- Layouts sem cópias: salvar (ou aprovar com "salvar como layout") com o mesmo nome, marca e formato atualiza o layout existente. Na primeira inicialização, as cópias repetidas antigas são limpas (fica a mais recente).
- Editor de arte: Ctrl+C / Ctrl+V copia elementos (também para outro slide), Ctrl+[ e Ctrl+] mudam a camada, Shift+arrastar move em linha reta, e a barra de dicas mostra os atalhos.

## Build .78 — Correções do "Gerar o vídeo"

- Objetos 3D pedidos pelo Editor ("img" com "gen") não são mais removidos: no modo final são gerados; nas prévias aparecem como um orbe no mesmo lugar. Só uma imagem sem arquivo nenhum é tirada, com aviso dizendo a cena (e o aviso não se repete).
- A janela "Gerar o vídeo" não mostra mais "null".
- Windows (EPERM ao trocar o vídeo): o painel solta o vídeo que está tocando antes de gerar outro, fecha a leitura do arquivo quando o player para, e na hora de salvar tenta de novo por alguns segundos, apaga o antigo e copia se preciso. Se ainda assim o Windows travar, aparece a mensagem para fechar o vídeo e gerar de novo, sem derrubar nada.

## Build .77 — Edição livre, memória automática e telas reorganizadas

**Editor de arte livre (estilo Canva)**
- Sem limite de tamanho dos elementos: imagem até 30.000 px, letra até 3.000 px, formas até 30x a página. Dá para dar zoom em um elemento e deixar parte dele fora da arte (o que passa da borda é cortado no PNG, como no Canva). Posição livre, inclusive fora da página.
- Alças nos quatro cantos (aumenta mantendo a proporção, a partir do canto oposto), alças laterais para largura do texto e da forma, alça de giro (Shift gira de 15 em 15 graus).
- Seleção múltipla: Shift+clique, arrastar no fundo para selecionar por área, Ctrl+A. Mover tudo junto, alinhar entre si, alinhar à página, distribuir.
- Ímã de alinhamento: gruda nas bordas e no centro da página e dos outros elementos, com linhas-guia. Botão "Ímã" liga e desliga; segurar Alt ignora na hora.
- Painel "Posição e tamanho": X, Y, largura, altura e giro em números, opacidade, alinhar à página, "Cobrir a página" e "Espelhar".
- Até 30 textos, 30 imagens e 30 formas por slide.

**Editor de vídeo (timeline estilo CapCut)**
- Clique na faixa de cenas leva o cursor para o ponto clicado; Dividir no cursor (S), Duplicar e Excluir cena ao lado do play. Bordas das cenas e dos elementos continuam arrastáveis para mudar duração, entrada e saída.
- Elementos sem limite de tamanho (até 20.000 px) e posição livre.

**Memória automática no Cérebro**
- Todo pedido de ajuste que você faz (peça do pipeline, Estúdio de arte, Estúdio de vídeo, vídeo reprovado com "refazer") fica guardado na peça. Quando você aprova o resultado, o Cérebro grava na hora uma regra ativa para o agente ("o dono pediu X e aprovou o resultado: já entregue assim"), com o que mudou entre a versão antes do pedido e a aprovada. Pedido repetido reforça a regra em vez de duplicar.

**Telas**
- Agentes agora fica dentro de Configurações (seção Agentes).
- O Gerente fica no Escritório, num painel lateral com abas Conversa, Ações e Equipe. O que você está digitando não se perde quando o escritório se atualiza.

## Build .76 — Editor de artes estilo Canva e vídeo estilo CapCut

- **Biblioteca lateral** (botão "Biblioteca" na arte, "Mídia" no vídeo): abas por tipo, busca, envio do computador (também arrastando arquivos para a área). Clique em "Adicionar" ou arraste a imagem direto para a posição desejada na tela. "Fundo" troca o fundo do slide/cena. Arrastar um arquivo do computador para a tela também envia e já coloca no lugar.
- **Mover sem gastar IA**: toda posição, tamanho, texto, cor e ordem se ajusta direto na tela. Barra flutuante sobre o elemento (editar texto, centralizar, frente, trás, duplicar, excluir), dois cliques no texto edita no lugar, guias inteligentes que "grudam" no centro da arte e no alinhamento dos outros elementos, botões Centro H e Centro V no painel.
- **Vídeo**: botão "Dividir no cursor" (ou tecla S) corta a cena no ponto do cursor em duas, distribuindo textos, elementos e narração; Ctrl+Z desfaz.
- Tudo o que você ajusta continua alimentando o aprendizado (com a lista de aprovação que permite desmarcar o que não deve ensinar).

## Build .75 — Roteirista novo, Revisor de Copy e ilha de edição melhor

**Pacote do Roteirista (pacote-roteirista-sim.md)**
- O prompt do Roteirista foi substituído pelo do pacote. O anterior fica guardado em Configurações (`prompt_rot_antigo`).
- Os 18 manuais (M00–M17) ficam em `conhecimento/manuais/` e são carregados a cada pedido conforme o formato, o tipo e o objetivo da peça, junto com o arquivo `capacidades-atuais.md` (o que o painel realmente consegue produzir). Em Conhecimento, o botão "Abrir manuais" (nos agentes Roteirista e Revisor de Copy) permite ler, editar e restaurar cada manual.
- O Pesquisador de Pautas do pacote ficou só como documento de referência (`conhecimento/02-prompt-pesquisador.md`); não foi criado como agente.

**Revisor de Copy (novo agente)**
- Entra depois do Roteirista: devolve laudo com VEREDITO (aprovada, ajustes ou refazer) e NOTA 0–5. Em ajustes ou refazer, a peça volta ao Roteirista com as correções, até o limite de revisões automáticas. Depois segue para o Revisor geral, que recebe o laudo.
- Liga e desliga em Configurações ("Revisão da copy"). Aparece no escritório, no pipeline, no Cérebro e na aba Revisão da peça ("Laudo da copy"). Funciona no modo chat (você cola o laudo) e no modo API.

**Ilha de edição de vídeo (mais intuitiva)**
- Barra flutuante sobre o item selecionado: editar texto, menor, maior, duplicar, excluir.
- Dois cliques em um texto abrem a edição direto na prévia (Enter aplica, Esc cancela).
- Botão para recolher a linha do tempo e ampliar a prévia (a escolha é lembrada); dicas de uso sempre visíveis.

**Aprendizado**
- Ao aprovar vídeo ou arte, o painel mostra a lista do que você mudou, com caixinhas. Desmarque o que foi ajuste só daquela peça: não vira aprendizado. A regra continua só nascendo quando o mesmo ajuste se repete em 2 ou mais peças.

## Build .74 — Ilha de edição de vídeo
- **Estilo VSL**: o antigo "Hard copy" agora se chama **VSL** em todo o painel (o id interno continua `hardcopy`, nada quebra).
- **Ilha de edição**: no Estúdio de vídeo (e na aba Vídeo das peças), o botão "Abrir ilha de edição" abre um editor em tela cheia com a **prévia real do motor** no centro, **linha do tempo** embaixo e painel de propriedades à direita.
- **Na prévia**: clique num texto ou elemento para selecionar, arraste para mover, use a alça no canto para mudar o tamanho. Reproduza com o botão ou a barra de espaço (a trilha e a voz só entram quando você gera o vídeo).
- **Linha do tempo**: faixas de Cenas, Textos, Elementos, Narração e Trilha. Arraste a borda direita da cena para mudar a duração, arraste a cena para reordenar, arraste o texto ou elemento para mudar quando entra, e a borda direita do elemento para escolher quando sai. Clique na régua para ir a qualquer instante. Zoom ajustável.
- **Editar**: texto (com `|` para quebrar linha e `*palavra*` para destaque), tamanho, alinhamento, posição, animação, imagens trocadas pela Biblioteca (com envio do computador), fundo da cena (foto ou vídeo), tema, transição, decoração, câmera, narração, cartões, palavras em degradê, círculo/anel/orbe/gráfico/figura, cor de destaque, look, trilha e voz gravada. Adicionar, duplicar, remover e reordenar cenas e elementos. Desfazer/refazer (Ctrl+Z/Ctrl+Y), Ctrl+S salva.
- **Gerar vídeo** direto da ilha (prévia, rápido, sem áudio, final sem voz, final com voz) e **Pedir ao Editor** (vídeos do Estúdio) a partir da sua versão editada.
- **Aprovar e ensinar**: o painel compara a versão do Editor com a sua (duração, textos, elementos, fundo, transições, cenas, look…), guarda cada ajuste, o vídeo vira molde aprovado e o mesmo ajuste repetido em 2 vídeos da marca vira regra em teste para o Editor (aparece no Cérebro).
- Atualizar: substitua `server.js`, `public/`, `motor/` e `README.md` e reinicie.

## Build 2026-10-26.102
- **Logo nova** (Agentes Grupo SIM) no login, na lateral (só o "S") e no ícone da aba; fundo preto removido.
- **Editor de arte, Fase 1 (estilo Canva)**: formas (triângulo, losango, hexágono, seta), degradê, travar/ocultar camada, sublinhado/riscado, recorte da imagem em formas, copiar/colar estilo.
- **Vários estilos por marca, por tema** (carrossel, notícia, oferta…): o agente detecta o tema do conteúdo e escolhe o estilo; novo estilo "Notícia".
- **Correção de permissão**: usuário só de pipeline não lê mais a Base de conhecimento.
- Varredura de erros em todas as telas: sem erro de JS/console.

## Build 2026-10-26.103
- **Editor de arte, Fase 2**: agrupar elementos (Ctrl+G, desagrupar Ctrl+Shift+G; o grupo seleciona e move junto), texto curvo (arco para cima ou para baixo), menu do botão direito, zoom (botões, teclas + - 0, Ctrl+roda), réguas e guias (arraste da régua; leve a guia para fora da página para apagar; as guias ficam salvas neste navegador por arte).
- **Editor de arte, Fase 3**: filtros da imagem (brilho, contraste, saturação, matiz, preto e branco, sépia), paleta da marca, cores recentes e conta-gotas em todos os seletores de cor (o conta-gotas depende do navegador: Chrome e Edge têm).
- **Gerente**: ao montar uma arte, entende o tema da frase ("carrossel de notícia", oferta, tutorial, lista…) e usa o estilo que a marca ajustou para esse tema.
- **Configurações › Biblioteca Central**: deixa claro que a Central é opcional e mostra o acervo do próprio painel (imagens, vídeos e áudios guardados dentro do sistema, usados pelo editor de arte e pelo de vídeo).
- Correção: depois de agrupar ou selecionar vários elementos, criar um elemento novo mantinha o painel de seleção múltipla.
- Testes: o teste antigo do editor foi atualizado para não depender de banco de testes vazio.

## Build .104 — Editor de Vídeo aprende os estilos Motion M1 a M5

- Cinco estilos novos na galeria de "Estilos de vídeo motion": M1 Agência Vermelho, M2 Densidade Cinética, M3 Documentário Premium, M4 Diorama de Papel Teatral e M5 Storytelling Retrô CRT (`motor/estilos-motion.mjs`). Cada um tem receita no vocabulário do motor (look, decoração, transições, ritmo, checklist) e um spec de exemplo. O herói de cada cena vem da biblioteca Motion (img pelo nome exato); orb/ring/chart são só reserva.
- O agente Editor recebeu o prompt de estilos M1 a M5 e as regras universais, mais 12 itens em "Aprendizados" e 9 em "Evitar". É uma migração única que só acrescenta (nada do que já existia é apagado); o texto antigo fica guardado em `regras_antigas_editor_motion_v2`.
- Base de conhecimento do Editor (`conhecimento/agentes/editor/06` a `12`): DNA comum e checklist (sempre), referências/áudio/efeitos/fluxo (auto) e um documento por estilo (auto, entra quando o pedido cita o estilo).
- Correção no motor: o texto dos itens do card ficava branco sobre card branco nos looks Minimalista e Impacto; agora herda a cor do card.
- Limites: o motor é sempre 30 fps (o 15 fps do M4 não é possível); campos ★ do arquivo de aprendizado ainda não existem no motor; o Hard copy segue sem referência.

## Build .105 — Mascote reconhecido pelos agentes

- O catálogo de arquivos que os agentes recebem ganhou o bloco "MASCOTE OFICIAL DA MARCA" (arquivos de tipo Mascote, com as poses). Os agentes só usam esses arquivos como personagem; sem mascote cadastrado, avisam na entrega em vez de inventar.
- Upload: Conhecimento > Arquivos, com o tipo "Mascote / personagem". Como usar (quando, posição, tamanho): ficha Mascote na Identidade da marca.
- (.105) Botão "Enviar mascote" na Biblioteca de mídia e aviso com o mesmo botão em Conhecimento > Arquivos quando a marca não tem mascote; o tipo do arquivo agora se chama "MASCOTE da marca (personagem oficial)" e já vem selecionado.

## Build .106 — Imagens da arte na aba "Arte" da peça

- A aba "Arte" da peça mostrava só o texto da direção de arte. Agora mostra no topo as imagens prontas (miniaturas, "Ver em tamanho grande", download de cada slide e ZIP, "Editar no estúdio", "Recompor") e o aviso do motor quando a imagem não saiu, mesmo com a peça ainda em produção. O mesmo cartão continua na aba "Entrega".

## Build .107 — Ajuste que aparece, caixa dos textos e templates seguidos

- Causa do "ajuste feito mas não aparece": os títulos da arte eram forçados em CAIXA ALTA e não havia como o Designer (nem você) mudar isso; o pedido de ajuste de caixa era aplicado e nada mudava na imagem.
- Nova regra: por padrão os títulos saem COMO FORAM ESCRITOS. Rótulos e botões continuam em caixa alta, salvo escolha em contrário.
- Editor de imagem: em "Efeitos do texto" há "Maiúsculas e minúsculas" (padrão do modelo, como foi escrito, MAIÚSCULAS, minúsculas, Primeira letra maiúscula, Cada Palavra Maiúscula) e o botão "Aplicar a todos os títulos" (carrossel inteiro).
- Marca > Tipografia: caixa do título, do botão e do rótulo valem para toda arte da marca.
- Designer: pode pôr "caixa_titulo", "caixa_rotulo" e "caixa_botao" em "dados" de cada página; o painel respeita e mede o texto com essa caixa.
- Imagens da arte usam a data do arquivo como versão: depois de um ajuste a imagem nova aparece sem cache antigo.
- Templates: quando o Designer não escolhe template, vale o estilo salvo que combina com o tema do roteiro (ou o padrão da marca), em vez de só o padrão.
- Testado: pedido > roteiro > revisão > arte > ajuste > arte nova (carrossel); vídeo vertical > ajuste do Editor; 15 estilos/formatos da galeria; editor pela tela (5 caixas e aplicar a todos); varredura de todas as telas sem erro.

## Build .108 — Narrativa de carrossel (Copy e Revisor)

- Nova base do Roteirista: "Narrativa de carrossel que prende e entrega". Sequência fixa gancho, contexto, entrega de valor, CTA; número de slides livre; título só quando merece; gancho com tensão, especificidade, consequência e promessa paga; continuidade (teste da cadeia e do embaralhar); CTA único nascido da entrega; ética (agressivo nunca é falso). Inclui a engenharia reversa do exemplo reprovado e uma reescrita modelo.
- Nova base do Revisor de Copy: checklist de narrativa (gancho, sequência, continuidade, valor, títulos, CTA, linguagem) que gera "ajustes" quando a história não existe.
- Regras novas em Aprendizados e Evitar do Roteirista e do Revisor (aplicadas uma vez; as antigas ficam guardadas).
- Formato de entrega: `Título:` passou a ser opcional nas páginas do meio.
- Arte: página só com "Texto:" vira destaque (primeira frase) e apoio, em vez de ficar com o nome da página; capa com faixas sem foto passa para a capa minimalista com o título inteiro; a capa minimalista passou a mostrar o subtexto.

## Build .109 — Estúdio de arte mais fácil (fontes e remover fundo)
- **41 fontes** no editor (eram 9), agrupadas por categoria: Condensadas e impacto, Sem serifa, Tecnológicas e mono, Serifadas, Manuscritas e divertidas. Todas ficam embutidas em `public/fonts/` (funcionam sem internet) e têm medidas próprias, então o texto quebra e centraliza certo. O Designer também pode usá-las pelo nome.
- **Remover fundo**: no painel de uma imagem, o botão "Remover fundo" recorta o assunto por IA (BiRefNet no fal.ai, ~US$ 0,003) e salva uma cópia `nome-sem-fundo` na biblioteca da marca; a original continua intacta. Precisa de `FAL_KEY` no `.env`.

## Build .110 — Estúdio de arte estilo Canva
- **Painel "Elementos"** no editor (botão na barra da esquerda), com cinco abas:
  - **Ícones**: 401 desenhos com busca em português ("dinheiro", "seta", "casa") e filtro por categoria. Entram na cor de destaque da arte. Os desenhos novos vêm do Lucide (licença ISC, `public/LICENSE-LUCIDE.txt`).
  - **Formas**: 22 opções (retângulo, círculo, pílula, anel, triângulo, losango, pentágono, hexágono, octógono, estrela, selo serrilhado, cruz, seta, chevron, paralelogramo, trapézio, balão de fala, faixa, etiqueta, linha contínua, tracejada e pontilhada).
  - **Selos**: 14 grupos prontos (botão, etiqueta NOVO, selo de desconto, círculo numerado, balão, faixa, etiqueta de preço, cartão com ícone, citação, marca-texto, divisores, seta com legenda). Já vêm nas cores da arte e agrupados.
  - **Texto**: 12 estilos (impactante, elegante, manuscrito, neon, contorno, retrô, sublinhado...) e 6 duplas de fontes que combinam.
  - **Cores**: cores principais, 9 paletas prontas (aplicam em todos os slides) e todas as cores usadas na arte: clicar numa troca em todos os slides de uma vez.
- Tudo pode ser **arrastado** para o lugar certo do slide ou adicionado com um clique.
- **Filtros no fundo**: brilho, contraste, saturação, matiz, preto e branco, sépia e 8 filtros prontos (Vívido, Suave, Dramático, Vintage, Frio, Quente...), também para a imagem de fundo do slide.
- **Galeria de estilos**: passar o mouse sobre um estilo mostra as páginas do carrossel em sequência.
- Linha com estilo (contínua, tracejada, pontilhada) no painel da forma; novos nomes de forma na lista "Tipo".

## Build .111 — Banco de elementos 3D
- Nova aba **3D** no painel "Elementos" do editor de arte: 1.431 elementos 3D com fundo transparente (foguete, troféu, dinheiro, lâmpada, mãos, rostos, comida, animais, viagem...), nomes em português, 9 categorias e busca. Clique ou arraste para o slide.
- A origem é o **Fluent Emoji 3D da Microsoft** (licença MIT, uso comercial liberado; `banco3d/LICENSE-FLUENT.txt`). As peças ficam em um arquivo só (`banco3d/pack.bin`, ~21 MB, mais o índice `banco3d/index.json`) e funcionam sem internet.
- A peça só vira imagem da marca quando é usada (nome `3d-<peça>`, no tipo "outro"), então a Biblioteca não enche de itens. Usar de novo a mesma peça reaproveita a imagem.
- Não aparece no catálogo de mascotes que o Designer usa (tipo "outro").

## Build .112 — Artes sem erro de diagramação (todas as marcas)
- **Causa dos textos em Arial e fora do lugar**: faltavam no PC as fontes principais (Poppins, Inter, Montserrat, Anton, Bebas, Oswald, Sora, Orbitron, Archivo) em `public/fonts/`. Agora o painel **confere as fontes ao iniciar e antes de cada render e baixa sozinho** o que faltar (Fontsource, licença OFL). Se não conseguir, avisa na nota da arte.
- **Texto nunca mais invade a foto**: nas páginas com foto em cartão ou objeto, o motor mede o espaço e encolhe primeiro o apoio, depois o cartão e só por último o título. O bloco desce um pouco quando sobra espaço.
- **Rede de segurança no render**: depois de desenhar, o motor mede o texto com a fonte real; se passar da margem ou encostar numa foto, reduz o tamanho e refaz (aparece em "checagens" da peça).
- **Lista numerada vira lista**: "1. Para quem? ... 2. Qual problema? ..." sai como lista com título em negrito e explicação, não como parágrafo.
- **Copy toda em MAIÚSCULAS** (título, apoio, texto) vira frase normal, a menos que a marca peça caixa alta.
- **Imagens por IA sem texto escrito**: códigos de cor (#0DE450) viram o nome da cor, e pedidos de letreiro, placa ou texto escrito saem do prompt antes de gerar (era o que fazia aparecer "#0DE450" e "PLATEIA" dentro das fotos).
- **Designer**: novas regras de qualidade (imagem tem que explicar a página, ritmo de imagens, limites de tamanho, lista usa o modelo lista, sem caixa alta).
- **Templates**: ficam o **Carrossel base** e o de **Notícia** (mais post único e stories); os outros da casa foram escondidos. Os seus próprios templates continuam funcionando.
- Capa com faixas sem imagem ganha um ladrilho 3D em vez de ficar vazia.

## Build .113 — editor de arte mais fluido
- Arrastar a lateral de uma caixa de texto agora **reflowa as linhas** (quebra automática, como no Canva); a escolha aparece no painel como "Quebra automática de linha".
- `.env.example` com as chaves dos bancos de imagem (PIXABAY_API_KEY, UNSPLASH_ACCESS_KEY, PEXELS_API_KEY).

## Build .114 — barra de formatação flutuante
- Ao selecionar um texto aparece sobre ele a barra: tamanho (−/+/campo), negrito, alinhamento, cor e quebra automática. Tudo aplica ao vivo e desfaz com Ctrl+Z.
- Mudar o alinhamento mantém a caixa no mesmo lugar (como no Canva).

## Build .115 — barra de formatação no editor de vídeo
- Ao selecionar um texto no quadro do vídeo aparece a barra: tamanho (−/+/campo), alinhamento e texto escuro/claro, aplicados ao vivo.

## Build .116 — responsividade dos editores
- Arte e vídeo se adaptam a telas menores: barra superior em uma linha rolável, área de edição maior no celular/tablet, painel abaixo, dicas escondidas em telas médias, painel lateral mais estreito em 1100px.
- Barras flutuantes quebram linha em vez de sair da tela; arrastar no quadro funciona com o dedo (touch).

## Build .117 — lote de teste das marcas e correções de diagramação
- Teste com 5 paletas de marca × 8 modelos de página (capa, revista, texto, lista, número, frase, CTA) para achar defeitos antes de você.
- `capa-faixa`: título corrido (sem `|`) saía minúsculo; agora vira faixas em até 4 linhas + última palavra gigante.
- Quebras `|` do Designer que forçam letra pequena são refeitas pela largura quando isso dá uma letra bem maior.
- `frase` sem `titulo` derrubava a composição: agora aceita `texto` e nunca quebra com texto vazio.
- Marca de papel claro: as capas (herói, faixas, revista) usam fundo escuro da cor da marca com tinta branca.

## Build .118 — biblioteca com pastas e mascote reconhecido
- **Pastas**: envie uma pasta inteira (botão ou arrastando) e as subpastas viram pastas da biblioteca (`Mascote/poses`, `Elementos/3D`...). Filtro por pasta, badge no cartão e campo "Pasta" ao editar.
- **Tipo automático**: ao enviar sem escolher o tipo, o sistema reconhece pelo nome da pasta e do arquivo: mascote/pose/personagem, logo, fundo, textura, elemento/3D/ícone. Antes tudo virava "foto" e o mascote não era reconhecido pelos agentes.
- **Reconhecer mascotes e logos pelo nome**: botão que reclassifica o que já estava na biblioteca.
- **Catálogo dos agentes**: ganha o MAPA DE PASTAS (o que há em cada pasta) e a pasta de cada arquivo. Botão "Ver o que os agentes enxergam" mostra o texto exato por marca.
- Configurações: explica a diferença entre a sua biblioteca e a Biblioteca Central e orienta as chaves Pixabay/Unsplash (Pexels pausado).

## Build .119 — marca apagada some de vez
- Apagar uma marca agora remove tudo dela (conhecimento, biblioteca e arquivos, poses, estilos, layouts, edições, regras do cérebro, moldes, templates, vínculos de produto). Os conteúdos já produzidos ficam, só sem marca.
- A migração antiga que recriava marcas a partir de textos "MARCA: X" roda uma única vez e só em instalação sem nenhuma marca; por isso a marca apagada não volta ao reiniciar.
- Se uma marca apagada reaparecer uma última vez após atualizar, apague de novo: agora é definitivo.

## Build .120 — Identidade visual por prompt
- Na tela "Identidade visual" há o bloco "Preencher tudo com um prompt": copia um prompt pronto (com todos os campos), você cola numa conversa do Claude com um post da marca, a logo e as fontes, e cola a resposta (JSON) de volta. "Aplicar resposta" preenche os campos (por padrão não sobrescreve o que já existe) e você revisa e salva.

## Build .121 — Prompt para cada tipo de conhecimento
- Em "Adicionar conhecimento" há o botão "Copiar prompt para o Claude": gera o prompt do assunto escolhido (descrição, tom de voz, produtos, histórias, exemplos, outros). A resposta do Claude é colada direto no campo Conteúdo.

## Build .122/.123 — Camadas estilo Figma no estúdio de arte
- **Painel Camadas** (topo do painel direito, sempre visível): lista tudo do slide da frente para trás, com miniatura, nome, posição (topo/meio/base, esquerda/centro/direita) e tamanho. Cada elemento tem olho, cadeado, trazer para frente e enviar para trás; dá para arrastar a linha para reordenar. Clicar numa linha seleciona o elemento na arte.
- **Ordem real**: campo opcional `z` em textos, imagens e formas. Sem `z`, vale a faixa padrão de cada família (idêntica à ordem antiga: conferido em 40 artes, zero diferença de pixel). Ao reordenar, o painel renumera o `z` respeitando os efeitos fixos.
- **Efeitos viram camadas editáveis**: Fundo, Escurecimento, Brilhos, Tinta, Vinheta, Degradê de leitura, Granulado e Textura. Clique na linha para editar; "+ Efeito" acrescenta.
- **Fundo**: Cor, **Degradê** (reto ou circular, 2 a 4 cores, ângulo/centro/tamanho, presets da marca), Imagem ou Por IA. `bg.grad = {tipo, ang, cores[], x, y, r}`.
- **Aprendizado**: o diff da arte agora registra troca para degradê, mudança de cores do degradê, efeitos acrescentados/tirados (repetidos em 2+ peças viram regra) e mudança de ordem das camadas.
- (histórico) FigCraft entrou primeiro como ferramenta extra; a partir do build .125 ele é o editor do Estúdio de arte.

## Build .135 — o mascote vem sempre do banco de imagens

- Se o pedido de imagem descreve um mascote, personagem ou avatar ("mascot", "mascote", "personagem", "character", "avatar", "cartoon"…) e a marca tem mascote cadastrado, o painel usa o arquivo cadastrado em vez de gerar um parecido por IA, e avisa na nota da arte.
- O guia do Designer agora diz: mascote é o arquivo, pelo nome exato; nunca descrever personagem nem pedir pose nova.

## Build .134 — o mascote não é mais redesenhado por IA

- Investigação: as imagens "da internet" eram geradas pelo fal.ai (FLUX), não buscadas: fundos (`fundo`), objetos 3D (`objeto`), recortes (`recorte`) e **poses do mascote** (`pose`, modelo kontext). Nenhuma arte usou foto de banco (Pixabay/Unsplash).
- Causas: (1) com FAL_KEY e fundos por IA ligados, todo mascote único recebia "(pose: …)" e era redesenhado; quando o roteiro só citava o arquivo ("Mascote: mascote-marketing-raiz"), o nome do arquivo virava a "descrição da pose"; (2) o "Visual" do roteiro, com instruções de diagramação ("Título em caixa alta, faixa branca, recortado no lado esquerdo"), ia inteiro como prompt do cenário de fundo.
- Agora: pose nova por IA só roda se "Máximo de poses novas do mascote" for maior que 0 (padrão e migração única: 0, mascote sempre o arquivo cadastrado); nome de arquivo no roteiro usa o arquivo como está; só frases de cenário vão para o gerador (sem título/caixa alta/faixa/recorte/pose).

## Build .133 — editor de arte mais intuitivo e layouts que o Designer enxerga

- **Painel lateral em 3 abas** (como Illustrator/Photoshop/CorelDRAW: painel por contexto): **Elemento** (propriedades do que está selecionado; abre sozinha ao clicar em algo), **Camadas** (lista completa, com ordem, esconder, travar) e **Página** (modelo da página, cores da arte e verificação). Nada selecionado = dica de que tudo é editável.
- Propriedades do texto em grupos que abrem e fecham (Tamanho e alinhamento, Cor, Caixa e forma, Efeitos, Ícone e seta). "Função do texto" agora inclui Rótulo e Rodapé.
- **Modelo da página**: lista de cartões (nome + quando usar) no lugar de uma caixa de seleção cortada.
- **Tudo é editável**: o ícone/seta que mora dentro de um texto (rodapé "Arraste para o lado", botões, contatos) pode ser trocado, mudar de lado, ganhar cor/fundo redondo e **soltar como elemento livre** (mover, redimensionar, apagar). A seta do botão também.
- A barra flutuante do texto não sai mais da tela.
- **Layouts**: ao salvar (e em Editar), "Quando usar" e "Tema". O Designer recebe o catálogo de TODOS os layouts da marca e o JSON completo dos 3 que mais combinam com a peça (tema + palavras do roteiro).
- **Estilo da arte ao criar o pedido**: em carrossel/feed/stories dá para fixar um estilo (notícia, educativo…) ou um layout da marca; o Designer e a composição automática obedecem. Padrão continua automático.
- Banco: `art_layouts.uso/tema`, `contents.estilo_arte` (migração automática).

## Build .131 — apagar os estilos originais

- Os estilos da casa (Post herói, Stories sequência, Mitos, Notícia…) agora têm "Apagar": somem da galeria e do Designer (e o ajuste do dono neles também). Em "Estilos originais apagados", no fim da galeria, "trazer de volta". Tabela `art_hidden`; rotas `POST /api/art-templates/:id/(apagar|voltar)`.

## Build .130 — volta o editor clássico do Estúdio de arte

- O FigCraft foi removido por inteiro (editor, ponte, fontes TTF, rota de camadas). O **Estúdio de arte clássico** é o único editor: Artes, Layouts, estilos e a gaveta do conteúdo abrem ele.
- Mantido do trabalho anterior: o PNG desenha o degradê de fundo (`bg.grad`); "Salvar estilo" guarda a arte inteira por marca e formato (vitrine e "Editar" mostram exatamente isso); conferência de estrutura antes de salvar; sem duplicar "Arraste para o lado".
- Editando um estilo, só existe "Salvar estilo" (sem "Salvar rascunho") e o aviso mostra o resumo do que foi guardado.
- Apagar à mão da pasta do painel (se existirem): `public/figcraft`, `public/fonts-ttf`, `public/arte-figcraft.js`, `motor/camadas.mjs`.
- Os textos abaixo (.124 a .129) que citam FigCraft são históricos.

## Build .129 — vitrine e editor mostram a mesma arte

- Corrigido: o PNG ignorava o degradê de fundo (`bg.grad`) que o editor mostrava; por isso a vitrine saía com a cor errada. Agora o motor desenha o degradê.
- "Salvar estilo" guarda também a arte inteira como ficou (por marca e formato): a vitrine e o "Editar" mostram exatamente isso, sem recompor. O que muda para conteúdos novos continua sendo guardado como diferenças.
- Antes de salvar, o painel confere a estrutura (páginas e modelos). Se mudou, mostra antes/depois e pede confirmação; página criada do zero sem modelo bloqueia o salvamento com explicação.
- O FigCraft pode ter outras páginas (botão +): a arte continua sendo a página onde foi montada, e nada se perde ao salvar.
- A vitrine é redesenhada na troca de build (as prévias antigas são descartadas).

## Build .127 — salvar estilo de verdade e biblioteca de templates dentro do editor

- Editando um estilo, só existe "Salvar estilo" (o "Salvar rascunho" gravava numa arte temporária que se perdia ao reabrir). Ctrl+S também salva o estilo. Ao salvar, aparece a lista do que foi guardado (por página: cor, posição, tamanho, fundo, efeitos) ou o aviso de que nada foi guardado.
- "Puxar template" no painel lateral do FigCraft: lista todos os templates do formato (da casa e seus, com o ajuste da marca) e traz as páginas para o editor para trocar elementos e salvar de novo.
- Corrigido o "Arraste para o lado" que duplicava a cada salvamento de estilo.
- Limites conhecidos: cor só de uma palavra destacada dentro de um texto e cor de forma especial (imagem) ainda não são lidas do FigCraft.

## Build .136 — Ficha técnica do mascote
- Nova seção **Ficha técnica do mascote** no modal do arquivo (tipo "mascote", PNG/JPG/WebP): nome, resumo, corpo/proporções, rosto, pele/cabelo, roupa, acessórios, cores (hex), estilo de arte, personalidade, poses permitidas, **NUNCA fazer**, quando usar, observações.
- Guardada dentro do JSON `assets.ficha` (chave `mascote`; sem migração) e preservada quando a ficha comum é salva ou reanalisada.
- API: `GET/PUT /api/assets/:id/mascote`, `POST /api/assets/:id/mascote/ia` (a IA olha a imagem e preenche só os campos vazios; o que o dono escreveu nunca é sobrescrito).
- Uso: catálogo de arquivos do Designer/Editor (linha "FICHA TÉCNICA DO MASCOTE … siga à risca") e prompt do `falPose` (gerador de poses respeita a ficha).

## Build .137 — Escritório
- Tentativa de prédio de vidro com elevador foi descartada a pedido do dono; o Escritório 3D isométrico original foi mantido. A ideia fica para melhorar depois.

## Build .138 — Estilos pertencem a uma marca
- Cada estilo do dono tem UMA marca dona (`art_templates.brand`). A galeria de uma marca mostra só os estilos dela, mais os da casa e da Biblioteca Central. "Sem marca" mostra todos, com a marca dona no selo. O Designer (`templatesDaMarca`, `escolheEstilo`, `templatesBloco`) também só enxerga os estilos da marca da peça.
- Editar um estilo da casa (ou de outra marca) no editor cria uma cópia só da marca da arte (`deriva` guarda o original); o original da casa continua intacto para as outras marcas e volta com "Restaurar original" / apagando a cópia. Salvar de novo reaproveita a mesma cópia; o padrão da marca acompanha.
- "Novo estilo → Começar de → Copiar de outra marca": a cópia vira da marca atual, com o visual da outra marca (sem as artes prontas dela) para ajustar no editor. "Duplicar" também cria a cópia na marca escolhida.
- Migração única (`mig_tpl_brand`): estilos já salvos viram da marca em que foram ajustados; ajustes de várias marcas viram uma cópia por marca; o original da casa volta nas outras marcas.

## Build .139 — Roteiro travado não gera mais vídeo "fantasma"
- Causa do vídeo que não saía: o roteiro travava na revisão (Revisor de Copy e Revisor gastavam as rodadas implicando com contagem de palavras) e o botão "Aprovar" de um roteiro travado marcava a peça como pronta SEM mandar o Editor produzir.
- Agora, em roteiro travado ainda sem arte/vídeo, o botão vira "Aprovar assim mesmo e produzir o vídeo/a arte" (`approve_script` aceita `blocked`); `approve` nesse estado também manda produzir.
- Gerente: ao acabar as rodadas, se a nota estiver a até 1,5 ponto do mínimo (e ≥ 5) e o risco factual não for alto, libera "com ressalvas" (registrado na atividade) em vez de travar.
- Calibragem dos dois revisores: só reprovam por problema que muda o resultado; diferença de até 15% em palavras/duração e detalhe de formatação viram melhoria opcional. O feedback ao Roteirista pede só as correções obrigatórias e texto limpo, sem notas dirigidas ao Revisor.

## Build .140 — Aplicar layout no editor (estilo Canva)
- "Layouts" no editor lista TODOS os layouts de todas as marcas (até 400), agrupados por marca: os da marca da arte primeiro, depois as outras marcas e os gerais. Só entram os do mesmo formato (mesmas dimensões).
- Ao aplicar um layout de outra marca, a logo (item da moldura ou asset com "logo" no nome) é trocada pela logo da marca da arte (clara/escura conforme a original); fundo, cores e o resto ficam para ajustar no editor. Os textos já escritos continuam nos mesmos papéis.

## Build .141 — texto-exemplo não volta mais por cima do texto novo

Causa: ao salvar um estilo, textos que o dono acrescentou no layout (ou cópias do texto de apoio de exemplo) eram guardados como "elementos acrescentados" com o texto-exemplo literal ("Uma ou duas frases curtas…", "Texto de apoio"). Em toda arte nova o painel recolocava essas cópias por cima do texto do roteiro, e o carrossel saía com texto velho + texto novo (e gastava crédito de FAL à toa).

Correção (`textoFantasma` em server.js): ao salvar (`visualDaArte`) e ao aplicar (`aplicaVisual`), texto acrescentado de papel título/texto/número/chamada/selo/botão que seja placeholder ou cópia do conteúdo de exemplo é descartado. Estilos já salvos ficam corretos sem precisar refazer. Textos fixos de verdade (rodapé, selo de marca, frase própria) continuam sendo aplicados.

## Build .142 — Standby do fal.ai

Configurações › Vídeo e voz ganhou o botão "Standby do fal.ai (pausa geral de gastos)" (setting `fal_pausa`, liga na hora, sem precisar salvar). Ligado, `falKey()` devolve vazio e NENHUMA chamada paga sai: fundos por IA, poses do mascote, recorte/remoção de fundo, tradução de prompt e objetos 3D do vídeo (o motor recebe FAL_KEY vazia). As artes saem com texto, cores, logo e o mascote cadastrado. Funciona mesmo com a FAL_KEY no .env. Mensagens de erro dizem "fal.ai em standby: nada foi cobrado".

## Build .143 — a arte gerada passa a obedecer o layout salvo

Problemas vistos na arte #361 (estilo "Templete 01 Central"): slides do meio saíam SEM título e texto, a logo era sempre a clara mesmo no fundo claro, a capa ignorava o modelo do layout e o mascote cobria o texto.
- **Texto do conteúdo nunca é apagado:** o layout pode tirar chamada/enfeites (`fora`), mas título, texto e número do conteúdo ficam sempre (`aplicaVisual`).
- **Logo por página:** `visualDaArte` guarda `pg.mold` (arquivo, tom clara/escura, posição, tamanho). Estilos antigos leem isso do snapshot salvo (`snaps`). Na mesma marca vale o arquivo exato; em outra marca vale o mesmo tom da logo daquela marca.
- **Rodapé ("Arraste…") por página:** `pg.foot` (cor, tamanho, fonte). Estilos antigos leem do snapshot.
- **Página de fundo claro:** layout com logo escura/rodapé escuro faz o texto do conteúdo usar a cor escura da marca (o que o dono ajustou explicitamente vale por cima).
- **Texto-exemplo = lugar do texto real:** o "Texto de apoio" que o dono põe no layout vira `pg.slotT` (posição e formato); o texto novo ocupa o lugar, o exemplo nunca aparece.
- **Capa:** segue o modelo da página de capa salva no layout da marca (antes só trocava entre modelos de capa; agora inclui texto/frase/número).
- **Mascote x texto:** `protegeMascote` mede as caixas de texto e a logo; se o mascote/imagem principal cobrir algo, ele é movido (e diminuído se preciso) para a área livre mais próxima, lendo a proporção do arquivo do mascote. Só age quando há sobreposição e não age na prévia do editor de estilos.

## Build .144 — agentes enxergam a arte e a copy já nasce na diagramação do estilo

- **Mascote x texto na imagem real (`motor/arte.mjs`):** depois de renderizar cada slide, o motor mede onde o mascote/imagem principal (hero) está e onde estão os textos e a logo. Se cobrir (mais de 12% de um texto), procura a maior área livre, move e diminui só se precisar, renderiza de novo e registra "o mascote cobria texto ou logo (reposicionado)" nas checagens (o Cérebro aprende com o evento). Sem espaço livre, avisa em vez de esconder. Não roda em arte editada à mão.
- **Diagramação do estilo para a copy (`estiloEstrutura` / `estiloEstruturaBloco`):** o estilo escolhido pelo dono (ou pelo painel) vira um bloco "DIAGRAMAÇÃO DO ESTILO ESCOLHIDO" enviado ao Roteirista, ao Revisor de Copy e ao Gerente: por página, papel (capa/miolo/fechamento), modelo, fundo claro/escuro, mascote e quantos caracteres cabem (ideal e máximo) em chamada, título, apoio e botão, calculados do layout real (tamanhos e larguras já com o visual salvo). O texto-exemplo do template é só marcador de lugar.
- **Layout intuitivo na galeria:** "Ver páginas" virou "layout completo": cada página com legenda do papel, modelo, caracteres que cabem, fundo e mascote. Rota `GET /api/art-templates/:id/estrutura?format=&brand=`.
- Inspeção visual por IA (Revisor olhando os PNG) continua existindo em Configurações (`visual_check`) e exige a API.

## Build .145 — estilo "Notícia de jornal" (2 páginas)

- **Dois modelos novos** em `public/arte-modelos.js`: `noticia` (capa: foto de página inteira, degradê escuro-azulado embaixo na cor da marca, selo "Notícia urgente!" em itálico, manchete em caixa alta centralizada, fio com a logo da marca no meio e "Leia a legenda") e `post-card` (contra-capa: fundo escuro de foto e cartão branco arredondado com avatar da marca, nome com selo de verificado e o texto da notícia, palavra-chave em negrito). Tudo continua editável no editor (selo, legenda, nome, foto).
- **Template da casa `noticia-jornal`** (tema Notícia, carrossel): sequência fixa `noticia` + `post-card`. Fica antes do template "Notícia / novidade do mercado" e vira o padrão do tema Notícia; o antigo continua disponível. O estilo de 2 páginas é reconhecido por `fixo2(tpl)`.
- **Comunicação entre agentes:** `estiloEstruturaBloco` avisa o Roteirista/Revisor que o estilo tem EXATAMENTE 2 páginas, com a manchete e o selo da capa e o parágrafo único do cartão (capacidade em caracteres). `compoeModelos` reduz qualquer roteiro maior para capa + contra-capa e leva os textos para os campos de cada modelo (`kicker` curto vira selo; título + texto viram o parágrafo do cartão; a foto da capa vira o fundo da contra-capa).
- `arte-slide.js`: novo `hw` (peso do destaque `*palavra*`, usado no negrito do cartão); `sanitizeArteSpec` aceita `hw`.
- Avatar: usa a logo da marca recortada em círculo quando ela é quadrada; senão, círculo na cor da marca com a inicial.

## Build .146 — voz da copy: título agressivo e linguagem acessível

- Regras novas (migração única `regras_voz_v1`, as antigas ficam guardadas em `regras_antigas_<agente>_voz_v1`) no Roteirista e no Revisor de Copy: título da capa que incomoda e abre curiosidade (erro que a pessoa comete sem saber, crença contrariada, perda concreta, segredo), "teste do dedo", 3 versões internas e entrega da mais forte que a peça paga; título passivo/de manual (Entenda, Saiba, Guia de...) reprova.
- Linguagem acessível: público leigo, palavras do dia a dia, frases curtas, sigla/termo técnico só com explicação na mesma frase; vale também para chamada, subtexto e botão. O Revisor reprova jargão e título que não incomoda, com a correção já reescrita.

## Build .147 — "Estilo da arte" da nova pauta segue a marca escolhida

- Em Nova pauta, o seletor "Estilo da arte" agora busca `GET /api/art-templates?brand=` toda vez que a marca (ou o formato) muda e mostra só o que vale para ela: grupo "Estilos de <marca>" (os da própria marca), "Estilos padrão (adaptam à marca)" (casa/Central, incluindo Notícia de jornal) e "Layouts da marca". Antes a lista vinha uma vez só, sem filtro por marca. O tema (ex.: Notícia) aparece antes do nome quando o nome não o cita.

## Build .148 — modelo "Frase de personalidade" (replicado de template do Canva) + estilos por marca

- Novo modelo `citacao` (`public/arte-modelos.js`), feito por engenharia reversa do PDF "Central do Marketing" do Canva: retrato em página inteira que escurece até o preto, fio branco com a logo da marca no centro e o @ da marca acima à direita, nome de quem disse e a frase centralizados em caixa alta (fonte negrito da marca). Campos: `nome`, `frase`, `foto`, `handle` (o @ vem dos contatos da marca). Asterisco no meio da palavra (M*RRO, censura) é preservado: vira "∗" para não ser lido como destaque.
- Estilo da casa `frase-personalidade` (feed e carrossel, página única), restrito às marcas listadas em `marcas` (hoje CENTRAL DO MARKETING): `templatesDaMarca` filtra por `t.marcas`, e na Nova pauta ele aparece no grupo "Estilos de <marca>". Para liberar para outra marca, acrescente o nome em `marcas` no template da casa.
- Copy: o bloco de diagramação diz ao Roteirista que a chamada é o nome de quem disse a frase e o título é a citação fiel, numa página só. `compoeModelos` leva kicker→nome e título→frase; estilo de uma página só nunca gera páginas de miolo.

## Build .149 — capa da 007 SpyHacker (PDF do Canva) = modelo `noticia`

- O PDF "O MAIOR GOLPE" (capa) tem a mesma estrutura do modelo `noticia` (retrato/foto de página inteira, degradê escuro, selo "Notícia urgente!", manchete em caixa alta, fio com a marca e "Leia a legenda"). Só foi ajustado o selo (Poppins negrito itálico, menor), como no Canva. O estilo "Notícia de jornal (2 páginas)" já serve à 007 SpyHacker, com a logo, as cores e a fonte dela.

## Build .150 — modelo `manchete-foto` (Seguidores em Alta e Vivendo de Bet, PDFs do Canva)

- Novo modelo `manchete-foto`: foto em página inteira que escurece embaixo, manchete em caixa alta centralizada e "Leia a legenda". Duas variações por opções do dado: `topo` = perfil (avatar redondo + nome + verificado; padrão) ou `logo` (logo da marca solta no canto); `rodape` = barra na cor da marca (padrão) ou `fio` (fio fino colorido arredondado).
- Estilos da casa por marca (campo `marcas`): `manchete-perfil` (Seguidores em Alta: perfil + barra) e `manchete-bet` (Vivendo de Bet: logo + fio; as opções vêm do `opcoes` da sequência). Ambos de página única, feed e carrossel. Para liberar em outra marca, acrescente o nome em `marcas`.
- Copy: o Roteirista recebe "manchete direta e forte, ideal até ~N caracteres, numa página só; foto = imagem real do assunto".
- Também: título do modelo com entrelinha mínima 1.1 (não encosta o acento da linha de cima).

## Build .156 — Layout ensinado pelo dono manda; botão sempre legível

- `livreParaHeroi` não recompõe a página quando a marca já tem um layout salvo (`art_layouts`) naquele formato: o Designer segue as posições que o dono ensinou no editor; a recomposição pelo modelo `heroi` vale só para marcas sem layout.
- Renderizador: o texto do botão ganha cor de contraste automática (mínimo 3,5:1 contra o fundo do botão); antes, branco sobre verde-neon dava 1,7:1.
- Conferido com a arte do conteúdo 419 editada pelo dono (mascote 1144 px, título e botão reposicionados): a renderização reproduz o layout dele.

## Build .155 — Página livre do Designer vira o modelo `heroi` (layout profissional, sem posição solta)

Problema visto na arte do conteúdo 419: com `modelo: "livre"` o Designer posicionava título, texto, botão e mascote em coordenadas soltas, e saía peça torta (mascote pequeno no canto, buraco entre título e texto, frase solta, risco verde perdido, botão em duas linhas).
- `livreParaHeroi` (server.js): página livre com 1 título, textos de apoio, no máximo 1 botão e no máximo 1 mascote/pessoa (tipo `mascote` ou `pessoa` na biblioteca) é recomposta pelo modelo `heroi`: personagem grande à direita saindo pela borda, texto empilhado e centrado, botão no fim. O fundo escolhido pelo Designer (`bg.asset`) é mantido. Páginas com outros elementos continuam livres.
- Chamada de botão com mais de 5 palavras vira a forma curta e completa (“Mande para quem precisa”).
- Texto de apoio do `heroi` com personagem usa 80% da coluna e até 6 linhas (antes cortava em 3 linhas, sumindo palavras).
- `protegeMascote` (server) e a checagem real do motor (`motor/arte.mjs`) não reposicionam mais o personagem do `heroi` (ele já nasce grande, com degradê sob o texto).

## Build .154 — Arte vazia (só a logo) corrigida na raiz

Caso real (conteúdo 419, Central do Marketing): o Designer entregou o JSON completo (título, texto, chamada, mascote), mas a arte saiu só com a logo e foi aprovada com nota 8.4.
- **Causa:** o Designer usou `modelo: "livre"` (página própria, com `texts` e `items`) junto com um `template`; `compoeModelos` trocava toda página de modelo desconhecido pelo modelo do template com `dados` vazios, e a recomposição apagava os textos e o mascote.
- **Correção:** página livre com textos ou imagens próprias é preservada; o template só converte páginas sem conteúdo.
- **Trava:** `extractArteSpec` rejeita arte sem conteúdo (nenhum texto, forma ou imagem além da logo); o painel então monta pela copy (`arteDoRoteiro`) em vez de marcar `ok`.
- **Revisor:** o pedido de revisão da entrega agora traz “o que a arte renderizada realmente contém” por página (textos e imagens), e página vazia é erro grave; assim a revisão no modo chat não aprova arte em branco só pela direção em texto.
- **Botão cortado:** a arte montada pela copy cortava a chamada em 3 palavras (“Mande para quem”); agora usa a chamada inteira (até 5 palavras) ou uma forma completa (“Mande para quem precisa”).

## Build .153 — Padrão de qualidade tipográfica (todas as marcas) e seleção em massa no Conhecimento

**Tipografia e botão (aprendizado do dono, vale para toda marca e toda origem de arte):**
- Guarda no renderizador (`arte-slide.js`): espaçamento entre letras limitado por peso (fonte pesada nunca abaixo de -0,012 em; condensada -0,01), entrelinha mínima de 1,08 em títulos de várias linhas e 1,2 em texto corrido, subtítulo/texto (`role: body`) nunca acima de peso 500; botão CTA com cantos mais redondos, recuo maior e seta redonda dentro (`seta: false` desliga).
- Modelos (`arte-modelos.js`): `tipografia()` com título `ls -0.01 / lh 1.08`, texto 400 e `txtM` 400 (antes 500 e -0.02), `txtB` 600; `botaoH` e `ctaSz` contam o recuo e a seta, então o texto do botão não é mais espremido nem cortado.
- Copy: o `cta` passa a ser sempre uma chamada completa de 2 a 5 palavras (“Mande para quem precisa”), nunca cortada.
- Agentes: migração `regras_tipo_v1` grava o padrão em Designer e Gerente (aprender/evitar) e a regra do CTA no Roteirista; o texto anterior fica guardado em `settings.regras_antigas_<agente>_tipo_v1`.

**Conhecimento:** botão “Selecionar” liga o modo de seleção (caixinha em cada cartão de texto ou arquivo); “Selecionar todos (N)” marca tudo o que está visível na lista (respeita marca, aba e busca), “Limpar” e “Apagar selecionados” (com confirmação) removem de uma vez.

## Build .152 — Agente Radar (Google Trends + Google Notícias) e Estilo da arte sempre visível

**Radar** (novo agente, menu "Radar de notícias"): por marca, lê o Google Trends (`trends.google.com/trending/rss`) e o Google Notícias (busca por assunto) e entrega a matéria pronta ao Roteirista.
- Config por marca: ligada, assuntos do nicho (separados por vírgula), pautas por dia (1 a 6) e formato. Global: busca automática diária (padrão **desligada**), hora e país das tendências.
- Fluxo: coleta (descarta o que já foi visto ou já virou conteúdo) → agente Radar escolhe até N manchetes pelo público da marca e escreve título, ângulo, fatos e "por que importa" → cada escolhida vira conteúdo `noticia` (criado por `radar`) com briefing que manda o Roteirista confirmar os fatos na fonte, citar fonte e data e não inventar nada. Sem relevância = nenhuma pauta.
- Cada notícia pode ser enviada ao Roteirista ou descartada à mão na própria tela. Modo chat funciona (a coleta é reaproveitada por 6 h entre montar o pedido e colar a resposta).
- API: `GET/PUT /api/radar`, `POST /api/radar/run`, `POST /api/radar/item/:id` (`acao: pauta|descartar`). Permissão por área `radar`.
- Tabela `radar_items`; config em `settings.radar_cfg`.

**Nova pauta**: o campo "Estilo da arte" agora aparece também com o formato em "O Revisor escolhe" (o padrão), listando os estilos da marca de todos os formatos de arte; ao escolher um, o formato passa a ser o do estilo. Só some para vídeo.

## Build .151 — `manchete-foto` com fio e logo (Marketing Raiz) + sombra colorida de texto

- Novas opções do `manchete-foto`: `topo: 'nenhum'`, `linha: true` (fio branco acima da manchete), `rodape: 'logo'` (logo da marca centralizada entre a manchete e "Leia a legenda", sem barra), `italico` e `sombra` (sombra dura na cor de destaque da marca). Estilo da casa `manchete-raiz` (marca Marketing Raiz, feed e carrossel, página única).
- `arte-slide.js`: novo `sh_color` no texto (sombra dura deslocada na cor indicada); `sanitizeArteSpec` aceita `sh_color`.

## 2026-11-03.157 — Revisão de copy com notas separadas e padrão de força

- Revisor de Copy agora dá CONFORMIDADE e FORÇA (GANCHO, ESPECIFICIDADE, TENSÃO, UTILIDADE, 1 a 5, uma frase cada). A nota final é a menor das quatro.
- Aprovação só com GANCHO e ESPECIFICIDADE 4 ou mais; se o revisor aprovar abaixo disso, o sistema rebaixa para "ajustes" e devolve ao Roteirista pedindo 2 títulos alternativos e um exemplo concreto no trecho genérico.
- Regras novas (migrações únicas, texto antigo guardado em `settings.regras_antigas_*`): `regras_forca_v1` (padrão de força para Roteirista e Revisor) e `regras_forca_v2` (rodada 0, limite de 2 devoluções, conflito de regras, arte "não confirmado" sem render; também no Gerente).

## 2026-11-03.158 — Agente de Notícias (antigo Radar) com sites de tecnologia e foto da matéria

- O agente passa a se chamar Agente de Notícias (id interno `radar`; migração `agente_noticias_v1`, nome/função/prompt antigos em `settings.regras_antigas_radar_noticias_v1`).
- Fontes: Google Trends, Google Notícias por assunto da marca e RSS de sites de tecnologia (Tecnoblog, Canaltech, Olhar Digital, Showmetech, TechCrunch, The Verge, Ars Technica), cada um ligável na tela, mais RSS extras por linha. Só matérias dos últimos 2 dias.
- O título da pauta é a manchete verdadeira da matéria (só encurtada). O brief traz "MANCHETE VERDADEIRA".
- Foto da notícia (`radarFoto`): pega a imagem do feed, da página (og:image, twitter:image, JSON-LD) e, para links do Google Notícias, decodifica o endereço real. Exige lado maior >= 1000 px e menor >= 560 px. Guarda na Biblioteca da marca como `noticia-<id>` com o crédito.
- `compoeModelos(found, format, brand, c)`: em pauta do Radar com foto, a capa vira "noticia" com a foto da matéria (sem mascote) e o cartão final usa a mesma foto.

## 2026-11-03.159 — Agente de Notícias automático

- Busca diária ligada por padrão (a partir das 07:00) e todas as marcas ligadas (marca sem ajuste usa a base de conhecimento). Migração única `radar_auto_v1` liga o que já estava salvo; depois a tela manda.
- Cadeia sem mão humana: o agente pesquisa, cria a pauta com a manchete verdadeira, busca a foto da matéria e o Roteirista já começa a escrever.

## 2026-11-03.160 — Agente de Notícias no escritório, sem IA para escolher

- Mesa própria no Escritório (3D, nova fileira) e card na lista de agentes; sem aba lateral. Clicar na mesa abre a configuração (fontes, marcas, notícias) com botão "Voltar ao escritório". Fluxo desenhado: Agente de Notícias -> Roteirista.
- `radarEscolhe`: a escolha das notícias é feita pelo painel, sem Claude. Pontua por assuntos escritos para a marca, palavras da base de conhecimento, data, buscas no Trends e cobertura por mais de uma fonte; descarta tragédia, crime e política partidária; evita duplicadas. Mínimo de pontos: sem notícia boa, sem pauta.
- `pumpRadarLocal`: no modo chat o painel roda a busca sozinho (não fica esperando colar resposta). A pauta cria o conteúdo e já enfileira o Roteirista.

## 2026-11-03.161 — Fluxo de notícia conferido de ponta a ponta

- `arteDoRoteiro` passa o conteúdo a `compoeModelos`, então a arte montada pelo painel a partir do roteiro (modo chat) também usa a foto da matéria.
- No estilo "Notícia de jornal (2 páginas)", o cartão final leva o texto das páginas do meio do roteiro (o que aconteceu, o que muda), com pontuação, e não a página de "siga a página".

## 2026-11-03.162 — Template de notícia próprio de cada marca

- Cada marca escolhe na mesa do Agente de Notícias o template de notícia dela (`radar_cfg.marcas[marca].estilo`). Sem template, o agente não cria pauta nenhuma (nem cai no carrossel institucional nem no template de outra marca); o painel avisa em vermelho.
- A pauta nasce com `estilo_arte = t:<template>` e o formato que o template suporta; o brief cita o template.
- A foto da matéria é aplicada depois do visual ensinado pelo dono (que não pode apagá-la). Em `manchete-foto` a foto entra como fundo e o perfil é omitido, para não bagunçar a ordem dos textos do visual ensinado.
- Conhecido: no visual ensinado de "Manchete sobre foto com perfil", manchete longa (4 linhas) estoura embaixo. Falta um limite de tamanho de manchete por template.


## .163 Templates "Cinema" e "Agência" para todas as marcas
- Dois estilos da casa, prontos para qualquer marca (cor, logo, fonte e @ vêm da identidade de cada uma): **Cinema** (fundo escuro de filme, palavra gigante vazada, texto fino, fio vertical, perguntas entre aspas, cartão translúcido final) e **Agência** (tags no topo, título grosso na cor da marca, objeto 3D de vidro, dois cartões de contorno, lista em caixas, avatares, rodapé em três pílulas: marca, Instagram, WhatsApp).
- Modelos novos em `public/arte-modelos.js`: `cinema-capa/texto/pergunta/card` e `agencia-capa/objeto/cards/lista/cta`. O Designer escolhe o estilo pela copy (aparece no catálogo de templates) ou o dono escolhe na marca.
- O objeto 3D e as texturas (dobras de vidro, brilho) vêm da Biblioteca da marca (tipo "textura" e "banco") ou da geração de imagem; sem imagem, entra um ladrilho 3D de reserva.
- `public/arte-slide.js`: o texto que passa da borda agora diminui até caber e o título sobe se encostar no texto abaixo.

- .163 (ajuste): Agência com brilho forte atrás do objeto, dobras de vidro nos cantos, objeto de reserva em vidro com ícone do tema (carrinho, foguete, megafone, cifrão), títulos maiores, ícone no título da lista e avatares com ícone.


## .164 Banco de texturas geral
- 9 texturas entram sozinhas, uma vez, na Biblioteca em Geral (todas as marcas) › pasta Texturas, com ficha pronta (assunto, descrição, uso, combina com, evitar): papel amassado escuro com grão, tecido amassado cinza, mármore prata, gradiente líquido roxo, padrão de ondas bege, papel amassado bege, papel amassado branco, papel com grão branco, cartaz colado branco. Arquivos em `banco/texturas/`.
- O Designer enxerga cada textura no catálogo de arquivos pela ficha ("textura estilo tal"). Você pode apagar ou trocar qualquer uma na Biblioteca; a carga não se repete.
- Nos estilos Cinema e Agência a textura entra por mistura (papel escuro em screen, tecido em soft-light; em fundo claro, papel em multiply). Marca com textura própria na Biblioteca usa a dela. Os demais estilos não mudam.
- As imagens enviadas são pequenas (a maioria abaixo de 750 px): servem como textura mesclada, não como foto grande.

## .165 Agência fiel ao template do dono
- O estilo Agência foi refeito com as coordenadas medidas nas duas referências (verde e roxa): tags e logo no topo, título e frase de apoio centralizados, objeto sangrando por baixo, rodapé em três pílulas (verde); cartões de contorno, texto à esquerda, lista em caixas e objeto sangrando pela direita (roxa). Fundo chapado, sem textura nem vinheta: só muda texto, cor da marca e imagem.
- Novo modelo `agencia-texto`. Sequência: capa, texto, objeto, dois cartões, lista, chamada final.
- O campo "objeto" deve trazer sempre a imagem do tema do roteiro (mascote da marca em pose do tema, "banco: ..." ou imagem gerada). Isso está no catálogo que o Designer lê.

## .166 Agente de Notícias com o roteiro do dono
- **Nichos por marca:** tecnologia (007 Spyhacker), marketing digital (Marketing Raiz e Central do Marketing), redes sociais (Seguidores em Alta), esportes (Vivendo de Bet), empreendedorismo e finanças (Corte dos Ricos). Escolhido na mesa do agente; ao escolher o nicho de uma marca sem assuntos, os assuntos de busca do roteiro entram sozinhos. SIM Int Pay ficou sem nicho (lê todos os sites).
- **Fontes de referência por nicho** (Wired, MIT Technology Review, IEEE Spectrum, The Robot Report, BleepingComputer, The Hacker News, Krebs, Search Engine Land/Journal, Adweek, Marketing Dive, Meio & Mensagem, Propmark, Social Media Today, Meta Newsroom, YouTube Blog, ge, ESPN, UOL Esporte, CNN Esportes, BBC Sport, InfoMoney, Exame, NeoFeed, Bloomberg Línea, Crunchbase News, além das que já existiam). A marca lê só as fontes do nicho dela. Se um site tirar o feed RSS do ar, o agente anota o erro e segue com os outros.
- **Nota do roteiro:** 5 critérios de 0 a 2 (atualidade, impacto, interesse, potencial de conteúdo, confiabilidade). Entra com 6 ou mais e nunca com 0 em confiabilidade (2 = fonte oficial ou 2 fontes independentes). Janela de 24 h, até 7 dias se o assunto continua em alta. A nota aparece em cada notícia.
- **Descarte:** lista genérica ("10 dicas"), promocional, caça-clique, boato e rumor, matéria sem data ou sem link, e o que já foi entregue. Em tecnologia, ataques de hackers e prisões entram (nos outros nichos crime e política partidária continuam fora).
- **Pedido ao Roteirista:** leva nicho, subnicho, status (Confirmado ou Fonte única), data do fato, sinal do Google Trends, nota, o cuidado do nicho (finanças nunca recomenda compra ou venda; redes separa confirmado, teste e teoria; esporte só rumor de jornalista confiável) e as regras de precisão. O Roteirista define ângulo e gancho.
- Limites desta versão: o painel não abre a matéria inteira para confirmar a origem (isso fica para o Roteirista, no pedido) e as notícias de cada marca saem, por padrão, 3 por dia (ajustável de 1 a 6).

## Build .167 — copy aprova de primeira e arte de notícia sem erro

- **Conferência local antes do Revisor (`copyLint`)**: depois que o Roteirista entrega, o painel confere os limites objetivos (título até 8 palavras, capa até 12, sem ponto final, apoio até 25, uma versão só de cada, legenda com um único pedido, sem isca de engajamento). Se falhar, o roteiro volta ao Roteirista com a correção exata, até 2 vezes, sem gastar rodada do Revisor.
- **Checklist obrigatória no pedido do Roteirista**: gancho específico, limites, um único pedido, sem isca, só fatos do briefing, 7 blocos.
- **Guia do carrossel corrigido**: dizia "título até 14 palavras e texto até 40", contra a regra M04 do Revisor (8 e 25). Essa contradição era uma das causas das devoluções.
- **Arte de notícia (erro "o Designer não entregou a especificação visual")**: o leitor de roteiro agora entende cabeçalhos como `## Slide 1`, `**Slide 2**` e `Slide 3 (CTA)`, além de `Slide 1 — CAPA`. Antes, esses roteiros não viravam páginas e a arte não era montada.

## Build .168 — capa da Central fiel ao estático aprovado e copy sem rótulos de bastidor

- **Capa**: novo modelo `capa-mascote`, réplica da arte aprovada (título grande à esquerda com uma palavra em destaque, apoio, mascote enorme cortado no canto direito, sombra à esquerda, brilho verde, fundo da marca). O "Templete 01 Central" passa a usá-lo na capa (migração `capa_mascote_v1`), sem os ajustes soltos de posição que deixavam a capa aleatória (título centralizado, mascote pequeno no topo, texto fixo embaixo).
- **Copy**: as regras de verdade (V3, M12) faziam o Roteirista escrever "Cena ilustrativa:", "personagem fictícia", "Na nossa leitura" e "Só mostra: / Dá motivo:" dentro dos slides. A checklist do Roteirista e a conferência do painel (`copyLint`) agora barram esses rótulos: exemplo inventado é declarado em 2 ou 3 palavras no fim do apoio, nunca no título.

## Build .169 — padrão do dono: capa chamativa + colunas de texto

- **Páginas internas**: novo modelo `coluna` (texto em coluna à esquerda, parágrafos curtos, palavras-chave em destaque, lista com marcadores, fundo claro ou escuro com brilho, mascote pequeno em um slide do meio sem cobrir o texto). Título e texto de cada página interna viram parágrafos (`paraColunas`). O "Templete 01 Central" passa a usar `coluna` no miolo (migração `capa_mascote_v3`).
- **Capa**: `capa-mascote` agora em caixa alta, título maior, e o texto nunca fica por cima do mascote (coluna de texto de 54% da largura, mascote à direita).

## Build .170

- Template da Central: páginas internas em `coluna` com fundos definidos (claro, claro com mascote, escuro), em vez de tudo escuro na prévia.
- Logo escura sem arquivo no disco não faz mais a logo sumir das páginas claras: usa a logo clara dentro da cápsula escura.

## Build .171 — notícia: sem erro de arte, manchete própria e mais forte

- **Erro "o Designer não entregou a especificação visual"**: templates de notícia de uma página só (manchete sobre foto) eram criados como carrossel, e o painel recusava o roteiro de 1 slide. Agora a pauta já nasce em post único quando o template tem uma página, e o roteiro de 1 slide é aceito.
- **Manchete**: o brief do Agente de Notícias passa a chamar a do site de "MANCHETE DA FONTE (só referência, NÃO copie)" e manda o Roteirista escrever a manchete da arte: até 12 palavras, com contraste, consequência, número ou o detalhe inesperado, sempre fiel aos fatos. A conferência do painel (`copyLint`) devolve ao Roteirista a manchete parecida demais com a da fonte, com mais de 14 palavras ou com adjetivo vazio.
- **Layout**: manchetes de notícia em Bebas Neue (condensada), maiores, como nos seus exemplos (Seguidores em Alta, 007 Spyhacker, Vivendo de Bet).

## Build .172 — foto da matéria na capa e manchete sem mudar a notícia

- **Foto**: a foto da própria matéria (og:image da página real) já era baixada em segundo plano; agora, se ainda não veio na hora de montar a arte, o painel busca de novo, e a foto vai para a capa mesmo que o Roteirista não a cite. O crédito segue na legenda.
- **Manchete**: o brief diz "NÃO MUDE A NOTÍCIA" (números, nomes, datas e o fato ficam iguais; só a forma de contar muda). A conferência do painel devolve ao Roteirista a manchete que traz número que não está nos fatos do pedido.

## Build .173 — teste ponta a ponta do fluxo de notícias e proteções para produção

Teste feito com sites simulados (coleta, escolha, pauta, foto, conferência da manchete, arte):
- **Foto**: o motivo de cada falha agora aparece (site bloqueou com HTTP 403, imagem achada mas bloqueada, imagem pequena, matéria sem imagem). Antes, página bloqueada aparecia como "a matéria não traz imagem".
- **Download da imagem**: usa cabeçalho de navegador e o endereço da matéria como referência (alguns sites bloqueiam o painel sem isso), e reconhece jpg, png e webp pelo conteúdo (sites que mandam application/octet-stream davam erro). Usa a primeira imagem boa (a de capa da matéria), não a maior da página; aceita a partir de 800 x 450 px.
- **Sem foto**: a aba Arte mostra o aviso "Sem foto da matéria: motivo", para o dono enviar uma foto e clicar em Recompor.
- **Roteirista**: para notícia, a conferência do pedido é própria de notícia (manchete sua, fato intacto, legenda com fonte e crédito), sem as regras de carrossel.
- **Manchete**: largura menor (86%) para não encostar nas bordas.

## Build .174 — notícia sem mascote, fonte Impact, foto da matéria ou da internet, manchete mais forte

- **Sem mascote em notícia, em nenhum caso.** Toda arte de pauta do Agente de Notícias passa por um filtro final: tira mascote, personagem e qualquer imagem da marca usada como fundo (o fundo vindo do layout ensinado também) e deixa só a foto da matéria. Se não houver foto, a arte sai com fundo liso na cor da marca e a aba Arte avisa "Sem foto: motivo". O modelo de frase (usado pela Central) também recebe a foto da matéria como fundo.
- **Fonte Impact** (arquivo enviado pelo dono) instalada em `public/fonts/impact-latin-400-normal.woff2`; também a Impact Extravagant. Os arquivos só tinham letras e números, então acentos (Ã, Ç, É...) e pontuação (! ? : - %) foram completados com glifos da Anton na mesma altura, e as larguras entraram em `arte-metricas.js`. As manchetes de notícia (modelos `noticia`, `manchete-foto` e `citacao` em pauta) usam Impact; o ajuste de tamanho do layout ensinado não aumenta mais o texto Impact (ele já é medido para caber).
- **Foto: matéria primeiro, internet depois.** Primeiro a imagem de capa da matéria; se não existir, for bloqueada ou for pequena (menos de 800 x 450 px), o painel busca imagens do assunto no Bing Imagens e no DuckDuckGo (sem chave), descarta bancos de imagem com marca d'água e miniaturas, e usa a primeira com qualidade. O crédito da foto vai para a Biblioteca e para o briefing ("busca na internet; confira os direitos de uso").
- **Manchete**: o pedido ao Roteirista traz a receita (sujeito concreto + verbo forte + consequência para o leitor, falando com "seu/você"), a lista de palavras mortas e um exemplo de reescrita; a conferência do painel devolve manchete que começa com "muitos/novo/saiba/confira", usa "essenciais/importantes/ainda não" ou tem menos de 4 palavras.
- Instalar: substitua `server.js`, `public/` (index.html, arte-slide.js, arte-modelos.js, arte-metricas.js, `fonts/impact-*.woff2`) e `README.md`, e reinicie.

## Build .175 — fonte das notícias igual à do exemplo do 007 SpyHacker

- A fonte "Impact" das artes de notícia agora usa a Anton (pesada, alta e condensada), que é o estilo do exemplo do 007 SpyHacker (acentos e pontuação completos). A fonte quadrada do arquivo enviado antes ficou sem uso (`impact-*.woff2` em `public/fonts` pode ser apagado).
- Medidas de largura da Impact = as da Anton; entrelinha de manchete 1,0 para o bloco ficar compacto como no exemplo.

## Build .176 — logo afastada da linha no modelo de frase em notícia

- No modelo `citacao` das pautas de notícia a logo fica acima da linha com folga (cerca de 50 px), e a linha fica separada da manchete (cerca de 60 px). Antes a logo encostava na linha.

## Build .177 — notícia: texto sobreposto, fade mais forte e foto de melhor resolução

- **Texto embolado:** a chamada de apoio do roteiro ia para o campo de nome do modelo de frase e caía em cima da manchete. Em notícia o modelo de frase agora leva só a manchete.
- **Fade de baixo:** três camadas de escurecimento (até 78% da altura), para a logo, a linha e a manchete ficarem legíveis sobre qualquer foto.
- **Foto embaçada:** entre as imagens boas (da matéria ou da busca) o painel baixa até 5 e fica com a de mais pixels, parando cedo se achar uma de 1,5 MP ou mais; os resultados da busca vêm ordenados por tamanho.

## Build .178 — arte de notícia nunca mais fica sem imagem por causa do formato do roteiro

- **Causa do "O Designer não entregou a especificação visual":** o roteiro de notícia veio sem o cabeçalho "Arte — CAPA" (por exemplo "## TEXTO DA ARTE / Manchete: ..."), o painel não achou a página e desistia. Agora, em notícia, se o formato não bate o painel procura a manchete (rótulo Manchete/Título/Headline, bloco TEXTO DA ARTE, ou a primeira linha curta) e monta a arte; se não achar nada, usa a manchete da fonte e avisa na aba Arte para reescrever e clicar em Recompor. A arte de notícia também é montada pelo painel mesmo com a opção `arte_do_roteiro` em "nunca".
- **Título da fonte:** entidades HTML (`&#8217;`, `&eacute;`, `&rsquo;`...) são decodificadas e o crédito do feed ("via @sejournal, @MattGSouthern") sai da manchete.

## Build .179 — nenhum gasto de IA sem resultado no fluxo de notícias

Auditoria do fluxo (Radar → Roteirista → Revisor de copy → gerente → Designer → arte) e travas colocadas ANTES de cada gasto:
- **Foto antes da pauta.** A busca da foto (matéria e, se preciso, internet) é gratuita e agora vem antes de criar a pauta. Notícia sem foto boa não vira pauta, não chama o Roteirista e é descartada com o motivo no Radar; a próxima candidata ocupa a vaga (o Radar guarda até 8 reservas). O botão "Criar pauta" também recusa notícia sem foto e explica o motivo.
- **Formato do roteiro conferido na hora.** Se o roteiro não traz as páginas no formato do pedido (ou, em notícia, nenhuma manchete), o painel devolve ao Roteirista na hora, antes de gastar Revisor, gerente e Designer (até 2 voltas, como as demais conferências).
- **Designer não gasta em notícia.** A arte de notícia sai do roteiro, no template da marca, sem chamar o Designer; se o roteiro vier fora do formato o painel acha a manchete assim mesmo (build .178).
- **Notícia nunca gera imagem por IA.** Fundo e itens gerados (`gen`/`banco`), mascote e imagens da marca são removidos da arte de notícia; só vale a foto real da matéria.

## Build .180 — REGRA: notícia só usa o template de notícia cadastrado da marca

- Notícia (pauta do Agente de Notícias) usa SEMPRE o template de notícia escolhido na mesa do Agente de Notícias para a marca. Nenhum outro template cadastrado, nem a "página livre" inventada pelo Designer (data, fonte, botão, cartão de foto), pode ser usado. A regra vale em quatro pontos: ao escolher o estilo (`escolheEstilo`), ao compor a arte (`compoeModelos`, que descarta o template e a página do Designer), ao montar pelo roteiro (`arteDoRoteiro` corrige o `estilo_arte` do pedido) e em ajustes/revisões (o Designer nem é chamado em notícia).
- **Recompor** numa notícia antiga cuja arte não está no template de notícia refaz a arte pelo roteiro; arte já no template (com a fonte Impact) é só re-renderizada, preservando edições manuais.

## .181 — Layout salvo vira template de notícia
O Agente de Notícias lista também os layouts de uma página salvos na marca ("(layout salvo)"). A arte sai idêntica ao layout; troca só manchete (tamanho se ajusta) e foto da matéria.

## .182 — Leia a legenda, espaçamento e foto
- Toda arte de notícia (template ou layout salvo) leva "LEIA A LEGENDA" abaixo da manchete. REGRA DE ESPAÇO: linha→manchete 3,2% da altura, manchete→legenda 5%, legenda→borda 4,5%; o tamanho da manchete encolhe para caber.
- Foto: descarta imagem lisa/sem detalhe (poucos bytes por pixel), pontua nitidez, resolução e se cita as marcas. Manchete com duas marcas (ex.: Google e ChatGPT) busca "A vs B" na internet e exige imagem que cite as duas.

## .183 — Contracapa de notícia, 2 fotos, auditoria
- Notícia agora sai com 2 páginas: capa (template ou layout salvo) + contracapa com a 2ª melhor foto e cartão idêntico a post do X (avatar, nome com selo azul, @, botão Seguir, texto da legenda + chamada para comentar e seguir, ícones).
- Foto: baixa até 6 candidatas, pontua e guarda a melhor (capa) e a segunda (contracapa, coluna foto2_asset). Imagem lisa perde pontos; só descarta a praticamente chapada.
- Revisor da entrega não roda mais em notícia montada no template (arte determinística; só gastava IA e devolvia em loop): vai direto para a aprovação.
- Título da pauta sai sem entidades HTML e sem "via @fulano".

## .184 — Contracapa: cartão pequeno estilo X
Cartão compacto na parte de baixo (80% da largura) sobre a foto com fade escuro atrás: avatar redondo + nome com selo azul + texto logo abaixo, fonte Inter. REGRA: texto curto (resumo até ~100 caracteres + "Comente o que achou e siga a página"). Vale para todos os templates de notícia; só mudam logo e nome da marca.

## .185 — Regras gravadas nos templates (banco)
Ao iniciar o painel e ao escolher o template no Agente de Notícias, o template/layout de notícia escolhido é ATUALIZADO NO BANCO: ganha "LEIA A LEGENDA" embaixo da manchete e a 2ª página (contracapa com o cartão do X). Aparece no editor de templates/layouts. Idempotente.

## .186 — Contracapa: foto diferente, avatar da marca, chamada por marca
- A contracapa NUNCA repete a foto da capa: usa a 2ª foto (busca de novo se faltar); sem 2ª foto, fundo escuro da marca.
- Avatar do cartão = ícone da logo da marca (recortado da logo larga e guardado na Biblioteca como avatar-<marca>).
- Selo azul colado ao nome (vale para todos os templates).
- Chamada da contracapa por marca (seguir ou vender), campo na tela do Agente de Notícias.

## .187 — Contracapa que chama atenção
- Foto da contracapa só entra se for nítida, grande e do assunto (nota mínima 5.5 ou cita o tema); senão usa fundo forte com brilho na cor da marca e a logo grande no alto.
- Cartão maior (86% da largura) com letra maior, legível no celular.

## .188 — Contracapa sempre com foto da notícia
- Puxa 5-6 imagens do assunto (busca na internet + imagens da matéria), escolhe as 2 melhores: a melhor na capa, a seguinte na contracapa. Sem trava de nota: a contracapa sempre leva foto relacionada; o fundo da marca só aparece se nenhuma imagem puder ser baixada.

## .189 — Conferência automática da notícia
- Depois de montar capa + contracapa, o sistema confere: capa com foto, contracapa com foto da notícia, fotos diferentes. Qualquer falha vira "ATENÇÃO — ..." na nota da arte e no registro do Designer, em vez de passar calada.

## .190 — Aprendizado Hard Copy para o Roteirista e o Revisor de Copy + 2ª busca de foto
- Novos documentos na base da casa (modo sempre): roteirista/03-copy-que-converte-engenharia-reversa-hard-copy.md e revisorcopy/03-checklist-de-copy-que-converte-hard-copy.md. Entram sozinhos no banco ao iniciar (carregaBasesAgentes) e valem para toda copy: curiosidade, desejo, prova antes da promessa, frase de virada, mecanismo com nome, chamada única, limites do que não copiar.
- Contracapa: se a 1ª busca não trouxer foto, tenta de novo com outra consulta (assunto + notícia, ou primeiras palavras da manchete).

## .191 — Qualidade de foto (motor/qualidade-foto.mjs)
- Novo módulo motor/qualidade-foto.mjs (usa só o ffmpeg que o sistema já exige). Toda foto candidata de notícia é medida: tamanho útil depois do corte vertical da capa e nitidez (laplaciano). Cobre a capa sem esticar e nítida = nota maior; borrada = nota bem menor. Sem ffmpeg, a medição é ignorada e a foto nunca deixa de entrar.
- As 2 finalistas (capa e contracapa) recebem acabamento: ampliação 2x opcional (Real-ESRGAN em motor/realesrgan, se existir), corte vertical no ponto mais detalhado, nitidez e contraste leves, saída JPG.

## .192 — Escritório em andares
- O Escritório virou um prédio de 3 andares com uma sala por agente: Andar 3 (Criação e comando: Arte, Vídeo, Gerente e Cérebro), Andar 2 (Redação e revisão: Roteiro, Revisão da copy, Qualidade), Andar 1 (Entrada e saída: Notícias, Publicação, Recepção). Mesmo estilo isométrico de antes.
- Elevador e mensageiros: quando um agente entrega trabalho (novo registro de atividade) ou quando uma etapa está ativa, o agente sai da mesa com o papel na mão, anda pelo corredor, sobe ou desce no elevador até o andar de quem recebe e a mesa dele acende "recebido".
- Escritório maior; a Atividade ao vivo fica ao lado (clicar numa linha abre a peça). Os cartões repetidos dos agentes saíram: o estado de cada um aparece na etiqueta sobre a sala.
- Chat do Gerente em gaveta: abre pelo botão "Falar com o Gerente" ou clicando na etiqueta do Gerente; fecha com Fechar, Esc ou clicando fora. Continua funcional (Conversa e Ações); a aba Equipe saiu da gaveta.

## 2026-11-05.193
- Escritório em planta aberta: mesas lado a lado com divisórias baixas, sala de vidro separada para o Gerente, Activity ao vivo ao lado, chat do Gerente em gaveta.
- Agentes se levantam e levam papel/pendrive/HD ao próximo agente; o Gerente sai da sala e dá o chicote (animação).
- Logo completa "AGENTES GRUPO SIM" na lateral (rota /logo-agentes-sim.png).

## 2026-11-05.194
- Escritório: balões de conversa entre agentes (entrega/recebimento e conversa ociosa), mais mensageiros ao mesmo tempo, Gerente reage a aprovação/reprovação, variedade de visual (óculos, cabelo longo, barba).
- Clique no agente (mesa ou etiqueta) abre painel com estado, ações do dia e histórico.
- Som opcional (botão no canto): estalo do chicote, aviso de entrega, teclas suaves. Começa desligado.
- Luz do dia: céu das janelas e tom do ambiente mudam conforme o horário.
- Tarefa rodando: linha tracejada no chão entre quem entrega e quem recebe, e "..." sobre quem trabalha.

## 2026-11-05.195
- Hierarquia nos modelos de jornal (Capa de jornal, Manchete sobre foto, Citação de notícia): manchete maior (até ~15% da largura, mais altura disponível) e "Leia a legenda" menor (de 3% para 2,4% da largura).
- Citação de notícia: a linha fina deixou de cortar a manchete; linha, manchete e "LEIA A LEGENDA" reposicionados.

## 2026-11-05.196
- Manchetes com acento (Á, Ã, Í, Ó, É, Ç): entrelinha aberta automaticamente para o acento não bater na linha de cima. Vale para Capa de jornal, Manchete sobre foto, Citação e qualquer modelo que use o título da marca.

## 2026-11-05.197 (auditoria do dia)
- Citação de notícia com nome: manchete e "Leia a legenda" reposicionados (com acento e manchete longa a manchete encostava na legenda).
- Texto das artes: "pronto ?" vira "pronto?" (espaço antes de ? ! : ; , . some) e espaços duplos são removidos, em todos os modelos.
- Conferência da copy (copyLint): número da manchete agora é comparado inteiro com os fatos (o "5" de uma data não libera "5 bilhões"); manchete de notícia não pode terminar com ponto; promessa absoluta (garantido, sem esforço, dinheiro fácil) é devolvida ao Roteirista (exceto em notícia); primeira linha da legenda acima de 220 caracteres é devolvida.
- Testado: 15 telas do painel sem erro de JavaScript; 27 modelos de arte em fundo escuro e claro com texto longo e acentuado, sem erro aberto; escritório a ~1 a 3 ms por quadro.

## 2026-11-05.198 (checagem refeita do zero)
- Instalação nova: a migração de estilos por marca deixou de falhar com "no such column: central" (agora filtra a coluna no código, sem depender dela).
- Celular: a tela do Cérebro não rola mais para o lado (mapa e colunas se ajustam à largura).
- Teste completo refeito com banco limpo: sintaxe de todos os arquivos; 15 telas em 3 tamanhos sem erro de JavaScript e sem rolagem horizontal; 27 modelos de arte em fundo escuro e claro; conferência da copy (notícia e carrossel); notícia ponta a ponta (capa e contracapa com fotos diferentes); escritório (painel, clique no desenho, gaveta, som, balões, chicote).

## .199 (2026-11-05)
- Agência (PyHack/007 Spyhacker etc.): hierarquia aplicada em `agencia-texto`, `agencia-cta`, `agencia-capa` — título maior, texto de apoio menor. As prévias da vitrine são refeitas sozinhas (a chave da prévia inclui a versão).
- **Apagar estilo original agora é POR MARCA**: antes escondia o estilo em todas as marcas e apagava o ajuste de outra marca. Nova tabela `art_hidden_b(id, brand)`; o botão exige a marca escolhida; "trazer de volta" também é por marca. Estilos que estavam apagados globalmente voltaram à galeria.
- O ajuste de uma marca num estilo da casa vale só para ela (as outras continuam com o original).
- Salvar estilo em carrossel também atualiza a vitrine do feed (capa salva) até haver um feed próprio.

## .200 (2026-11-05)
- TODO estilo de notícia (capa de jornal, manchete sobre foto, frase de personalidade) tem 2 páginas: capa + contracapa (cartão do X) do mesmo estilo, e a capa mostra "Leia a legenda". Vale na vitrine, no editor e nas peças.
- Ao iniciar, `migraTodosEstilosNoticia()` atualiza os estilos de notícia já salvos (de qualquer marca) que ainda estavam com 1 página ou sem "Leia a legenda" (Central Notícias, Manchete sobre foto da Marketing Raiz etc.). Idempotente.

## .201 (2026-11-05)
- Corrigida a letra solta ("S", "M") sob a manchete: a inicial do avatar era um texto de papel "título" e roubava os ajustes da manchete (`title#0`). Agora tem papel próprio (`badge`), e a notícia nunca cria avatar/perfil.
- Estilos de notícia já migrados com a letra solta são refeitos na inicialização; texto idêntico na mesma posição (ex.: "Leia a legenda" duplicado) não dobra mais.

## .202 (2026-11-05)
- **Aprovação travando/piscando e erro "Não foi possível montar o pedido" no console**: o pedido de revisão da entrega (`gerencia`) de notícia montada pelo painel não usa IA, mas o modo chat tentava montá-lo e falhava. Agora esses pedidos seguem sozinhos para a aprovação (`gerenciaDireta`, resolvido em `pumpLocal`), e um pedido que o painel resolve sai da fila (409).
- A gaveta da peça só é redesenhada quando os dados mudam de verdade e nunca com o dono digitando nela (antes piscava a cada aviso do servidor).
- Layout de notícia do Escritório (`arteDeLayoutNoticia`/`layoutNoticiaTexto`): manchete o maior que couber (até 4 linhas, começa em 15% da largura), "Leia a legenda" menor.
- `recomporLayoutPeca(id)` + rota `POST /api/contents/:id/arte/atualizar-layout` + passagem única por versão na inicialização: peças de notícia ainda não aprovadas e sem edição à mão ganham o layout atual (nunca troca o modelo; não toca em arte editada à mão).

## .203 (2026-11-05)
- (removido na .205) Fotos das notícias: busca de imagens no Google pela API oficial (Programmable Search), ligada por `GOOGLE_CSE_KEY` e `GOOGLE_CSE_CX` no `.env` (passo a passo no `.env.example`; contador diário, para em 90 buscas). Ordem: foto da matéria, Google, Bing/DuckDuckGo. Sem chave, tudo continua como antes.
- Pontuação das fotos agora considera a relação com o tema (palavras da manchete no título/página/endereço da imagem), além de resolução, nitidez e detalhe.
- Novo manual do Designer: `conhecimento/agentes/designer/07-fotos-de-noticia.md` (padrão de qualidade, rejeições, capa x contracapa, crédito).
- Configurações mostra o estado do Google Imagens e as buscas do dia.

## Build .205 — Google e Brave removidos; fotos de notícia mais exigentes
- Removidos o Google Imagens (a API fechou para contas novas) e a Brave (exige cartão). A busca de fotos é só Bing + DuckDuckGo, sem chave e sem custo.
- Foto da busca: mínimo 1200 x 630 px (1000 x 560 só se não houver nada melhor); foto da própria matéria segue com 800 x 450.
- Descarta imagem sem nenhuma palavra do assunto; penaliza foto de banco genérica; premia contraste forte e assunto em destaque (`medeImpacto` em `motor/qualidade-foto.mjs`).
- A nota da foto (aba Radar) mostra "por que esta" (tamanho, nitidez, nomes citados, contraste).
- Manual novo do Roteirista (`conhecimento/agentes/roteirista/04-manchetes-de-noticia-estilo-do-dono.md`) e checklist do Revisor de Copy (`revisorcopy/04-checklist-manchete-de-noticia.md`): estilo de manchete aprendido de 22 manchetes de referência do dono (fórmulas, tamanho, o que evitar). Entram sozinhos ao iniciar o painel.
- Manchete de notícia no estilo do dono (pedido do Roteirista e conferência do painel): 14 a 24 palavras (máx. 150 caracteres), sujeito + verbo no presente + fato + detalhe que dá peso; reprova pergunta, "?" ou "!", curta demais (<10 palavras) e longa demais. O manual ganhou "Como entregar" e um exemplo de método.

## Build .207 — manchete maior e "Leia a legenda" menor e fina
- Capa de notícia: a manchete é o MAIOR tamanho que couber (até 5 linhas, largura 90%); quando o texto é longo (estilo de 14 a 24 palavras) a linha e a logo sobem junto, em vez de a letra encolher para 40 px. Modelos `citacao` (notícia) e `layoutNoticiaTexto` (layouts do Escritório e peças já montadas ainda não aprovadas).
- "Leia a legenda": 2,1% da largura, Inter 300 (fina), caixa normal, branco com 85% de opacidade. Vale nos modelos novos e, na inicialização, `afinaLegendasNoticia()` ajusta as capas guardadas dos templates e dos layouts, inclusive as editadas à mão.

## .208 — Escritório em 3D de verdade
- O Escritório agora é uma cena 3D (three.js r160, licença MIT, incluída em `public/three.module.min.js` + `LICENSE-THREEJS.txt`): sala completa dividida em baias com divisórias coloridas, piso de madeira, paredes de vidro, janelas com a logo, TV de produção ao vivo (números reais da fila), rack do Cérebro, sala de vidro do Gerente, jardim com árvores low-poly em volta.
- Equipe sentada em cada baia (monitores animados, digitando quando trabalha, mão levantada quando espera você). Mensageiros andam com papel/pendrive/HD; o Gerente sai da sala de vidro, estala o chicote ("ESTALO!") e os agentes tremem, como antes.
- Balões, etiquetas e cliques continuam iguais (camada 2D por cima). Luz muda com a hora (dia/amanhecer/entardecer/noite).
- Se o navegador/placa de vídeo não suportar WebGL, o escritório 2D antigo volta sozinho. Para forçar o 2D: abrir o painel com `?office=2d`.
- Arquivos: `public/escritorio3d.js` (cena), rotas novas em `server.js`, integração em `public/index.html` (`G3`, `drawOverlayGL`).

## .209 — Manchete sumindo na arte de notícia (editor)
- Causa: um ajuste de estilo guardado (deslocamento do título) vinha de uma versão antiga e jogava a manchete para fora da arte (x 0,92 / y 1,48). Por isso ela não aparecia nem dava para abrir no editor, e voltava sem texto ao salvar.
- Correção: (1) `aplicaVisual` nunca deixa um ajuste de estilo tirar o texto do conteúdo da tela; (2) ao iniciar, `saneiaEstilosNoticia` apaga ajustes absurdos nos estilos e refaz a amostra; (3) `reparaPecasForaDaTela` recoloca a manchete (tamanho máximo que couber + "Leia a legenda") em toda peça já montada em que ela saiu da arte e re-renderiza.

## .210 — Layout salvo aparece na vitrine e alimenta o Cérebro
- Estúdio de arte › Estilos: bloco "Layouts salvos" da marca selecionada (e os gerais) no topo, com Usar e Gerenciar.
- Ao salvar layout ou estilo no editor: evento no Cérebro (`layout_salvo` / `estilo_salvo`) e a arte vira molde FIXO do Designer para a marca (entra em "MOLDES APROVADOS DESTA MARCA" nos pedidos).

## 2026-11-06.211: Cortes de vídeo (ClippyMe) dentro do painel

Estúdio de vídeo ganhou a aba **Cortes**: cole o link de um vídeo longo, o ClippyMe (auto-hospedado no Docker) transcreve, o Gemini escolhe os melhores trechos e entrega cortes verticais com legenda. Cada corte toca no próprio painel e pode ir para a Biblioteca. A sub-aba "Editor completo" abre o painel original do ClippyMe embutido.

Instalação (uma vez): instalar o Docker Desktop, rodar `clippyme\instalar-clippyme.bat`, colocar `GEMINI_API_KEY` no `.env`, reiniciar com `iniciar-windows.bat`. Depois o painel liga o ClippyMe sozinho. O ClippyMe escuta só em 127.0.0.1.

## 2026-11-06.212: estilos salvos que sumiam voltam

Causa: ao apagar um estilo da casa numa marca, o painel apagava junto os estilos que o dono tinha salvo a partir dele. Agora apagar só esconde (dá para trazer de volta) e nada salvo é removido. Na primeira abertura desta versão voltam “Templete Notícia” (Seguidores em Alta) e “Manchete sobre foto com fio e logo” (Marketing Raiz), e a migração automática de notícia não mexe mais neles.

## 2026-11-06.213: o Cérebro enxerga todas as artes

- Layout salvo pelo botão do editor (origem "edicao") não avisava o Cérebro; agora todo layout e todo estilo salvo vira molde fixo do Designer e aparece na atividade, inclusive os salvos antes (sincroniza ao abrir e ao salvar/apagar).
- As amostras da galeria de estilos (`__previa__`) gravavam checagens no Cérebro e criavam regras falsas; não ensinam mais e a memória foi limpa uma vez (desfazível na aba Memória).
- Moldes: o Designer vê até 5 por marca/formato, incluindo os da marca vazia (todas).
- Cérebro › Galeria: bloco "Layouts e estilos que você salvou" com o selo "no Cérebro".

## 2026-11-06.214: layouts que não ficam velhos, lixeira de 7 dias, aprendizado entre marcas

- Salvar de novo uma arte que veio de um layout ATUALIZA esse layout (mesmo id), em vez de criar cópia. A versão anterior fica 7 dias na lixeira (“Voltar a esta versão”). No editor há a opção “Salvar como layout novo”.
- Layout salvo a partir de uma notícia da marca vira o padrão de notícia da marca (o mais recente vence). Feito uma vez para o que já estava salvo.
- Lixeira: layout/estilo apagado fica 7 dias e depois some. Enquanto está lá, nada usa. Ao apagar, as notícias da marca passam para o layout mais recente que sobrou, e o molde fixo do Cérebro some.
- “Usar em outra marca”: copia a diagramação trocando cores e fonte pela identidade da marca de destino.
- Cérebro: erro de diagramação aprendido numa marca vira regra geral (em teste) para as outras; marca com pouco padrão próprio recebe como referência a diagramação acertada em outras marcas; o Cérebro avisa em quais marcas o layout salvo pode ser replicado.
- Vitrine: layouts por marca, o mais recente primeiro, com “Em uso nas notícias”.

## Build 2026-11-06.217 (inclui .216) — vitrine do Estúdio de arte organizada

A aba **Estilos** agora tem três blocos recolhíveis (o painel lembra o que você abriu):
- **Salvos por você**: seus layouts e estilos, em cards compactos, com o selo "No Cérebro". Layouts de todas as marcas ficam numa grade só, com a marca em etiqueta.
- **Estilos originais da casa**: os prontos, fixos.
- **Estilos originais apagados** e **Lixeira** (7 dias): só aparecem quando há algo.

Os botões secundários de cada card ficam em "Mais". As abas de formato mostram a quantidade (estilos + layouts), para nada parecer sumido. Nenhum dado foi alterado: só a tela.

Na .217 as prévias dos estilos só são desenhadas quando o card aparece na tela: seções recolhidas e cards fora da vista não pesam no motor de imagem (evita travar a vitrine com "Failed to fetch").

## Build 2026-11-06.218 — painel que não cai e estilos que não somem

- **Failed to fetch**: um erro solto numa tarefa de fundo derrubava o painel inteiro. Agora o erro é registrado na janela preta e o painel continua; o `iniciar-windows.bat` também religa sozinho se o painel parar.
- **Cópia de segurança automática**: qualquer estilo ou layout que saia do banco, por qualquer caminho, deixa uma cópia completa na tabela `art_apagados_copia` (guardada por 60 dias). Assim nada some sem deixar rastro.
- "Restaurar original" agora manda a versão do dono para a Lixeira (7 dias) e registra no histórico. Antes apagava sem aviso.
- “Templete Notícia” (Seguidores em Alta) volta se estiver faltando (restauro único `restauro_estilos_217`).

## Build 2026-11-06.219 — vitrine única e nada volta depois de apagado

- **Estúdio de arte › Estilos** virou uma vitrine só: layouts e estilos juntos, sem blocos separados. Com uma marca escolhida é uma grade só; em "Todas as marcas" cada marca tem o seu bloco.
- Estilo original da casa que foi apagado em TODAS as marcas não aparece mais na visão geral (antes reaparecia ali).
- O restauro automático de estilos foi desligado: nada volta sozinho.
- "Esvaziar a lixeira" e "Apagar agora" também apagam a cópia de segurança correspondente. Depois disso o item não existe em lugar nenhum.

## Build 2026-11-06.220 — vitrine de uma marca por vez

- Sem "Todas as marcas": a vitrine abre sempre numa marca (a primeira, ou a última que você usou).
- Feed, Carrossel e Stories saíram da tela e foram para **Filtros** (recolhido). Sem filtro, a vitrine mostra todos os formatos juntos e cada estilo abre no seu formato principal.
- "Novo estilo" agora pergunta o formato.

## Build 2026-11-06.221 — salvar fecha o editor

Depois de salvar um layout ou template pelo editor, o editor fecha e volta para a vitrine da marca. Assim não fica uma cópia velha aberta que possa gerar conflito. "Salvar estilo" já fechava.

## Build 2026-11-06.222 — levar tudo para outro painel (local ↔ online)

Configurações › Sistema › **Levar tudo para outro painel**:
- **Baixar pacote de dados**: um `.tar.gz` com o banco (marcas, base de conhecimento, layouts, estilos, artes, Cérebro, usuários), os arquivos (logos, mascotes, fontes, layouts, poses) e a chave do painel.
- **Importar pacote de dados**: envia o pacote; o painel reinicia e passa a usar esses dados. O que existia antes fica numa pasta `_antes_importar_*` dentro da pasta de dados.
- Só administrador. Quem importa entra com a senha do painel de origem (as senhas de usuários vão no banco; a senha do dono vem do `.env` de cada painel).
- Isso é separado do GitHub: o repositório leva só o código.
- Reinício: o `iniciar-windows.bat` religa sozinho; no Docker o `restart: unless-stopped` religa.
