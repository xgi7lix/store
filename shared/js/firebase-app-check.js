/**
 * firebase-app-check.js - تفعيل Firebase App Check لحماية قاعدة البيانات
 * يجب تفعيل هذا الملف بعد إعداد App Check في Firebase Console
 * 
 * خطوات التفعيل:
 * 1. اذهب إلى Firebase Console > Project Settings > App Check
 * 2. أنشئ مفتاح App Check جديد
 * 3. اختر "reCAPTCHA v3" أو "App Attest" (للأجهزة المحمولة)
 * 4. انسخ مفتاح reCAPTCHA وضعه في متغير البيئة
 * 5. فعّل App Check في Firestore Rules
 */

(function() {
    'use strict';

    // ✅ تهيئة Firebase App Check
    async function initializeAppCheck() {
        try {
            // انتظر تحميل Firebase Modules
            if (!window.firebaseModules) {
                console.warn('⏳ [AppCheck] Firebase Modules غير محملة بعد، سيتم إعادة المحاولة...');
                setTimeout(initializeAppCheck, 1000);
                return;
            }

            // استيراد App Check
            const { initializeAppCheck: initAppCheck, ReCaptchaV3Provider } = await import(
                'https://www.gstatic.com/firebasejs/10.7.1/firebase-app-check.js'
            );

            // الحصول على App Instance
            const app = window.firebaseModules.getApp ? 
                window.firebaseModules.getApp() : 
                window.firebaseInstance?.app;

            if (!app) {
                console.warn('⏳ [AppCheck] Firebase App غير مهيأ بعد');
                setTimeout(initializeAppCheck, 1000);
                return;
            }

            // تفعيل App Check مع reCAPTCHA v3
            const reCaptchaKey = window.APP_ENV?.RECAPTCHA_V3_KEY || 
                                 window.RECAPTCHA_V3_KEY ||
                                 ''; // يجب وضع المفتاح هنا أو في متغيرات البيئة

            if (!reCaptchaKey) {
                console.warn('⚠️ [AppCheck] مفتاح reCAPTCHA v3 غير موجود - App Check معطل');
                console.log('💡 [AppCheck] لتفعيل App Check: أضف RECAPTCHA_V3_KEY إلى env-config.js');
                return;
            }

            // تفعيل App Check
            const appCheck = initAppCheck(app, {
                provider: new ReCaptchaV3Provider(reCaptchaKey),
                isTokenAutoRefreshEnabled: true
            });

            console.log('✅ [AppCheck] تم تفعيل Firebase App Check بنجاح');
            window.firebaseAppCheck = appCheck;
            window.dispatchEvent(new CustomEvent('app-check-ready'));

        } catch (error) {
            console.error('❌ [AppCheck] خطأ في تفعيل App Check:', error);
            console.log('💡 [AppCheck] تأكد من تفعيل App Check في Firebase Console');
        }
    }

    // ✅ انتظر firebase-unified-ready ثم فعّل App Check
    if (window.firebaseInstance) {
        initializeAppCheck();
    } else {
        window.addEventListener('firebase-unified-ready', initializeAppCheck, { once: true });
    }

    // ✅ تصدير الدالة للاستخدام اليدوي إذا لزم الأمر
    window.initializeAppCheck = initializeAppCheck;

    console.log('✅ firebase-app-check.js تم تحميله');

})();
