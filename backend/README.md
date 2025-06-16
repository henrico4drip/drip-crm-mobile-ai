
# CRM ALRA - Backend com Venom-Bot

Este é o backend do CRM ALRA que utiliza Venom-Bot para integração com WhatsApp Web.

## 📋 Pré-requisitos

1. Node.js instalado (versão 16 ou superior)
2. Chrome/Chromium instalado
3. Chave de serviço do Firebase (firebase-service-account.json)
4. **IMPORTANTE**: Configurar seu número de WhatsApp no painel CRM primeiro

## 🚀 Instalação

1. Entre na pasta backend:
```bash
cd backend
```

2. Instale as dependências:
```bash
npm install
```

3. Configure o Firebase:
   - Vá no Firebase Console → Configurações do Projeto → Contas de Serviço
   - Clique em "Gerar nova chave privada"
   - Baixe o arquivo JSON e renomeie para `firebase-service-account.json`
   - Coloque o arquivo na pasta `backend/`

4. **Configure seu WhatsApp no CRM**:
   - Faça login no painel CRM
   - Clique em "Configurar WhatsApp" (botão amarelo no canto superior direito)
   - Insira seu número no formato: `11999999999` (apenas números, 10-11 dígitos)
   - Ou com código do país: `5511999999999`
   - Clique em "Salvar" e aguarde a confirmação

## ▶️ Como iniciar

```bash
npm start
```

Ou para desenvolvimento com auto-reload:
```bash
npm run dev
```

## 📱 Primeiro uso

1. **Configure seu número no CRM primeiro** (passo 4 acima)
2. Execute o comando `npm start`
3. Um QR Code aparecerá no terminal
4. Abra o WhatsApp no seu celular
5. Vá em "Dispositivos conectados" → "Conectar um dispositivo"
6. Escaneie o QR Code
7. Aguarde as mensagens:
   - "✅ Venom-Bot conectado com sucesso!"
   - "👤 Operador identificado: seu-email@exemplo.com"

## 🔧 Como funciona

- O bot identifica automaticamente qual usuário está conectado pelo número do WhatsApp
- Escuta todas as mensagens recebidas no WhatsApp
- Filtra apenas mensagens de clientes individuais (ignora grupos e próprias mensagens)
- Cria automaticamente um registro de cliente no Firestore
- Salva cada mensagem como uma tarefa pendente associada ao usuário correto
- Cada operador só vê as mensagens dos seus próprios clientes

## 🛠️ Configurações importantes

### Formato do número de telefone

Configure seu WhatsApp no formato: `11999999999` (apenas números)
- 11 = DDD
- 999999999 = número

Ou com código do país: `5511999999999`
- 55 = código do Brasil
- 11 = DDD
- 999999999 = número

O sistema tenta várias variações automaticamente, mas é melhor usar o formato padrão.

### Múltiplos operadores

Para múltiplos operadores:
1. Cada operador cria sua conta no CRM
2. Cada um configura seu próprio número de WhatsApp
3. Cada um roda uma instância do Venom-Bot no seu computador
4. As mensagens são automaticamente associadas ao operador correto

## 📝 Logs importantes

- `👤 Operador identificado` = usuário encontrado com sucesso
- `⚠️ Nenhum usuário encontrado` = número não configurado no CRM
- `📨 Nova mensagem recebida` = mensagem do cliente processada
- `✅ Mensagem processada` = tarefa criada com sucesso

## ⚠️ Solução de problemas

### "Nenhum usuário encontrado para o número"
1. Verifique se configurou o número no painel CRM
2. Use o formato correto: `11999999999` (apenas números)
3. Verifique se está logado com a conta correta no CRM
4. Recarregue a página do CRM após salvar o número

### Mensagens não aparecem no CRM
1. Verifique se o operador foi identificado nos logs
2. Confirme que as mensagens não são de grupos
3. Verifique se o Firebase está conectado corretamente
4. Recarregue a página do CRM para ver as novas tarefas

### Erro ao salvar telefone no CRM
1. Use apenas números: `11999999999`
2. Não use símbolos: `+`, `-`, `(`, `)`, espaços
3. Aceita 10 ou 11 dígitos
4. Recarregue a página e tente novamente

## ⚠️ Importante

- Configure seu número no CRM **antes** de iniciar o Venom-Bot
- Mantenha o Chrome aberto enquanto o bot estiver rodando
- Não faça logout manual do WhatsApp Web
- Para parar o bot, use Ctrl+C no terminal
- As tarefas aparecem no painel CRM em tempo real

## 🚀 Teste rápido

1. Configure número no CRM
2. Inicie o Venom-Bot
3. Envie uma mensagem para seu WhatsApp de outro número
4. Verifique se aparece como tarefa pendente no CRM
