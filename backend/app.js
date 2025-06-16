// app.js (Arquivo Principal do seu Backend)
const admin = require('firebase-admin');
const { listenForOperatorChanges } = require('./botManager');
const { setupDailyTasks } = require('./taskScheduler');
// Importe outras dependências como Express, se você tiver uma API REST para o frontend
// const express = require('express');
// const app = express();

// 1. Configurar Firebase Admin SDK (APENAS UMA VEZ NO SEU APP)
const serviceAccount = require('./firebase-service-account.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://whatsapp-sales-assistant-default-rtdb.firebaseio.com"
});
const db = admin.firestore(); // Exporte 'db' através de um firebaseService.js

// Criar um arquivo firebaseService.js
// export const db = admin.firestore();

console.log('🔥 Firebase Admin inicializado.');

// 2. Callback para enviar o QR Code ao Frontend
// ESTA É A PARTE QUE VOCÊ PRECISARÁ IMPLEMENTAR A LÓGICA DE COMUNICAÇÃO COM O SEU FRONTEND
function sendQrCodeToFrontend(whatsappNumber, base64Qrimg, asciiQR, urlCode) {
    console.log(`>>> Enviando QR Code para o frontend para o número: ${whatsappNumber}`);
    // Implemente a lógica para enviar este QR Code para o seu frontend.
    // Isso pode ser via:
    // - WebSockets (recomendado para tempo real)
    // - Uma API REST que o frontend faz polling (menos eficiente, mas possível)
    // Exemplo conceitual (usando WebSockets com Socket.IO):
    // io.emit('qrCodeGenerated', { whatsappNumber, base64Qrimg, asciiQR, urlCode });
    // Por enquanto, vamos apenas logar e o usuário pode escanear o QR no console se headless for false.
    console.log('ESCANEAR ESTE QR CODE (ou use o URL):\n', asciiQR);
    console.log('URL de conexão:', urlCode);
}

// 3. Iniciar o gerenciador de bots (escutando mudanças no Firestore)
listenForOperatorChanges(sendQrCodeToFrontend);

// 4. Configurar as tarefas agendadas (diárias)
setupDailyTasks();

// Opcional: Se você tiver um servidor Express para sua API
// app.listen(3000, () => {
//     console.log('🚀 Backend rodando na porta 3000');
// });

console.log('Aplicação de gerenciamento de bots iniciada.');
