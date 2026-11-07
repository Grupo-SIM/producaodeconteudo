<!-- modo: auto -->
# Motion — referências analisadas, áudio, efeitos e fluxo de produção

> Observação do sistema Agentes SIM: o motor de vídeo renderiza sempre em 30 fps e só entende o vocabulário do guia de SPEC (look, decor, in, items orb/ring/chart/card/profile/gradientWord/counter/img, text mode stack/ticker/word). Campos marcados com ★ não existem no motor: use o que existe e traduza o resto em imagem da biblioteca Motion. O herói visual de cada cena vem da biblioteca (img pelo nome exato).

# 1. O que foi analisado (e o que NÃO foi)

Foram enviados 6 arquivos, mas dois são idênticos byte a byte (o de 18.45.46 e o de 18.48.20), então são **5 vídeos distintos**.

| Código | Arquivo (WhatsApp 2026-10-14) | Referência | Duração | Resolução / fps |
|---|---|---|---|---|
| M1 | at 18.44.31 | SocialHeaven (agência de marketing) | 77,8 s | 720x1280, 30 fps |
| M2 | at 18.45.46 (= 18.48.20) | rami.visualz (análise de edição de um empresário) | 28,1 s | 720x1280, 30 fps |
| M3 | at 18.46.29 | CapitalX (documentário de negócios) | 37,5 s | 720x1280, 30 fps |
| M4 | at 18.47.04 | EarnEdits (diorama de papel) | 29,0 s | 720x1280, **15 fps** |
| M5 | at 18.47.39 | EarnEdits (história retrô) | 26,3 s | 720x1280, 30 fps |

**Medido com ferramenta:** duração, resolução, fps, cortes de cena, duração média de plano, volume (LUFS), pico, presença de voz, estrutura espectral do áudio, coincidência entre cortes e rajadas de som.

**Visto por mim nos quadros:** tudo sobre imagem, tipografia (família estimada pela aparência), cores (hex estimado a partir dos quadros, sem conta-gotas profissional), animação, elementos e transições.

**Não foi possível:**
- Transcrever a narração palavra por palavra. O texto de cada cena vem do que aparece escrito na tela, que nesses vídeos acompanha a fala.
- Separar música, voz e efeitos em faixas. As conclusões de áudio são de detecção automática e valem como tendência.
- Confirmar o nome exato das fontes. Onde digo "tipo X", é semelhança visual.

Os vídeos usam pessoas reais, marcas e personagens de terceiros. Aqui eu aprendo o **estilo** (composição, ritmo, tipografia, movimento). O agente nunca deve reproduzir essas pessoas, personagens ou logos (ver seção 12.3).

# 2. Quadro comparativo

| Item | M1 Agência Vermelho | M2 Densidade Cinética | M3 Documentário Premium | M4 Diorama Teatral | M5 Retrô CRT |
|---|---|---|---|---|---|
| Plano médio (entre cortes fortes) | 3,1 s | 2,0 s | 2,0 s | 2,9 s | **0,9 s** |
| Cortes fortes detectados | 24 em 78 s | 13 em 28 s | 18 em 38 s | 9 em 29 s | 29 em 26 s |
| Fundo dominante | preto e branco alternados | preto, grafite e papel cinza | cinza frio, madeira, preto | cartolina, cortina, azul noite | cinza papel com linhas |
| Cor de acento | vermelho | vermelho neon | amarelo | vermelho + dourado, final amarelo | só 1 cor por objeto |
| Texto | caixa-alta bold + itálico leve | script caligráfico + sans bold | serifa itálica (+ sans bold no fim) | caixa-alta pesada com contorno | serifa minúscula pequena |
| Herói visual | mockup de celular, estátua vermelha, duotone | recorte halftone P&B, objetos 3D | retrato/foto de cena, jornais, notas | cartas, molduras, recortes de papel | imagem IA vintage, mãos, ícones 3D |
| Loudness integrado | **-26 LUFS (baixo)** | -14,7 LUFS | -14,2 LUFS | -14,4 LUFS | -14,3 LUFS |
| Pico real | -3,2 dBTP | +0,6 dBTP (estourado) | 0,0 dBTP | -0,2 dBTP | -0,1 dBTP |

Leituras:
- Quatro dos cinco estão masterizados em torno de **-14 LUFS**, o padrão de redes sociais. O M1 está quieto (-26 LUFS), provavelmente exportado sem masterização. O agente deve seguir o -14, nunca o M1.
- Três dos cinco encostam em 0 dBTP. Isso é risco de distorção. O agente deve entregar com pico máximo de -1 dBTP.
- O M5 corta quase uma vez por segundo. Mesmo nos planos "longos" dos outros, **algo novo entra a cada 0,4 a 0,8 s** (palavra, objeto, destaque).

# 4. Áudio: o que foi medido e o que o agente deve fazer

**Medido nos 5 vídeos:**
- Há **voz narrando em todos** (a modulação silábica da fala aparece na maior parte do tempo) sobre música com muito grave. O espectro do M2 mostra voz contínua com base grave forte.
- Os cortes **não têm um som próprio em todos os cortes.** Rajadas de ruído agudo (tipo whoosh) coincidem com ~40 a 65% dos cortes no M2 (6 de 13), M3 (12 de 18) e M5 (12 de 29). Impactos graves coincidem com 8 de 24 cortes no M1 e 4 de 13 no M2. O M4 é conduzido pela música (1 de 9). Isso é detecção automática, aproximada.
- No M2 há um tom contínuo em torno de 2,2 kHz perto do CTA final (26 a 28 s). Pode ser um "ping" de notificação ou uma nota da música. Não é confirmado.
- Volume: 4 de 5 em -14 LUFS (ver seção 2).

**Regras que o agente segue (derivadas do medido + boas práticas):**
- Mix final **-14 LUFS integrado**, pico real **máximo -1 dBTP**. Receita testada de duas passagens com compressor e limitador na seção 13, passo 7.
- Voz sempre à frente. Trilha a ~-20 dB abaixo da voz, com ducking (abaixa quando a voz fala).
- SFX só nos momentos fortes: entrada do herói, transição, palavra-chave, número, CTA. Nem todo corte precisa de som.
- Nada de música com direitos autorais. Trilha própria ou de biblioteca livre.

**Biblioteca de SFX sintetizados (testados no ffmpeg, saem em 48 kHz):**

| Som | Quando usar | Receita ffmpeg |
|---|---|---|
| tick | cada palavra / typewriter | `aevalsrc='0.35*sin(2*PI*2600*t)*exp(-140*t)+0.2*sin(2*PI*1100*t)*exp(-70*t)':s=48000:d=0.1` |
| clique | cursor clicando | `aevalsrc='0.5*sin(2*PI*1800*t)*exp(-220*t)+0.3*sin(2*PI*700*t)*exp(-90*t)':s=48000:d=0.12` |
| whoosh | transição, objeto entrando | `anoisesrc=d=0.5:c=pink:a=0.5` + `-af "highpass=f=400,lowpass=f=6000,volume='0.15+1.7*sin(PI*t/0.5)':eval=frame,afade=t=out:st=0.38:d=0.12"` |
| papel | cartão, jornal, polaroid deslizando | `anoisesrc=d=0.18:c=white:a=0.6` + `-af "highpass=f=1500,lowpass=f=9000,afade=t=in:d=0.01,afade=t=out:st=0.06:d=0.12"` |
| impacto | soco de palavra-chave, número, virada | `aevalsrc='0.8*sin(2*PI*(48+140*exp(-14*t))*t)*exp(-4.2*t)+0.2*sin(2*PI*(900+2000*exp(-40*t))*t)*exp(-30*t)':s=48000:d=1.1` |
| riser | antes de uma virada, 1 a 1,5 s | `anoisesrc=d=1.4:c=white:a=0.5` + `-af "highpass=f=300,lowpass=f=9000,volume='0.05+1.6*pow(t/1.4,2.2)':eval=frame,afade=t=out:st=1.3:d=0.1"` |
| ding | notificação, CTA, número ganho | `aevalsrc='0.4*sin(2*PI*1568*t)*exp(-7*t)+0.25*sin(2*PI*2349*t)*exp(-9*t)':s=48000:d=0.9` |
| glitch | transição glitch RGB | `anoisesrc=d=0.3:c=white:a=0.6` + `-af "highpass=f=800,tremolo=f=38:d=1,acrusher=bits=6:mix=0.7,afade=t=out:st=0.22:d=0.08"` |

Níveis sugeridos na mistura quando há voz: tick 0,35, clique 0,5, whoosh 0,45, papel 0,4, impacto 0,55, riser 0,35, ding 0,3, glitch 0,35.

Para vídeos de maior qualidade, o ideal é trocar estes sintetizados por samples profissionais livres de direitos, mantendo os mesmos momentos de uso.

# 10. Biblioteca de efeitos e transições (parâmetros para implementar)

Valores iniciais derivados do que foi visto nos 5 vídeos (tempos estimados pelos quadros a 2 fps). Ajustar olhando o resultado.

## 10.1 Transições

| Nome | Como é | Duração | Easing | Estilos |
|---|---|---|---|---|
| zoomThrough (moldura) | a câmera avança até a moldura preencher a tela; a imagem de dentro vira a cena seguinte, com blur crescente no fim | 0,5 a 0,8 s | inOutCubic | M3, M4 |
| whipBlur | a cena atual sai para o lado com motion blur forte, a próxima entra do lado oposto | 0,3 a 0,45 s | inOutCubic | M1, M2, M3 |
| circleWipe | círculo com anel colorido cresce do centro revelando a próxima cena | 0,45 a 0,5 s | inOutCubic | M1 |
| irisOut | vinheta elíptica fecha até preto (final) | 0,8 a 1,0 s | inCubic | M1 |
| flash | quadro branco ou colorido por 2 a 3 quadros | 0,1 s | linear | M2, M4 |
| glitchRGB | separa os canais R/G/B por 2 a 6 px e treme em 3 quadros | 0,15 a 0,3 s | linear | M2, M5 |
| lightStreaks | forma (logo) se abre em listras verticais coloridas e vira flash branco | 0,8 a 1,2 s | outExpo | M3 |
| swapArrows | objeto A gira em 3D e dá lugar ao objeto B com ícone de seta circular azul no meio | 0,5 s | outBack | M5 |
| breathCut | corte para papel cinza liso com 1 a 3 palavras | 0,6 a 1,0 s | corte seco | M3, M5 |
| beatCut | corte seco coincidindo com a batida da música | 0 | — | M4, M5 |
| dimToBlack | escurece com blur até preto antes de nova cena | 0,4 s | inCubic | M1, M3 |

## 10.2 Texto e destaque

| Nome | Como é | Estilos |
|---|---|---|
| wordBlurIn | palavra entra em blur 12 px → 0, sobe 10 a 20 px, opacidade 0→1 | todos |
| typewriterGhost | cada letra aparece com uma letra "fantasma" cinza embaçada que troca antes de fixar | M1, M5 |
| boxWipe | caixa de cor (vermelha) varre da esquerda por trás da palavra, depois a palavra fica por cima | M1, M2 |
| ellipseDraw | elipse desenhada à mão em torno da palavra-chave, traço animado em 0,35 a 0,45 s (stroke-dashoffset) | M3, M4, M5 |
| underlineSweep | sublinhado fino que varre da esquerda | M3 |
| tornPaperBox | caixa de papel rasgado amarelo atrás de uma frase curta | M3 |
| neonGlow | texto vermelho com glow de 16 e 60 px, pulsando levemente | M2 |
| chromaFringe | duplicar o texto em ciano e vermelho com offset de 1 a 3 px | M2, M5 |
| behindSubject | o título é desenhado atrás do personagem recortado (máscara) | M4 |
| scaleHierarchy | palavra leve + palavra pesada na mesma linha, 1:1,5 a 1:1,8 | M1, M2, M3 |
| counterRoll | número que rola de baixo ($711 → $1.000) | M1 |
| lineDraw | gráfico de linha que desenha ao longo de 0,8 s | M1, M2 |

## 10.3 Câmera e textura

| Nome | Parâmetros | Estilos |
|---|---|---|
| pushIn | scale 1,00 → 1,06 a 1,10 por plano | todos |
| dollyAcross | translate horizontal lento sobre o mural | M2 |
| parallax3 | camadas se movem 1x / 1,5x / 2x | M4 |
| handheld | micro-tremor de ±2 px | M3 |
| vignette | forte: transparente 55% → preto 35% nas bordas | M2, M3, M5 |
| grain | ruído 5 a 8% overlay, atualiza a cada 1/24 s | todos |
| halftone | trama de pontos 8 a 13 px no sujeito | M2 |
| scanlines | linhas horizontais 2 px a 20 a 30% | M5 |
| duotone | mapear sombras/realces para preto e vermelho `#E10600` | M1 |
| bwToColor | cena começa dessaturada e satura em 0,2 s no corte | M3, M5 |

## 10.4 Biblioteca de objetos (por categoria)

- **Mockups:** celular em silhueta que se preenche; leque de 3 celulares; celular sobre mesa de madeira; celular sobre jornais antigos; mão segurando celular
- **UI:** card vermelho com gráfico; caixa "Results" com linhas verticais ligando; quadrados brancos com ícones; barra de busca digitando; cursor de mão clicando; balão de chat; numeral cromado "#N"
- **Papelaria:** cartas de baralho/tarô; jornais; polaroid; papel quadriculado; fita adesiva; mural de cortiça com fio vermelho; papel rasgado amarelo
- **Molduras e cenografia:** moldura dourada reta e oval, correntes, cortinas, bilheteria, piso xadrez, ondas de papel, estrelas penduradas, lanternas, relógio de bolso
- **3D e halftone:** olho, orelha, cérebro, anzol, diamante, quebra-cabeça, dinheiro, estátua clássica, figura 3D de escritório
- **Mãos e gestos:** mãos trocando moedas, mão com moeda, mão com carta, cursor
- **Ambiente:** folhas de monstera/bordo desfocadas, ramos de cerejeira, pétalas pretas, notas de dólar desfocadas, matrix, parede de dados

Regra do Fernando para o sistema: **sem emoji em interface**. Nos vídeos, use ícone vetorial (SVG) em vez de emoji sempre que possível; o emoji da referência M1 (facepalm) deve virar ícone ou ilustração própria.

# 11. O que o motor motion2d ainda precisa (lacunas reais e prioridade)

O motor atual (`engine.html`, `render.mjs`, `stills.mjs`) cobre o Estilo 1 (tipografia cinética). Para entregar os estilos M1 a M5 com este nível, falta:

| Prioridade | Capacidade | Necessária para |
|---|---|---|
| 1 | Formato configurável (1080x1920 e 1920x1080) e fps por estilo (15 para M4) | todos, Igreja Renovada |
| 1 | Sistema de camadas com máscara (título atrás do sujeito) e parallax | M4, M3 |
| 1 | Texto com múltiplos estilos por linha (família, peso, itálico, cor, tamanho relativo) | todos |
| 1 | ellipseDraw, underlineSweep, boxWipe, tornPaperBox | M1 a M5 |
| 2 | Efeitos de imagem: chromaFringe, halftone, scanlines, duotone, bwToColor | M1, M2, M5, M3 |
| 2 | Transições zoomThrough, glitchRGB, lightStreaks, irisOut | M3, M4, M5, M1 |
| 2 | phoneBuild (celular que se monta), redCard + counterRoll + lineDraw | M1 |
| 2 | swapArrows (troca de objeto) | M5 |
| 3 | Mural de cortiça com dolly e fios | M2 |
| 3 | Cursor com clique e barra de busca digitando | M1, M5 |
| 3 | Mixagem profissional: ducking real da trilha pela voz e normalização -14 LUFS / pico -1 dBTP | todos |
| 3 | Fonte própria por estilo (carregar serifa itálica, script, condensada, slab) | todos |

Quando o Fernando aprovar cada capacidade implementada, o agente registra como aprendizado e passa a usá-la.

# 13. Fluxo de produção e QA (comandos)

1. **Briefing** (modelo da seção 13.1) → **roteiro em tabela** → aprovação.
2. **Voz:** ElevenLabs, um take por cena, português do Brasil. Medir cada take: `ffprobe -v error -show_entries format=duration -of csv=p=0 take01.mp3`.
3. **Imagens:** fal.ai com os prompts do estilo; remover fundo quando for item isolado.
4. **Spec** do motor com `dur` de cada cena vindo da duração do áudio.
5. **Stills:** `node stills.mjs spec.json previa/` e olhar `previa/sheet.png`. Corrigir texto cortado, sobreposição, cena vazia, palavra-chave sem destaque.
6. **Render:** `node render.mjs spec.json bruto.mp4 --voice voz.mp3 --music trilha.mp3`.
7. **Normalizar (2 passagens, testado):** uma passagem só de `loudnorm` NÃO atinge -14 quando a mistura tem picos altos (no teste saiu em -17 LUFS). Receita que funcionou (resultado -14,5 LUFS):
   - Pré-processo: `PRE="acompressor=threshold=-20dB:ratio=3:attack=5:release=80:makeup=4,alimiter=limit=0.85:level=disabled"`
   - Medir: `ffmpeg -i bruto.mp4 -af "$PRE,loudnorm=I=-14:TP=-1:LRA=9:print_format=json" -f null -` (anote input_i, input_tp, input_lra, input_thresh, target_offset)
   - Aplicar: `ffmpeg -i bruto.mp4 -af "$PRE,loudnorm=I=-14:TP=-1:LRA=9:measured_I=...:measured_TP=...:measured_LRA=...:measured_thresh=...:offset=...:linear=true" -c:v copy -c:a aac -b:a 192k saida.mp4`
8. **Medir:** `ffmpeg -i saida.mp4 -af ebur128=peak=true -f null -` (esperado: I entre -15 e -13 LUFS, pico ≤ -1 dBTP; se o pico passar, baixe o `limit` do alimiter para 0.8).
9. **Conferir:** `ffmpeg -i saida.mp4 -vf "fps=2,scale=180:-1,tile=10x6" -frames:v 1 sheet.png` e abrir a imagem.
10. **Entregar** com uma linha de contexto e o checklist do estilo.

## 13.1 Modelo de pedido (briefing)

```
MARCA / MASCOTE (arquivo):
ESTILO (M1 a M5):
FORMATO (1080x1920 | 1920x1080) e DURAÇÃO:
COR DE ACENTO (hex) e PALETA:
NARRAÇÃO (texto exato ou "criar"):
TRILHA (arquivo sem direitos autorais):
CTA FINAL (palavra para comentar / site):
LOGO (arquivo):
PROIBIDO (marcas, números, promessas):
```

# 14. Limites deste aprendizado e próximos passos

- Este arquivo é a melhor leitura possível de **5 vídeos**. Cada estilo tem uma receita e um spec proposto, mas só o Estilo 1 (tipografia cinética) tem motor pronto; os campos marcados com ★ nos specs ainda não existem no motor.
- O **Hard copy** (estilo oficial do Agentes SIM) não tem referência aqui. Para aprender, mande vídeos dele.
- Para subir o nível de cada estilo, o melhor insumo são **mais exemplos do mesmo estilo** (2 a 3 por estilo) e a **transcrição da narração** (ou o próprio texto da narração) de cada um.
- Próximo passo técnico sugerido: implementar no motor as lacunas de prioridade 1 da seção 11 e renderizar um vídeo de teste de cada estilo com o mascote de uma marca (por exemplo, a Central do Marketing), para o Fernando aprovar ou reprovar com motivo.
