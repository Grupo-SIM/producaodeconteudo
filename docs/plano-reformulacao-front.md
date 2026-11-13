# Plano de implementação: novo front do sistema de produção

Referência visual: `mockup/final/` (computador) e `mockup/celular/` (celular).
Regra geral: cada etapa é feita num branch, testada localmente, mostrada ao dono e só então vai para produção. Nada é apagado: as telas antigas ficam escondidas até a nova estar validada.

## Decisões já fechadas

- **Menu:** Fluxo, Mesa de revisão, Publicação, Marcas, Produtos, Otimização e Cérebro, mais Configurações.
  - No celular: barra embaixo com Fluxo, Revisão, Publicar, Cérebro e Mais.
- **Visual:** premium grafite com destaque champanhe.
- **Chat do gerente:**
  - No computador, fica sempre à direita.
  - No celular, é uma bolinha de chat flutuante, com ponto verde de online e contador de mensagens não lidas. Ao tocar, o chat abre como uma gaveta por cima da tela atual, com "digitando…" e sugestões rápidas.
- **Fluxo:**
  - Uma raia por formato: Carrossel, Estático, Stories de venda, Reels, Matéria de jornal e Post de blog.
  - Cada raia abre e fecha. Fechada, mostra um resumo; aberta, mostra as etapas.
  - Cada raia tem a sua meta por dia e o interruptor Manual/Automático.
  - Botões Lista e Escritório no topo.
- **Status de um item:** etapa do agente, Esperando você, Em ajuste (volta para a etapa do agente com a tag laranja), Parado, Na fila e Finalizado. Roteiro avulso vai direto para Finalizado, sem postagem.
- **Mesa de revisão:** cartões com prévia e os botões Abrir editor e Aprovar.
- **Editores dentro da revisão:**
  - Texto: documento editável.
  - Arte: estilo Canva, com camadas, slides, biblioteca da marca e legenda.
  - Vídeo: estilo CapCut, com cenas, legendas, voz, música e efeitos.
  - Em cima: pedir ajuste ao gerente. Embaixo: Descartar, Salvar e Aprovar.
  - O gerente registra o que você mudou e transforma em regra quando você aprova.
- **Publicação:** modo Manual agora (baixar arquivos e marcar como postado, com link), redes "em breve" e agenda.
- **Marcas e Produtos:** cartões e detalhe. Tudo também pode ser alterado pelo chat.
- **Otimização:** só itens postados, com o ranking e as descobertas do gerente (Virar regra ou Ignorar).
- **Cérebro:**
  - 3D em forma de cérebro, com o Gerente no centro e os agentes em órbitas.
  - Fluxo nos dois sentidos: bolinhas douradas do Gerente para os agentes, losangos coloridos de volta.
  - Passar o mouse destaca; clicar abre os arquivos.
  - Busca acende o caminho.
  - Modos Constelação e Lista como alternativa.
- **Escritório 3D:** pessoas nas mesas, telão com vídeo do YouTube (sem som, em loop), feed ao vivo e contadores. Os cenários de cidade ficam para depois.
- **Extras aprovados:** celular, notificações, histórico de versões, busca geral, e logins com 2 perfis (Dono e Revisor).
- **Regras:** não têm tela própria. Você consulta perguntando ao gerente, e cada regra salva vem com a opção "desfazer" no chat.

## Etapas

### Etapa 0: base (sem mudar nada visível)
- Mapear os status de conteúdo que existem hoje (`contents.status`, `jobs`) para os novos: etapa do agente, Esperando você, Em ajuste, Parado, Na fila e Finalizado.
- Criar a tabela de formatos com as etapas de cada um, a meta por dia e o modo Manual/Automático.
- Ações no servidor:
  - aprovar
  - pedir ajuste (com o motivo)
  - descartar
  - marcar postado (com link)
  - salvar edição (com o que mudou)
- Gravar cada edição como uma nova versão do item; é daí que vem o histórico.
- **Pronto quando:** as ações funcionam pela API e o front atual continua igual.

### Etapa 1: casca nova
- Tema premium (grafite e champanhe), o novo menu e o chat do gerente fixo à direita.
- Versão de celular desde o início: barra embaixo, botão do gerente e telas em uma coluna.
- As telas antigas saem do menu, mas continuam acessíveis por um endereço escondido durante a transição.
- **Pronto quando:** dá para navegar no menu novo, no computador e no celular.

### Etapa 2: Fluxo (lista) e Mesa de revisão
- Fluxo com raias por formato, recolhíveis e atualizadas ao vivo pelo `/api/stream`.
- Aviso de problema no topo, seletor de marca com busca e fixadas, e o botão + Novo conteúdo.
- Mesa de revisão com filtros e aprovação direto no cartão.
- No celular: etapas deslizando para o lado e um item por vez na revisão.
- **Pronto quando:** você consegue acompanhar e aprovar a produção inteira por estas duas telas.

### Etapa 3: revisão de texto
- Editor de texto para roteiro, matéria e post de blog.
- O gerente compara a versão original com a sua e propõe a regra ao aprovar.
- **Pronto quando:** uma edição sua vira uma regra que aparece no chat com a opção "desfazer".

### Etapa 4: Publicação manual
- Lista do que está pronto para postar, com baixar arte e legenda, copiar texto e marcar postado (com link).
- Agenda por formato e marca. Redes em "em breve".
- **Pronto quando:** o item marcado como postado vai para Finalizado.

### Etapa 5: Marcas, Produtos e Configurações
- Marcas (Visual, Voz, Formatos e metas, Contas) e Produtos (ficha, conteúdos feitos), usando os dados que já existem no banco.
- Configurações: assinatura do Claude, logins com perfis Dono e Revisor, lixeira e gasto do mês.
- **Pronto quando:** dá para editar marca e produto pela tela e pelo chat, e o resultado é o mesmo.

### Etapa 6: editor de arte (estilo Canva)
- Abrir a arte do Designer já em camadas. O motor já compõe por camadas (`motor/camadas.mjs`).
- Mexer em texto, fonte, cor, posição e imagem, com as miniaturas dos slides e a biblioteca da marca com sugestões.
- Requisitos básicos: trocar uma imagem por outra, aumentar ou diminuir e recortar elementos, mover, alinhar, duplicar, apagar, mudar a ordem das camadas, reordenar, duplicar ou apagar slides, e desfazer ou refazer.
- Salvar regera o PNG final.
- **Pronto quando:** você corrige um detalhe e o arquivo final sai igual ao que está na tela.

### Etapa 7: editor de vídeo (estilo CapCut)
- Linha do tempo a partir do roteiro de cena que o Editor de vídeo já gera (cenas, legendas, voz, música e efeitos).
- Requisitos básicos de edição, todos obrigatórios:
  - **Cortar:** dividir um trecho em dois no ponto da agulha, apagar um trecho e encurtar ou alongar o começo e o fim de cada cena arrastando a borda.
  - **Reordenar:** arrastar cenas e trechos para mudar a ordem.
  - **Trocar mídia:** trocar uma imagem ou um vídeo de uma cena por outro (da biblioteca da marca, enviado do computador ou do celular, ou pedido ao gerente), mantendo a duração.
  - **Tamanho e posição:** aumentar, diminuir, mover, girar e recortar (enquadrar) imagens, vídeos, legendas e logo dentro do quadro, respeitando as zonas seguras.
  - **Texto e legenda:** editar o texto, a fonte, o tamanho, a cor, o destaque de palavra e o tempo em que entra e sai.
  - **Áudio:** volume separado de voz, música e efeitos; silenciar um trecho; trocar a música; entrada e saída suaves (fade).
  - **Velocidade:** acelerar ou desacelerar um trecho.
  - **Transições:** escolher a transição entre cenas (corte seco, fade, zoom) dentro dos estilos de motion da marca.
  - **Navegação:** desfazer e refazer, zoom na linha do tempo, ímã para encaixar os cortes e prévia em tempo real.
  - **Formato:** trocar entre 9:16, 1:1 e 16:9 quando o formato permitir.
- No celular: as mesmas ações com toque (segurar para mover, pinça para aumentar ou diminuir) e a linha do tempo rolando para o lado.
- Salvar renderiza de novo pelo `motor/render.mjs`.
- **Pronto quando:** um ajuste simples sai no vídeo final sem precisar pedir ao agente.

### Etapa 8: Cérebro 3D
- Cérebro com as regiões por agente, o Gerente no centro e os agentes em órbita.
- Dados reais da pasta `conhecimento/agentes` e das regras do banco.
- Busca que acende o caminho e cartão ao clicar.
- No celular: gaveta de baixo para os arquivos.
- **Pronto quando:** perguntar no chat acende no mapa os arquivos usados.

### Etapa 9: Escritório 3D
- Escritório com os personagens, ligado ao estado real dos agentes (trabalhando, parado, descansando) e às entregas.
- Telão com o vídeo do YouTube, que pode ser ligado e desligado.
- Modo tela cheia.
- **Pronto quando:** o que aparece no escritório bate com o que está no Fluxo.

### Etapa 10: Otimização
- Puxar curtidas, alcance e salvamentos dos itens postados.
- Ranking e descobertas semanais do gerente, com Virar regra e Ignorar.
- **Pronto quando:** existirem ao menos uns 10 posts finalizados por formato para comparar.

### Etapa 11: extras
- Notificações quando um item chega para você ou um agente para.
- Busca geral.
- Histórico de versões com a opção "voltar".

### Etapa 12: sincronizar o treino
- O que o gerente aprende no sistema aparece na pasta `conhecimento/` (GitHub), e o que é treinado lá chega ao gerente.
- Hoje não está confirmado se esse caminho existe. Primeiro verificar, depois ligar os dois lados.

### Depois (fora deste plano)
- Postagem automática nas redes: Instagram, Facebook, TikTok, YouTube, Pinterest e site.
- Modo Automático por formato: o revisor aprova sozinho quando o dono der a palavra.
- Cenários de cidade no escritório, com modelos 3D melhores.

## Ordem e dependências
- 0 → 1 → 2 → 3 → 4 é o caminho mínimo para usar o sistema novo no dia a dia.
- 5 pode andar junto com a 4.
- 6 e 7 são as maiores e dependem da 3.
- 8, 9 e 10 são independentes entre si.
