
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyAZ0yD0O47irib1RX7jqmsPhltyUlU9y0Y",
  authDomain: "whatsapp-sales-assistant.firebaseapp.com",
  projectId: "whatsapp-sales-assistant",
  storageBucket: "whatsapp-sales-assistant.appspot.com",
  messagingSenderId: "656554293566",
  appId: "1:656554293566:web:cc039b4072b6910904946f"
};

console.log('🔥 Iniciando Firebase...');
console.log('📝 Config:', firebaseConfig);

// Verificar se já existe uma instância
let app;
if (getApps().length === 0) {
  console.log('✅ Criando nova instância do Firebase');
  app = initializeApp(firebaseConfig);
} else {
  console.log('♻️ Usando instância existente do Firebase');
  app = getApp();
}

// Inicializar Auth e Firestore
console.log('🔐 Inicializando Auth...');
export const auth = getAuth(app);

console.log('📊 Inicializando Firestore...');
export const db = getFirestore(app);

// Logs de confirmação
console.log('✅ Firebase inicializado com sucesso!');
console.log('🌐 Auth domain:', firebaseConfig.authDomain);
console.log('🆔 Project ID:', firebaseConfig.projectId);
console.log('🔑 API Key presente:', !!firebaseConfig.apiKey);
console.log('📱 App ID:', firebaseConfig.appId);

// Verificar se a instância está funcionando
console.log('🔍 Auth instance:', auth);
console.log('🔍 DB instance:', db);
console.log('🔍 App instance:', app);
