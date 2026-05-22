/**
 * config.js - ملف الإعدادات مع قيمة افتراضية للمفتاح
 */

// انتظار تحميل env-config.js إذا لزم الأمر
const SECURE_CONFIG = window.APP_ENV || {};

window.FIREBASE_CONFIG = {
    apiKey: SECURE_CONFIG.FIREBASE_API_KEY || "AIzaSyB1vNmCapPK0MI4H_Q0ilO7OnOgZa02jx0",
    authDomain: "queen-beauty-b811b.firebaseapp.com",
    projectId: "queen-beauty-b811b",
    storageBucket: "queen-beauty-b811b.firebasestorage.app",
    messagingSenderId: "418964206430",
    appId: "1:418964206430:web:8c9451fc56ca7f956bd5cf"
};

// مفتاح VAPID
window.FCM_VAPID_KEY = SECURE_CONFIG.FCM_VAPID_KEY || "BOx1ydjk5Cv9pIzuACGmP4on1cBPaa9stLtOzJNNoq2akYpCvSYrqAdXt-SwoCoTOrrCHrbp2t9AcFhFj1wSdRI";

console.log("🔐 config.js تم تحميله - apiKey موجود:", !!window.FIREBASE_CONFIG.apiKey);