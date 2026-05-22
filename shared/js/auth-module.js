/**
 * auth-module.js - نظام المصادقة المتكامل (نسخة محسنة وكاملة - الإصدار النهائي)
 * يدعم: Google, Email, Guest, Forgot Password, Sign Out
 */

(function() {
    'use strict';

    // ======================== المتغيرات العامة ========================
    let auth = null;
    let db = null;
    let isProcessing = false;

    // ======================== دوال مساعدة (معرّفة أولاً) ========================
    
    function log(message) {
        console.log(`[Auth] ${new Date().toLocaleTimeString()} - ${message}`);
    }

    function showLoader() {
        const loader = document.getElementById('initialLoader');
        if (loader) {
            loader.classList.remove('hidden');
            loader.style.display = 'flex';
            loader.style.opacity = '1';
        }
    }

    function hideLoader() {
        const loader = document.getElementById('initialLoader');
        if (loader) {
            loader.style.opacity = '0';
            loader.classList.add('hidden');
            setTimeout(() => {
                if (loader.classList.contains('hidden')) {
                    loader.style.display = 'none';
                }
            }, 500);
        }
    }

    function showMessage(elementId, message, type = 'error') {
        const element = document.getElementById(elementId);
        if (!element) {
            console.warn(`[Auth] عنصر الرسائل "${elementId}" غير موجود`);
            return;
        }
        
        if (element._timeout) {
            clearTimeout(element._timeout);
        }
        
        element.textContent = message;
        element.className = `auth-message ${type} show`;
        
        element._timeout = setTimeout(() => {
            element.classList.remove('show');
        }, 5000);
    }

    function hideMessage(elementId) {
        const element = document.getElementById(elementId);
        if (element) {
            element.classList.remove('show');
            if (element._timeout) {
                clearTimeout(element._timeout);
            }
        }
    }

    function disableButtons(disable = true) {
        const buttons = document.querySelectorAll('button.submit-btn, button.auth-btn');
        buttons.forEach(btn => {
            if (disable) {
                btn.setAttribute('data-original-text', btn.innerHTML);
                btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> جاري المعالجة...';
                btn.disabled = true;
            } else {
                const original = btn.getAttribute('data-original-text');
                if (original) {
                    btn.innerHTML = original;
                }
                btn.disabled = false;
            }
        });
    }

    function validateEmail(email) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).toLowerCase());
    }

    function safeRedirect(url) {
        log(`توجيه إلى: ${url}`);
        showLoader();
        setTimeout(() => {
            window.location.href = url;
        }, 300);
    }

    function safeAddEventListener(id, event, handler) {
        const element = document.getElementById(id);
        if (element) {
            element.addEventListener(event, handler);
        } else {
            console.warn(`[Auth] العنصر "${id}" غير موجود في الصفحة`);
        }
    }

    // ======================== انتظار تهيئة Firebase ========================
    
    async function waitForFirebase() {
        log('انتظار تهيئة Firebase...');
        
        if (window.firebaseInitialized && window.auth && window.db) {
            auth = window.auth;
            db = window.db;
            log('✅ Firebase جاهزة مسبقاً');
            return true;
        }
        
        if (!window.firebaseModules) {
            log('⏳ انتظار تحميل وحدات Firebase...');
            
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('مهلة انتظار وحدات Firebase'));
                }, 10000);
                
                const checkModules = () => {
                    if (window.firebaseModules) {
                        clearTimeout(timeout);
                        resolve();
                    } else {
                        setTimeout(checkModules, 100);
                    }
                };
                
                window.addEventListener('firebase-ready', () => {
                    clearTimeout(timeout);
                    resolve();
                }, { once: true });
                
                checkModules();
            });
        }
        
        if (window.initializeFirebaseUnified) {
            try {
                const instance = await window.initializeFirebaseUnified();
                auth = instance.auth;
                db = instance.db;
                log('✅ Firebase مهيأة بنجاح');
                return true;
            } catch (error) {
                log('❌ فشل تهيئة Firebase: ' + error.message);
                return false;
            }
        }
        
        return false;
    }

    // ======================== حفظ المستخدم في Firestore ========================
    
    async function saveUserToFirestore(user) {
        if (!db || !user) {
            console.warn('[Auth] تعذر حفظ المستخدم: Firestore غير متاح');
            return;
        }
        
        try {
            const userRef = window.firebaseModules.doc(db, "users", user.uid);
            const userDoc = await window.firebaseModules.getDoc(userRef);
            
            if (!userDoc.exists()) {
                await window.firebaseModules.setDoc(userRef, {
                    email: user.email || '',
                    name: user.displayName || user.email?.split('@')[0] || 'مستخدم',
                    phone: user.phoneNumber || '',
                    address: '',
                    photoURL: user.photoURL || '/public/images/user-placeholder.png',
                    role: 'user',
                    isAdmin: false,
                    isGuest: false,
                    isActive: true,
                    emailVerified: user.emailVerified || false,
                    totalOrders: 0,
                    totalSpent: 0,
                    favorites: [],
                    cart: [],
                    createdAt: window.firebaseModules.serverTimestamp(),
                    updatedAt: window.firebaseModules.serverTimestamp()
                });
                log('✅ تم إنشاء مستند المستخدم في Firestore');
            } else {
                await window.firebaseModules.updateDoc(userRef, {
                    lastLogin: window.firebaseModules.serverTimestamp(),
                    emailVerified: user.emailVerified || false
                });
                log('✅ تم تحديث بيانات المستخدم');
            }
        } catch (error) {
            console.error('❌ خطأ في حفظ المستخدم:', error);
            showMessage('emailAuthMessage', 'حدث خطأ أثناء حفظ بيانات المستخدم', 'error');
        }
    }

    // ======================== تسجيل الدخول بـ Google ========================
    
    async function signInWithGoogle() {
        if (isProcessing) {
            console.warn('[Auth] عملية مصادقة جارية بالفعل');
            return;
        }
        isProcessing = true;
        
        try {
            log('بدء تسجيل الدخول بـ Google...');
            showMessage('emailAuthMessage', '⏳ جاري الاتصال بـ Google...', 'info');
            disableButtons(true);
            
            if (!await waitForFirebase()) {
                showMessage('emailAuthMessage', '❌ تعذر الاتصال بالخادم. تأكد من اتصالك بالإنترنت.', 'error');
                return;
            }
            
            const provider = new window.firebaseModules.GoogleAuthProvider();
            provider.setCustomParameters({
                prompt: 'select_account'
            });
            
            const result = await window.firebaseModules.signInWithPopup(auth, provider);
            log('✅ تم تسجيل الدخول بنجاح');
            
            await saveUserToFirestore(result.user);
            
            showMessage('emailAuthMessage', '✅ تم تسجيل الدخول بنجاح! جاري التوجيه...', 'success');
            safeRedirect('index.html');
            
        } catch (error) {
            log('❌ خطأ: ' + (error.code || error.message));
            
            const messages = {
                'auth/popup-closed-by-user': 'تم إغلاق نافذة تسجيل الدخول',
                'auth/cancelled-popup-request': 'تم إلغاء الطلب',
                'auth/popup-blocked': 'الرجاء السماح بالنوافذ المنبثقة',
                'auth/configuration-not-found': 'خطأ في إعدادات Google Sign-In',
                'auth/network-request-failed': 'فشل الاتصال بالشبكة'
            };
            
            showMessage('emailAuthMessage', messages[error.code] || 'حدث خطأ غير متوقع', 'error');
        } finally {
            isProcessing = false;
            disableButtons(false);
        }
    }

    // ======================== تسجيل الدخول كضيف ========================
    
    function signInAsGuest() {
        if (isProcessing) return;
        isProcessing = true;
        
        try {
            log('الدخول كضيف...');
            
            const guestId = 'guest_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
            
            const guestUser = {
                uid: guestId,
                displayName: 'زائر',
                email: null,
                photoURL: '/public/images/user-placeholder.png',
                phone: '',
                address: '',
                isGuest: true,
                isAdmin: false
            };
            
            sessionStorage.setItem('guest_user', JSON.stringify(guestUser));
            log('✅ تم إنشاء جلسة ضيف');
            
            safeRedirect('index.html');
            
        } catch (error) {
            log('❌ خطأ في الدخول كضيف: ' + error.message);
            showMessage('emailAuthMessage', 'حدث خطأ. حاول مرة أخرى.', 'error');
            isProcessing = false;
        }
    }

    // ======================== تسجيل الدخول بالبريد ========================
    
    async function signInWithEmail(email, password) {
        if (isProcessing) return;
        isProcessing = true;
        
        try {
            if (!email || !password) {
                showMessage('emailAuthMessage', 'الرجاء إدخال البريد الإلكتروني وكلمة المرور', 'error');
                return;
            }
            
            if (!validateEmail(email)) {
                showMessage('emailAuthMessage', 'صيغة البريد الإلكتروني غير صحيحة', 'error');
                return;
            }
            
            showMessage('emailAuthMessage', '⏳ جاري تسجيل الدخول...', 'info');
            disableButtons(true);
            
            if (!await waitForFirebase()) {
                showMessage('emailAuthMessage', '❌ تعذر الاتصال بالخادم', 'error');
                return;
            }
            
            const userCredential = await window.firebaseModules.signInWithEmailAndPassword(auth, email, password);
            log('✅ تم تسجيل الدخول بنجاح');
            
            if (userCredential.user && !userCredential.user.emailVerified) {
                try {
                    await window.firebaseModules.sendEmailVerification(userCredential.user);
                    showMessage('emailAuthMessage', '⚠️ بريدك غير مؤكد. تم إرسال رابط التأكيد مجدداً.', 'info');
                } catch (e) {
                    log('⚠️ فشل إرسال رابط التأكيد: ' + e.message);
                }
            }
            
            safeRedirect('index.html');
            
        } catch (error) {
            log('❌ فشل تسجيل الدخول: ' + error.code);
            
            const messages = {
                'auth/user-not-found': 'لا يوجد حساب بهذا البريد الإلكتروني',
                'auth/wrong-password': 'كلمة المرور غير صحيحة',
                'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة',
                'auth/user-disabled': 'تم تعطيل هذا الحساب',
                'auth/too-many-requests': 'محاولات كثيرة جداً. يرجى الانتظار قليلاً',
                'auth/invalid-credential': 'بيانات الدخول غير صحيحة',
                'auth/network-request-failed': 'فشل الاتصال بالشبكة'
            };
            
            showMessage('emailAuthMessage', messages[error.code] || 'فشل تسجيل الدخول. حاول مرة أخرى.', 'error');
        } finally {
            isProcessing = false;
            disableButtons(false);
        }
    }

    // ======================== إنشاء حساب جديد ========================
    
    async function signUpWithEmail(email, password, name, phone = '') {
        if (isProcessing) return false;
        isProcessing = true;
        
        try {
            if (!email || !password || !name) {
                showMessage('emailAuthMessage', 'الرجاء ملء جميع الحقول المطلوبة', 'error');
                return false;
            }
            
            if (!validateEmail(email)) {
                showMessage('emailAuthMessage', 'صيغة البريد الإلكتروني غير صحيحة', 'error');
                return false;
            }
            
            if (password.length < 6) {
                showMessage('emailAuthMessage', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
                return false;
            }
            
            showMessage('emailAuthMessage', '⏳ جاري إنشاء الحساب...', 'info');
            disableButtons(true);
            
            if (!await waitForFirebase()) {
                showMessage('emailAuthMessage', '❌ تعذر الاتصال بالخادم', 'error');
                return false;
            }
            
            const userCredential = await window.firebaseModules.createUserWithEmailAndPassword(auth, email, password);
            
            await window.firebaseModules.updateProfile(userCredential.user, {
                displayName: name,
                photoURL: '/public/images/user-placeholder.png'
            });
            
            try {
                await window.firebaseModules.sendEmailVerification(userCredential.user);
                log('✅ تم إرسال بريد التأكيد');
            } catch (e) {
                log('⚠️ فشل إرسال بريد التأكيد: ' + e.message);
            }
            
            await saveUserToFirestore(userCredential.user);
            
            if (phone) {
                const userRef = window.firebaseModules.doc(db, "users", userCredential.user.uid);
                await window.firebaseModules.updateDoc(userRef, { phone });
            }
            
            showMessage('emailAuthMessage', '✅ تم إنشاء الحساب بنجاح! تم إرسال رابط التأكيد. جاري التوجيه...', 'success');
            
            setTimeout(() => {
                safeRedirect('index.html');
            }, 2000);
            
            return true;
            
        } catch (error) {
            log('❌ فشل إنشاء الحساب: ' + error.code);
            
            const messages = {
                'auth/email-already-in-use': 'البريد الإلكتروني مستخدم بالفعل',
                'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة',
                'auth/weak-password': 'كلمة المرور ضعيفة جداً',
                'auth/network-request-failed': 'فشل الاتصال بالشبكة'
            };
            
            showMessage('emailAuthMessage', messages[error.code] || 'فشل إنشاء الحساب', 'error');
            return false;
        } finally {
            isProcessing = false;
            disableButtons(false);
        }
    }

    // ======================== استعادة كلمة المرور ========================
    
    async function sendPasswordReset(email) {
        if (isProcessing) return false;
        isProcessing = true;
        
        try {
            if (!email) {
                showMessage('resetPasswordMessage', 'الرجاء إدخال البريد الإلكتروني', 'error');
                return false;
            }
            
            if (!validateEmail(email)) {
                showMessage('resetPasswordMessage', 'صيغة البريد الإلكتروني غير صحيحة', 'error');
                return false;
            }
            
            showMessage('resetPasswordMessage', '⏳ جاري إرسال رابط إعادة التعيين...', 'info');
            disableButtons(true);
            
            if (!await waitForFirebase()) {
                showMessage('resetPasswordMessage', '❌ تعذر الاتصال بالخادم', 'error');
                return false;
            }
            
            await window.firebaseModules.sendPasswordResetEmail(auth, email);
            
            showMessage('resetPasswordMessage', 
                '✅ تم إرسال رابط إعادة التعيين إلى بريدك الإلكتروني.\n' +
                'يرجى التحقق من صندوق الوارد والبريد المزعج (Spam).\n' +
                'الرابط صالح لمدة ساعة واحدة.',
                'success'
            );
            
            log('✅ تم إرسال رابط استعادة كلمة المرور');
            return true;
            
        } catch (error) {
            log('❌ فشل إرسال رابط الاستعادة: ' + error.code);
            
            const messages = {
                'auth/user-not-found': 'لا يوجد حساب مسجل بهذا البريد الإلكتروني',
                'auth/invalid-email': 'صيغة البريد الإلكتروني غير صحيحة',
                'auth/too-many-requests': 'تم إرسال طلبات كثيرة. يرجى الانتظار قليلاً',
                'auth/network-request-failed': 'فشل الاتصال بالشبكة'
            };
            
            showMessage('resetPasswordMessage', messages[error.code] || 'فشل إرسال رابط الاستعادة', 'error');
            return false;
        } finally {
            isProcessing = false;
            disableButtons(false);
        }
    }

    // ======================== تسجيل الخروج ========================
    
    async function logout() {
        log('تسجيل الخروج...');
        showLoader();
        
        sessionStorage.removeItem('guest_user');
        sessionStorage.removeItem('guest_cart');
        sessionStorage.removeItem('guest_favorites');
        
        if (auth && window.firebaseModules) {
            try {
                await window.firebaseModules.signOut(auth);
                log('✅ تم تسجيل الخروج من Firebase');
            } catch (error) {
                log('⚠️ خطأ في تسجيل الخروج: ' + error.message);
            }
        }
        
        safeRedirect('login.html');
    }

    // ======================== التحقق من حالة المستخدم ========================
    
    async function checkAuthState() {
        log('التحقق من حالة المصادقة...');
        
        if (!await waitForFirebase()) {
            log('⚠️ Firebase غير متاحة');
            hideLoader();
            return;
        }
        
        window.firebaseModules.onAuthStateChanged(auth, (user) => {
            if (user) {
                log('👤 مستخدم مسجل، توجيه للصفحة الرئيسية...');
                safeRedirect('index.html');
                return;
            }
            
            const guest = sessionStorage.getItem('guest_user');
            if (guest) {
                log('👤 جلسة ضيف موجودة، توجيه للصفحة الرئيسية...');
                safeRedirect('index.html');
                return;
            }
            
            log('✅ لا يوجد مستخدم، إظهار واجهة تسجيل الدخول');
            hideLoader();
        });
    }

    // ======================== إدارة النماذج ========================
    
    function showEmailAuthForm() {
        const authOptions = document.getElementById('authOptions');
        const emailAuthForm = document.getElementById('emailAuthForm');
        const resetPasswordForm = document.getElementById('resetPasswordForm');
        
        if (authOptions) authOptions.style.display = 'none';
        if (emailAuthForm) emailAuthForm.style.display = 'block';
        if (resetPasswordForm) resetPasswordForm.style.display = 'none';
        showLoginForm();
    }

    function showLoginForm() {
        const loginFields = document.getElementById('loginFields');
        const registerFields = document.getElementById('registerFields');
        const authFormTitle = document.getElementById('authFormTitle');
        
        if (loginFields) loginFields.style.display = 'block';
        if (registerFields) registerFields.style.display = 'none';
        if (authFormTitle) authFormTitle.textContent = 'تسجيل الدخول';
        hideMessage('emailAuthMessage');
        
        const emailInput = document.getElementById('emailInput');
        const passwordInput = document.getElementById('passwordInput');
        if (emailInput) emailInput.value = '';
        if (passwordInput) passwordInput.value = '';
    }

    function showRegistrationForm() {
        const loginFields = document.getElementById('loginFields');
        const registerFields = document.getElementById('registerFields');
        const authFormTitle = document.getElementById('authFormTitle');
        
        if (loginFields) loginFields.style.display = 'none';
        if (registerFields) registerFields.style.display = 'block';
        if (authFormTitle) authFormTitle.textContent = 'إنشاء حساب جديد';
        hideMessage('emailAuthMessage');
        
        const registerName = document.getElementById('registerName');
        const registerEmail = document.getElementById('registerEmail');
        const registerPassword = document.getElementById('registerPassword');
        const registerPhone = document.getElementById('registerPhone');
        if (registerName) registerName.value = '';
        if (registerEmail) registerEmail.value = '';
        if (registerPassword) registerPassword.value = '';
        if (registerPhone) registerPhone.value = '';
    }

    function showResetPasswordForm() {
        const authOptions = document.getElementById('authOptions');
        const emailAuthForm = document.getElementById('emailAuthForm');
        const resetPasswordForm = document.getElementById('resetPasswordForm');
        
        if (authOptions) authOptions.style.display = 'none';
        if (emailAuthForm) emailAuthForm.style.display = 'none';
        if (resetPasswordForm) resetPasswordForm.style.display = 'block';
        
        const resetEmailInput = document.getElementById('resetEmailInput');
        if (resetEmailInput) resetEmailInput.value = '';
        hideMessage('resetPasswordMessage');
        
        const sendResetLinkBtn = document.getElementById('sendResetLinkBtn');
        if (sendResetLinkBtn) sendResetLinkBtn.style.display = 'flex';
    }

    function hideAllForms() {
        const authOptions = document.getElementById('authOptions');
        const emailAuthForm = document.getElementById('emailAuthForm');
        const resetPasswordForm = document.getElementById('resetPasswordForm');
        
        if (emailAuthForm) emailAuthForm.style.display = 'none';
        if (resetPasswordForm) resetPasswordForm.style.display = 'none';
        if (authOptions) authOptions.style.display = 'flex';
        
        hideMessage('emailAuthMessage');
        hideMessage('resetPasswordMessage');
    }

    // ======================== إعداد المستمعين ========================
    
    function setupEventListeners() {
        log('إعداد مستمعي الأحداث...');
        
        safeAddEventListener('googleSignInBtn', 'click', signInWithGoogle);
        safeAddEventListener('guestSignInBtn', 'click', signInAsGuest);
        safeAddEventListener('emailSignInBtn', 'click', showEmailAuthForm);
        
        safeAddEventListener('backToAuthOptions', 'click', hideAllForms);
        safeAddEventListener('backFromReset', 'click', hideAllForms);
        
        safeAddEventListener('signInBtn', 'click', () => {
            const email = document.getElementById('emailInput')?.value.trim() || '';
            const password = document.getElementById('passwordInput')?.value || '';
            signInWithEmail(email, password);
        });
        
        safeAddEventListener('signUpBtn', 'click', showRegistrationForm);
        
        safeAddEventListener('completeSignUpBtn', 'click', () => {
            const email = document.getElementById('registerEmail')?.value.trim() || '';
            const password = document.getElementById('registerPassword')?.value || '';
            const name = document.getElementById('registerName')?.value.trim() || '';
            const phone = document.getElementById('registerPhone')?.value.trim() || '';
            signUpWithEmail(email, password, name, phone);
        });
        
        safeAddEventListener('switchToLoginBtn', 'click', showLoginForm);
        
        safeAddEventListener('forgotPasswordBtn', 'click', (e) => {
            e.preventDefault();
            showResetPasswordForm();
        });
        
        safeAddEventListener('sendResetLinkBtn', 'click', () => {
            const email = document.getElementById('resetEmailInput')?.value.trim() || '';
            sendPasswordReset(email);
        });
        
        const passwordInput = document.getElementById('passwordInput');
        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const email = document.getElementById('emailInput')?.value.trim() || '';
                    const password = e.target.value;
                    signInWithEmail(email, password);
                }
            });
        }
        
        const registerPassword = document.getElementById('registerPassword');
        if (registerPassword) {
            registerPassword.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    const email = document.getElementById('registerEmail')?.value.trim() || '';
                    const password = e.target.value;
                    const name = document.getElementById('registerName')?.value.trim() || '';
                    const phone = document.getElementById('registerPhone')?.value.trim() || '';
                    signUpWithEmail(email, password, name, phone);
                }
            });
        }
        
        const resetEmailInput = document.getElementById('resetEmailInput');
        if (resetEmailInput) {
            resetEmailInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    sendPasswordReset(e.target.value.trim());
                }
            });
        }
        
        log('✅ تم إعداد جميع المستمعين');
    }

    // ======================== تصدير الدوال العامة ========================
    
    window.AuthModule = {
        signInWithGoogle,
        signInAsGuest,
        signInWithEmail,
        signUpWithEmail,
        sendPasswordReset,
        logout,
        showEmailAuthForm,
        showLoginForm,
        showRegistrationForm,
        showResetPasswordForm,
        hideAllForms
    };
    
    window.signOutAndRedirect = logout;
    window.resetPassword = (email) => sendPasswordReset(email);

    // ======================== بدء التطبيق ========================
    
    async function init() {
        log('🚀 بدء تهيئة نظام المصادقة...');
        
        setupEventListeners();
        
        setTimeout(() => {
            const loader = document.getElementById('initialLoader');
            if (loader && loader.style.display !== 'none') {
                log('⚠️ إخفاء شاشة التحميل (خطة طوارئ)');
                hideLoader();
            }
        }, 5000);
        
        await checkAuthState();
        
        log('✅ نظام المصادقة جاهز');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();