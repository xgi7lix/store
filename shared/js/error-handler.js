// error-handler.js - معالجة الأخطاء الموحدة (رسائل محسنة)

(function() {
    'use strict';

    if (window.ErrorHandler) return;

    const ErrorHandler = {
        handle: function(error, context = '') {
            console.error(`❌ [${context}]`, error);

            let userMessage = '⚠️ حدث خطأ غير متوقع. يرجى المحاولة مرة أخرى أو التواصل مع الدعم.';
            
            if (error.code) {
                switch (error.code) {
                    case 'permission-denied':
                        userMessage = '⚠️ ليس لديك صلاحية للقيام بهذه العملية.';
                        break;
                    case 'unavailable':
                        userMessage = '📡 الخدمة غير متاحة حالياً. يرجى المحاولة لاحقاً.';
                        break;
                    case 'network-request-failed':
                        userMessage = '📡 تعذر الاتصال بالإنترنت. يرجى التحقق من اتصالك والمحاولة مرة أخرى.';
                        break;
                    case 'not-found':
                        userMessage = '🔍 العنصر المطلوب غير موجود، ربما تم حذفه.';
                        break;
                    case 'already-exists':
                        userMessage = '⚠️ هذا العنصر موجود بالفعل.';
                        break;
                    case 'invalid-argument':
                        userMessage = '⚠️ البيانات المدخلة غير صالحة. يرجى التحقق منها.';
                        break;
                    case 'deadline-exceeded':
                        userMessage = '⏱️ انتهت مهلة الاتصال. يرجى المحاولة مرة أخرى.';
                        break;
                    case 'resource-exhausted':
                        userMessage = '⚠️ تم تجاوز الحد المسموح من الطلبات. يرجى الانتظار قليلاً.';
                        break;
                    case 'unauthenticated':
                        userMessage = '🔒 يرجى تسجيل الدخول للمتابعة.';
                        break;
                }
            } else if (error.message) {
                if (error.message.includes('network') || error.message.includes('Network')) {
                    userMessage = '📡 مشكلة في الاتصال بالإنترنت. تأكد من اتصالك وحاول مجدداً.';
                } else if (error.message.includes('timeout') || error.message.includes('Timeout')) {
                    userMessage = '⏱️ انتهت مهلة الاتصال. الخادم يستغرق وقتاً طويلاً للاستجابة.';
                } else if (error.message.includes('firestore') || error.message.includes('Firestore')) {
                    userMessage = '⚠️ مشكلة في قاعدة البيانات. يرجى المحاولة لاحقاً.';
                }
            }

            if (window.CoreUtils?.showToast) {
                window.CoreUtils.showToast(userMessage, 'error');
            } else if (window.showToast) {
                window.showToast(userMessage, 'error');
            } else {
                alert(userMessage);
            }

            this.logToService(error, context);
        },

        logToService: function(error, context) {
            try {
                const logs = JSON.parse(localStorage.getItem('error_logs') || '[]');
                logs.push({
                    timestamp: new Date().toISOString(),
                    context: context,
                    message: error.message,
                    code: error.code
                });
                if (logs.length > 50) logs.shift();
                localStorage.setItem('error_logs', JSON.stringify(logs));
            } catch (e) {}
        },

        async tryCatch(fn, context = '', fallback = null) {
            try {
                return await fn();
            } catch (error) {
                this.handle(error, context);
                return fallback;
            }
        },

        wrap: function(fn, context = '') {
            return async (...args) => {
                try {
                    return await fn(...args);
                } catch (error) {
                    this.handle(error, context);
                }
            };
        }
    };

    window.ErrorHandler = ErrorHandler;
    console.log('✅ error-handler.js loaded');
})();