// backend/firebaseService.js
const admin = require('firebase-admin');

// Certifique-se de que 'firebase-service-account.json' está no mesmo diretório
const serviceAccount = require('./firebase-service-account.json');

// Inicializa o Firebase Admin SDK APENAS UMA VEZ
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://whatsapp-sales-assistant-default-rtdb.firebaseio.com" // Verifique se esta URL está correta
});

const db = admin.firestore();

console.log('🔥 Firebase Admin inicializado.');

// Exporta 'db' para que outros módulos possam acessá-lo.
// Exporta 'admin' também, pois FieldValue.serverTimestamp() é um método de 'admin.firestore.FieldValue'.
module.exports = { db, admin };
