# Biblioteca Central — Agentes SIM

Serviço separado que guarda o material oficial (conhecimento dos agentes, mídias, templates de arte e estilos de vídeo) e entrega para todos os painéis white label. Quando você atualiza um item aqui, cada painel cliente recebe a nova versão sozinho (ao iniciar e a cada 6 horas, ou no botão "Atualizar agora").

Sem dependências: só Node 22+.

## Como funciona
- Cada item tem uma versão (`rev`). O painel cliente pede só o que mudou.
- Cada cliente tem uma **chave de licença**. Cliente suspenso ou com data de validade vencida para de receber atualizações, mas **mantém o que já baixou**.
- O painel **matriz** (o seu) publica o material para cá com o `ADMIN_TOKEN` (Configurações › Biblioteca Central › Publicar).
- Também dá para enviar e editar itens direto no painel da Biblioteca (aba Itens).
- Item retirado aqui é retirado dos clientes na próxima sincronização. Conhecimento que o cliente editou não é sobrescrito.

## Instalar na VPS (Ubuntu)
1. Node 22:
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt install -y nodejs nginx
   ```
2. Copie a pasta `biblioteca-central` para `/opt/biblioteca-central` e crie o usuário:
   ```bash
   sudo useradd -r -s /usr/sbin/nologin biblioteca
   sudo chown -R biblioteca:biblioteca /opt/biblioteca-central
   ```
3. Configure o `.env` (copie de `.env.example`):
   - `ADMIN_PASSWORD`: senha do painel da Biblioteca.
   - `ADMIN_TOKEN`: token longo, gere com `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
   - `HOST=127.0.0.1` e `HTTPS=1` (fica atrás do nginx).
4. Serviço que liga sozinho:
   ```bash
   sudo cp biblioteca-central.service /etc/systemd/system/
   sudo systemctl enable --now biblioteca-central
   ```
5. Domínio e HTTPS: aponte `biblioteca.seudominio.com.br` para o IP da VPS, copie `nginx-exemplo.conf` para `/etc/nginx/sites-enabled/biblioteca`, troque o domínio e rode:
   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   sudo apt install -y certbot python3-certbot-nginx && sudo certbot --nginx -d biblioteca.seudominio.com.br
   ```
6. Abra `https://biblioteca.seudominio.com.br` e entre com a senha.

## Ligar o painel matriz (o seu)
No `.env` do painel (`C:\grupo-sim\.env`):
```
BIBLIOTECA_URL=https://biblioteca.seudominio.com.br
BIBLIOTECA_CHAVE=<chave do cliente "Matriz" criada na aba Clientes>
BIBLIOTECA_ADMIN=<o mesmo ADMIN_TOKEN da Biblioteca>
```
Reinicie o painel. Em Configurações › Biblioteca Central aparece o botão **Publicar** com a lista do que pode ir para a Central.

## Ligar um cliente white label
1. Na Biblioteca, aba **Clientes › Novo cliente**: nome, contato, plano e validade (opcional).
2. A tela mostra a chave e as duas linhas para o `.env` do cliente:
   ```
   BIBLIOTECA_URL=https://biblioteca.seudominio.com.br
   BIBLIOTECA_CHAVE=bc_...
   ```
   O cliente **não** recebe o `BIBLIOTECA_ADMIN`.
3. Reinicie o painel do cliente. Em poucos segundos ele baixa tudo.

## Cobrança recorrente
- **Suspender** (aba Clientes) corta as atualizações na hora. O cliente fica com o que já tinha.
- **Validade**: preencha a data até onde está pago; ao vencer, as atualizações param sozinhas.
- **Trocar a chave** (abra o cliente) invalida a antiga (use se a chave vazar).
- A aba Resumo mostra quem está em dia (sincronizou recentemente) e a versão de cada painel.

## Backup
Tudo fica em `dados/` (banco `biblioteca.db` e a pasta `arquivos`). Copie essa pasta com frequência.
