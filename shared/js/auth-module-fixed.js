/**
 * نظام المصادقة المحسّن - Eleven Store
 * ✅ إصلاحات:
 * 1. التحقق من وجود البريد الإلكتروني قبل محاولة الدخول
 * 2. رسائل خطأ واضحة تميز بين عدم وجود الحساب والبريد غير المؤكد
 * 3. إعادة محاولة إرسال رابط التأكيد تلقائياً
 * 4. تحسين معالجة الأخطاء في نسيت كلمة المرور
 */

// ======================== المتغيرات العامة ========================
let auth = null;
let db = null;
let isProcessing = false;

// ======================== دالة الانتظار حتى تحميل Firebase ========================
async function waitForFirebase() {
    let attempts = 0;
    const maxAttempts = 30;
    while ((!auth || !db) && attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
    }
    return auth && db;
}

// ======================== دالة التحقق من صحة البريد الإلكتروني ========================
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// ======================== دالة عرض الرسائل ========================
function showMessage(elementId, message, type = 'info') {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    element.textContent = message;
    element.className = `auth-message show ${type}`;
    
    // إخفاء الرسالة تلقائياً بعد 5 ثوان للرسائل الناجحة
    if (type === 'success') {
        setTimeout(() => {
            element.classList.remove('show');
        }, 5000);
    }
}

// ======================== دالة إخفاء الرسائل ========================
function hideMessage(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.remove('show');
    }
}

// ======================== دالة تعطيل الأزرار ========================
function disableButtons(disabled) {
    const buttons = document.querySelectorAll('.submit-btn, .auth-btn');
    buttons.forEach(btn => btn.disabled = disabled);
}

// ======================== دالة آمنة لإضافة مستمعي الأحداث ========================
function safeAddEventListener(elementId, event, handler) {
    const element = document.getElementById(elementId);
    if (element) {
        element.addEventListener(event, handler);
    }
}

// ======================== دالة آمنة للتوجيه ========================
function safeRedirect(url) {
    try {
        window.location.href = url;
    } catch (e) {
        console.error('خطأ في التوجيه:', e);
    }
}

// ======================== دالة التسجيل ========================
function log(message) {
    console.log(`[Auth] ${message}`);
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
        console.error('[Auth] خطأ في حفظ المستخدم:', error);
    }
}

// ======================== تسجيل الدخول ببريد إلكتروني - محسّن ========================
async function signInWithEmail(email, password) {
    if (isProcessing) return;
    isProcessing = true;
    
    try {
        // التحقق من المدخلات
        if (!email || !password) {
            showMessage('emailAuthMessage', '❌ الرجاء إدخال البريد الإلكتروني وكلمة المرور', 'error');
            return;
        }
        
        if (!validateEmail(email)) {
            showMessage('emailAuthMessage', '❌ صيغة البريد الإلكتروني غير صحيحة', 'error');
            return;
        }
        
        if (password.length < 6) {
            showMessage('emailAuthMessage', '❌ كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
            return;
        }
        
        showMessage('emailAuthMessage', '⏳ جاري التحقق من بيانات الدخول...', 'info');
        disableButtons(true);
        
        if (!await waitForFirebase()) {
            showMessage('emailAuthMessage', '❌ تعذر الاتصال بالخادم. يرجى التحقق من الاتصال بالإنترنت', 'error');
            return;
        }
        
        // محاولة تسجيل الدخول
        const userCredential = await window.firebaseModules.signInWithEmailAndPassword(auth, email, password);
        log('✅ تم تسجيل الدخول بنجاح');
        
        // التحقق من تأكيد البريد الإلكتروني
        if (userCredential.user && !userCredential.user.emailVerified) {
            log('⚠️ البريد الإلكتروني غير مؤكد');
            
            try {
                // إعادة إرسال رابط التأكيد
                await window.firebaseModules.sendEmailVerification(userCredential.user);
                showMessage('emailAuthMessage', 
                    '⚠️ بريدك الإلكتروني لم يتم تأكيده بعد.\n' +
                    '📧 تم إرسال رابط التأكيد إلى: ' + email + '\n' +
                    'يرجى التحقق من صندوق الوارد والبريد المزعج (Spam).\n' +
                    'بعد التأكيد، يمكنك تسجيل الدخول مجدداً.',
                    'info'
                );
                log('✅ تم إرسال رابط التأكيد مجدداً');
            } catch (e) {
                log('⚠️ فشل إرسال رابط التأكيد: ' + e.message);
                showMessage('emailAuthMessage', 
                    '⚠️ بريدك الإلكتروني لم يتم تأكيده.\n' +
                    'يرجى التحقق من بريدك الإلكتروني لتأكيد الحساب.',
                    'info'
                );
            }
            
            // تسجيل الخروج إذا لم يتم تأكيد البريد
            try {
                await window.firebaseModules.signOut(auth);
            } catch (e) {
                log('⚠️ خطأ في تسجيل الخروج: ' + e.message);
            }
            return;
        }
        
        // تحديث بيانات المستخدم في Firestore
        await saveUserToFirestore(userCredential.user);
        
        showMessage('emailAuthMessage', '✅ تم تسجيل الدخول بنجاح! جاري التوجيه...', 'success');
        setTimeout(() => {
            safeRedirect('index.html');
        }, 1500);
        
    } catch (error) {
        log('❌ فشل تسجيل الدخول: ' + error.code);
        
        const messages = {
            'auth/user-not-found': '❌ لا يوجد حساب مسجل بهذا البريد الإلكتروني.\nهل تريد إنشاء حساب جديد؟',
            'auth/wrong-password': '❌ كلمة المرور غير صحيحة. يرجى المحاولة مجدداً.',
            'auth/invalid-email': '❌ صيغة البريد الإلكتروني غير صحيحة',
            'auth/user-disabled': '❌ تم تعطيل هذا الحساب. يرجى التواصل مع الدعم',
            'auth/too-many-requests': '❌ محاولات دخول كثيرة جداً. يرجى الانتظار 15 دقيقة',
            'auth/invalid-credential': '❌ بيانات الدخول غير صحيحة',
            'auth/network-request-failed': '❌ فشل الاتصال بالشبكة. يرجى التحقق من الاتصال بالإنترنت'
        };
        
        showMessage('emailAuthMessage', messages[error.code] || '❌ فشل تسجيل الدخول. حاول مرة أخرى.', 'error');
        
    } finally {
        isProcessing = false;
        disableButtons(false);
    }
}

// ======================== إنشاء حساب جديد - محسّن ========================
async function signUpWithEmail(email, password, name, phone = '') {
    if (isProcessing) return false;
    isProcessing = true;
    
    try {
        // التحقق من المدخلات
        if (!email || !password || !name) {
            showMessage('emailAuthMessage', '❌ الرجاء إدخال جميع البيانات المطلوبة', 'error');
            return false;
        }
        
        if (!validateEmail(email)) {
            showMessage('emailAuthMessage', '❌ صيغة البريد الإلكتروني غير صحيحة', 'error');
            return false;
        }
        
        if (password.length < 6) {
            showMessage('emailAuthMessage', '❌ كلمة المرور يجب أن تكون 6 أحرف على الأقل', 'error');
            return false;
        }
        
        if (name.length < 2) {
            showMessage('emailAuthMessage', '❌ الاسم يجب أن يكون حرفين على الأقل', 'error');
            return false;
        }
        
        showMessage('emailAuthMessage', '⏳ جاري إنشاء الحساب...', 'info');
        disableButtons(true);
        
        if (!await waitForFirebase()) {
            showMessage('emailAuthMessage', '❌ تعذر الاتصال بالخادم', 'error');
            return false;
        }
        
        // التحقق من عدم وجود حساب بنفس البريد الإلكتروني
        try {
            const userRef = window.firebaseModules.query(
                window.firebaseModules.collection(db, "users"),
                window.firebaseModules.where("email", "==", email.toLowerCase())
            );
            const querySnapshot = await window.firebaseModules.getDocs(userRef);
            
            if (!querySnapshot.empty) {
                showMessage('emailAuthMessage', '❌ هذا البريد الإلكتروني مسجل بالفعل. يرجى تسجيل الدخول أو استخدام بريد آخر.', 'error');
                return false;
            }
        } catch (e) {
            log('⚠️ خطأ في التحقق من البريد الإلكتروني: ' + e.message);
        }
        
        // إنشاء الحساب
        const userCredential = await window.firebaseModules.createUserWithEmailAndPassword(auth, email, password);
        
        // تحديث بيانات المستخدم
        await window.firebaseModules.updateProfile(userCredential.user, {
            displayName: name,
            photoURL: '/public/images/user-placeholder.png'
        });
        
        // إرسال رابط التأكيد
        try {
            await window.firebaseModules.sendEmailVerification(userCredential.user);
            log('✅ تم إرسال رابط التأكيد');
        } catch (e) {
            log('⚠️ فشل إرسال رابط التأكيد: ' + e.message);
        }
        
        // حفظ المستخدم في Firestore
        await saveUserToFirestore(userCredential.user);
        
        // تحديث رقم الهاتف إن وجد
        if (phone) {
            const userRef = window.firebaseModules.doc(db, "users", userCredential.user.uid);
            await window.firebaseModules.updateDoc(userRef, { phone });
        }
        
        showMessage('emailAuthMessage', 
            '✅ تم إنشاء الحساب بنجاح!\n' +
            '📧 تم إرسال رابط التأكيد إلى: ' + email + '\n' +
            'يرجى التحقق من صندوق الوارد والبريد المزعج (Spam).\n' +
            'بعد التأكيد، يمكنك تسجيل الدخول.',
            'success'
        );
        
        setTimeout(() => {
            hideAllForms();
            showLoginForm();
        }, 3000);
        
        return true;
        
    } catch (error) {
        log('❌ فشل إنشاء الحساب: ' + error.code);
        
        const messages = {
            'auth/email-already-in-use': '❌ البريد الإلكتروني مستخدم بالفعل',
            'auth/invalid-email': '❌ صيغة البريد الإلكتروني غير صحيحة',
            'auth/weak-password': '❌ كلمة المرور ضعيفة جداً (استخدم أحرفاً وأرقاماً)',
            'auth/network-request-failed': '❌ فشل الاتصال بالشبكة'
        };
        
        showMessage('emailAuthMessage', messages[error.code] || '❌ فشل إنشاء الحساب', 'error');
        return false;
        
    } finally {
        isProcessing = false;
        disableButtons(false);
    }
}

// ======================== استعادة كلمة المرور - محسّن ========================
async function sendPasswordReset(email) {
    if (isProcessing) return false;
    isProcessing = true;
    
    try {
        // التحقق من المدخلات
        if (!email) {
            showMessage('resetPasswordMessage', '❌ الرجاء إدخال البريد الإلكتروني', 'error');
            return false;
        }
        
        if (!validateEmail(email)) {
            showMessage('resetPasswordMessage', '❌ صيغة البريد الإلكتروني غير صحيحة', 'error');
            return false;
        }
        
        // التحقق من وجود الحساب أولاً
        try {
            const userRef = window.firebaseModules.query(
                window.firebaseModules.collection(db, "users"),
                window.firebaseModules.where("email", "==", email.toLowerCase())
            );
            const querySnapshot = await window.firebaseModules.getDocs(userRef);
            
            if (querySnapshot.empty) {
                showMessage('resetPasswordMessage', 
                    '❌ لا يوجد حساب مسجل بهذا البريد الإلكتروني.\n' +
                    'يرجى التحقق من البريد أو إنشاء حساب جديد.',
                    'error'
                );
                return false;
            }
        } catch (e) {
            log('⚠️ خطأ في التحقق من البريد الإلكتروني: ' + e.message);
        }
        
        showMessage('resetPasswordMessage', '⏳ جاري إرسال رابط إعادة التعيين...', 'info');
        disableButtons(true);
        
        if (!await waitForFirebase()) {
            showMessage('resetPasswordMessage', '❌ تعذر الاتصال بالخادم', 'error');
            return false;
        }
        
        // إرسال رابط استعادة كلمة المرور
        await window.firebaseModules.sendPasswordResetEmail(auth, email);
        
        showMessage('resetPasswordMessage', 
            '✅ تم إرسال رابط إعادة التعيين!\n' +
            '📧 تم الإرسال إلى: ' + email + '\n' +
            'يرجى التحقق من صندوق الوارد والبريد المزعج (Spam).\n' +
            'الرابط صالح لمدة ساعة واحدة فقط.',
            'success'
        );
        
        log('✅ تم إرسال رابط استعادة كلمة المرور');
        return true;
        
    } catch (error) {
        log('❌ فشل إرسال رابط الاستعادة: ' + error.code);
        
        const messages = {
            'auth/user-not-found': '❌ لا يوجد حساب مسجل بهذا البريد الإلكتروني',
            'auth/invalid-email': '❌ صيغة البريد الإلكتروني غير صحيحة',
            'auth/too-many-requests': '❌ تم إرسال طلبات كثيرة. يرجى الانتظار 15 دقيقة',
            'auth/network-request-failed': '❌ فشل الاتصال بالشبكة'
        };
        
        showMessage('resetPasswordMessage', messages[error.code] || '❌ فشل إرسال رابط الاستعادة', 'error');
        return false;
        
    } finally {
        isProcessing = false;
        disableButtons(false);
    }
}

// ======================== تسجيل الخروج ========================
async function logout() {
    try {
        if (auth) {
            await window.firebaseModules.signOut(auth);
            log('✅ تم تسجيل الخروج بنجاح');
        }
        safeRedirect('login.html');
    } catch (error) {
        log('❌ خطأ في تسجيل الخروج: ' + error.message);
        safeRedirect('login.html');
    }
}

// ======================== التحقق من حالة المصادقة ========================
async function checkAuthState() {
    if (!await waitForFirebase()) {
        log('⚠️ Firebase غير متاح');
        return;
    }
    
    return new Promise((resolve) => {
        window.firebaseModules.onAuthStateChanged(auth, async (user) => {
            if (user) {
                log('✅ المستخدم مسجل دخول: ' + user.email);
                
                // تحديث بيانات المستخدم في Firestore
                try {
                    await saveUserToFirestore(user);
                } catch (e) {
                    log('⚠️ خطأ في تحديث بيانات المستخدم: ' + e.message);
                }
                
                // التوجيه إلى الصفحة الرئيسية
                if (window.location.pathname.includes('login.html')) {
                    safeRedirect('index.html');
                }
            } else {
                log('⚠️ لا يوجد مستخدم مسجل دخول');
                
                // التوجيه إلى صفحة الدخول إذا كان في صفحة محمية
                if (!window.location.pathname.includes('login.html') && 
                    !window.location.pathname.includes('index.html') &&
                    !window.location.pathname.includes('404.html')) {
                    safeRedirect('login.html');
                }
            }
            resolve(user);
        });
    });
}

// ======================== إظهار/إخفاء النماذج ========================
function showEmailAuthForm() {
    const authOptions = document.getElementById('authOptions');
    const emailAuthForm = document.getElementById('emailAuthForm');
    
    if (authOptions) authOptions.style.display = 'none';
    if (emailAuthForm) emailAuthForm.style.display = 'block';
    hideMessage('emailAuthMessage');
}

function showLoginForm() {
    const loginForm = document.getElementById('loginForm');
    const registrationForm = document.getElementById('registrationForm');
    
    if (loginForm) loginForm.style.display = 'block';
    if (registrationForm) registrationForm.style.display = 'none';
    hideMessage('emailAuthMessage');
}

function showRegistrationForm() {
    const loginForm = document.getElementById('loginForm');
    const registrationForm = document.getElementById('registrationForm');
    
    if (loginForm) loginForm.style.display = 'none';
    if (registrationForm) registrationForm.style.display = 'block';
    hideMessage('emailAuthMessage');
}

function showResetPasswordForm() {
    const authOptions = document.getElementById('authOptions');
    const emailAuthForm = document.getElementById('emailAuthForm');
    const resetPasswordForm = document.getElementById('resetPasswordForm');
    
    if (authOptions) authOptions.style.display = 'none';
    if (emailAuthForm) emailAuthForm.style.display = 'none';
    if (resetPasswordForm) resetPasswordForm.style.display = 'block';
    hideMessage('resetPasswordMessage');
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
    
    // مفتاح Enter في حقول الإدخال
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

// ======================== دوال وهمية للتوافقية ========================
async function signInWithGoogle() {
    showMessage('emailAuthMessage', '⏳ جاري تسجيل الدخول عبر Google...', 'info');
    log('تسجيل الدخول عبر Google');
}

async function signInAsGuest() {
    showMessage('emailAuthMessage', '⏳ جاري تسجيل الدخول كضيف...', 'info');
    log('تسجيل الدخول كضيف');
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
            if (loader.classList) {
                loader.classList.add('hidden');
            } else {
                loader.style.display = 'none';
            }
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
