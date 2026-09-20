/* eslint-disable react-refresh/only-export-components */
// src/contexts/UIContext.jsx
// Handles theme, i18n, privacy suite (Ghost Mode, Watermark, Panic Lock), and Toasts.

import { createContext, useContext, useState, useEffect } from 'react'

const dict = {
  en: {
    brand: 'Cirvy',
    // shieldLabel: 'ZERO-TRACKING SHIELD · ON',
    loginAuthHeadline: 'Welcome back to Cirvy',
    SignupAuthHeadline: 'Hello, welcome to Cirvy',
    authSub: 'No trackers. No ad profiles. No public leaks — just your circle.',
    signIn: 'Sign In',
    signUp: 'Sign Up',
    signInBtn: 'Sign In Securely',
    userOrEmail: 'Email',
    userOrEmailPh: 'youremail@example.com',
    password: 'Password',
    forgotPassword: 'Forgot password?',
    fullName: 'Full Name',
    username: 'Username',
    email: 'Email',
    createAccount: 'Create Private Account',
    verifyEmail: 'Verify your email',
    enterOtp: 'Enter the 8-character verification code sent to',
    verifyBtn: 'Verify & Continue',
    resendCode: 'Resend code',
    codeResent: 'Verification code resent',
    invalidCode: 'Invalid verification code. Please check and try again.',
    timeoutError: 'Connection to email service timed out (HTTP 504). Please check your Supabase SMTP settings or try again.',
    backToSignup: 'Change email',
    orContinue: 'or continue with',
    authFooter: 'End-to-end private. No data is ever sold, shared, or advertised against.',
    feedTitle: 'Feed',
    noAdsTag: 'NO ADS · NO TRACKING',
    friendsTitle: 'Friends',
    friendsTab: 'Friends',
    requestsTab: 'Requests',
    accept: 'Accept',
    decline: 'Decline',
    searchTitle: 'Search',
    searchPlaceholder: 'Search creators, usernames...',
    privacyBanner: 'Your searches are never stored or tracked for targeted ads. Cirvy Shield discards every query the moment results are shown.',
    privateProfile: 'Private Profile',
    ghostActive: 'Ghost Mode Active',
    bio: 'Storyteller and creator. Connected only with people I know in real life.',
    postsLabel: 'Posts',
    friendsLabel: 'Friends',
    trustLabel: 'Trust Score',
    menuEdit: 'Edit Post',
    menuHide: 'Hide From Profile',
    menuAudience: 'Comment Audience',
    menuDelete: 'Delete Post',
    cancel: 'Cancel',
    audienceTitle: 'Who can comment?',
    audienceSub: 'Control replies on this post. Changes apply instantly.',
    everyone: "Everyone I've approved",
    closeFriendsOnly: 'Close Friends Only',
    disableComments: 'Disable Comments Completely',
    save: 'Save',
    resetTitle: 'Reset your password',
    resetSub: "We'll email a secure, single-use reset link. Nothing is logged.",
    sendLink: 'Send Link',
    privacySuite: 'Next-Gen Privacy Suite',
    secGeneral: 'Presence',
    secScreen: 'Screen Protection',
    secEmergency: 'Emergency',
    secComments: 'Default Comment Audience',
    ghostMode: 'Ghost Mode',
    ghostModeDesc: 'Browse without appearing active',
    watermarkTitle: 'Anti-Screenshot Watermark',
    watermarkDesc: 'Overlays a dynamic ID watermark on-screen',
    leakTitle: 'AI Leak Traceback',
    leakDesc: 'Steganographic watermark traces leaked screenshots back to source',
    comingSoon: 'SOON',
    panicLock: 'Panic Lock',
    panicDesc: 'Instantly hides the app behind a decoy screen',
    navFeed: 'Feed',
    navFriends: 'Friends',
    navSearch: 'Search',
    navProfile: 'Profile',
    editProfileToast: 'Profile editor coming soon',
    postDeleted: 'Post deleted',
    postHidden: 'Post hidden from profile',
    postEdit: 'Edit mode enabled for this post',
    audienceSaved: 'Comment audience updated',
    resetSent: 'Reset link sent — check your inbox',
    watermarkOn: 'Screenshot watermark enabled',
    watermarkOff: 'Screenshot watermark disabled',
    ghostOn: "Ghost Mode enabled — you're browsing invisibly",
    ghostOff: 'Ghost Mode disabled',
    friendAccepted: 'Friend request accepted',
    friendDeclined: 'Request declined',
    loginSuccess: 'Welcome back to your circle',
    signupSuccess: 'Account created — welcome to Cirvy',
    noResults: 'No matches. Nothing about this search is ever saved.',
    view: 'View',
    logout: 'Log Out',
    logoutConfirm: 'Are you sure you want to log out?',
    loggedOut: 'You have been logged out securely.',
  },
  ar: {
    brand: 'سيرفي',
    shieldLabel: 'درع عدم التتبع · مُفعّل',
    authHeadline: 'مصمم لأشخاص تراقبهم الشبكة أصلاً.',
    authSub: 'بلا متتبعات. بلا ملفات إعلانية. بلا تسريبات علنية — دائرتك فقط.',
    signIn: 'تسجيل الدخول',
    signUp: 'إنشاء حساب',
    signInBtn: 'دخول آمن',
    userOrEmail: 'اسم المستخدم أو البريد',
    userOrEmailPh: 'youremail@example.com',
    password: 'كلمة المرور',
    forgotPassword: 'نسيت كلمة المرور؟',
    fullName: 'الاسم الكامل',
    username: 'اسم المستخدم',
    email: 'البريد الإلكتروني',
    createAccount: 'إنشاء حساب خاص',
    verifyEmail: 'تأكيد بريدك الإلكتروني',
    enterOtp: 'أدخل رمز التحقق المكون من 8 خانات المرسل إلى',
    verifyBtn: 'تأكيد ومتابعة',
    resendCode: 'إعادة إرسال الرمز',
    codeResent: 'تمت إعادة إرسال الرمز',
    invalidCode: 'رمز التحقق غير صحيح، يرجى المحاولة مرة أخرى.',
    timeoutError: 'انتهت مهلة الاتصال بخادم البريد (HTTP 504). يرجى مراجعة إعدادات الـ SMTP في Supabase والمحاولة مجددًا.',
    backToSignup: 'تغيير البريد',
    orContinue: 'أو تابع عبر',
    authFooter: 'خصوصية تامة من طرف إلى طرف. بياناتك لا تُباع ولا تُشارك ولا تُستخدم للإعلانات أبدًا.',
    feedTitle: 'الخلاصة',
    noAdsTag: 'بلا إعلانات · بلا تتبع',
    friendsTitle: 'الأصدقاء',
    friendsTab: 'الأصدقاء',
    requestsTab: 'الطلبات',
    accept: 'قبول',
    decline: 'رفض',
    searchTitle: 'بحث',
    searchPlaceholder: 'ابحث عن المبدعين وأسماء المستخدمين...',
    privacyBanner: 'عمليات بحثك لا تُخزَّن ولا تُستخدم أبدًا للإعلانات المستهدفة. درع سيرفي يمحو كل استعلام فور ظهور النتائج.',
    privateProfile: 'حساب خاص',
    ghostActive: 'وضع الشبح مُفعّل',
    bio: 'ممثل · حكواتي · هنا لأجل من يعرفني فعلاً. طلبات المتابعة تُراجَع يدويًا 🤍',
    postsLabel: 'منشورات',
    friendsLabel: 'أصدقاء',
    trustLabel: 'درجة الثقة',
    menuEdit: 'تعديل المنشور',
    menuHide: 'إخفاء من الملف الشخصي',
    menuAudience: 'من يمكنه التعليق',
    menuDelete: 'حذف المنشور',
    cancel: 'إلغاء',
    audienceTitle: 'من يمكنه التعليق؟',
    audienceSub: 'تحكم بالردود على هذا المنشور. التغييرات تُطبَّق فورًا.',
    everyone: 'كل من وافقت عليهم',
    closeFriendsOnly: 'الأصدقاء المقربون فقط',
    disableComments: 'تعطيل التعليقات نهائيًا',
    save: 'حفظ',
    resetTitle: 'إعادة تعيين كلمة المرور',
    resetSub: 'سنرسل رابطًا آمنًا يُستخدم مرة واحدة. لا شيء يُسجَّل.',
    sendLink: 'إرسال الرابط',
    privacySuite: 'مجموعة الخصوصية المتقدمة',
    secGeneral: 'الحالة',
    secScreen: 'حماية الشاشة',
    secEmergency: 'الطوارئ',
    secComments: 'إعداد التعليقات الافتراضي',
    ghostMode: 'وضع الشبح',
    ghostModeDesc: 'تصفّح دون الظهور كمتصل',
    watermarkTitle: 'علامة مائية ضد لقطات الشاشة',
    watermarkDesc: 'يضيف علامة تعريف ديناميكية فوق الشاشة',
    leakTitle: 'تتبع التسريبات بالذكاء الاصطناعي',
    leakDesc: 'علامة مائية مخفية تتعقب مصدر أي لقطة شاشة مسرَّبة',
    comingSoon: 'قريبًا',
    panicLock: 'قفل الطوارئ',
    panicDesc: 'يُخفي التطبيق فورًا خلف شاشة تمويه',
    navFeed: 'الخلاصة',
    navFriends: 'الأصدقاء',
    navSearch: 'بحث',
    navProfile: 'الملف الشخصي',
    editProfileToast: 'محرر الملف الشخصي قريبًا',
    postDeleted: 'تم حذف المنشور',
    postHidden: 'تم إخفاء المنشور من الملف الشخصي',
    postEdit: 'تم تفعيل وضع التعديل لهذا المنشور',
    audienceSaved: 'تم تحديث إعداد التعليقات',
    logout: 'تسجيل الخروج',
    logoutConfirm: 'هل أنت متأكد من رغبتك في تسجيل الخروج؟',
    loggedOut: 'تم تسجيل الخروج بأمان.',
    resetSent: 'تم إرسال رابط إعادة التعيين — تحقق من بريدك',
    watermarkOn: 'تم تفعيل العلامة المائية',
    watermarkOff: 'تم إيقاف العلامة المائية',
    ghostOn: 'تم تفعيل وضع الشبح — تصفحك غير مرئي',
    ghostOff: 'تم إيقاف وضع الشبح',
    friendAccepted: 'تم قبول طلب الصداقة',
    friendDeclined: 'تم رفض الطلب',
    loginSuccess: 'أهلاً بعودتك إلى دائرتك',
    signupSuccess: 'تم إنشاء الحساب — أهلاً بك في سيرفي',
    noResults: 'لا نتائج. لا شيء من هذا البحث يُحفظ أبدًا.',
    view: 'عرض',
  },
}

const UIContext = createContext(null)

export function UIProvider({ children }) {
  const [lang, setLang] = useState('en')
  const [dark, setDark] = useState(() => window.localStorage.getItem('cirvy-theme') === 'dark')
  const [ghostMode, setGhostMode] = useState(() => {
    const saved = window.localStorage.getItem('cirvy-ghost-mode')
    return saved !== null ? saved === 'true' : false
  })
  const [watermark, setWatermark] = useState(false)
  const [panicLocked, setPanicLocked] = useState(false)
  const [panicTaps, setPanicTaps] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [toastMessage, setToastMessage] = useState(null)
  const [toastTimer, setToastTimer] = useState(null)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    window.localStorage.setItem('cirvy-theme', dark ? 'dark' : 'light')
  }, [dark])

  useEffect(() => {
    window.localStorage.setItem('cirvy-ghost-mode', ghostMode ? 'true' : 'false')
  }, [ghostMode])

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'
  }, [lang])

  const t = (key) => dict[lang]?.[key] ?? key

  const toggleLang = () => {
    setLang((prev) => (prev === 'en' ? 'ar' : 'en'))
  }

  const toggleTheme = () => setDark((prev) => !prev)

  const showToast = (msg) => {
    setToastMessage(msg)
    if (toastTimer) clearTimeout(toastTimer)
    const tId = setTimeout(() => setToastMessage(null), 2600)
    setToastTimer(tId)
  }

  const toggleGhostMode = (val) => {
    const next = typeof val === 'boolean' ? val : !ghostMode
    setGhostMode(next)
    showToast(next ? t('ghostOn') : t('ghostOff'))
  }

  const toggleWatermark = (val) => {
    const next = typeof val === 'boolean' ? val : !watermark
    setWatermark(next)
    showToast(next ? t('watermarkOn') : t('watermarkOff'))
  }

  const engagePanic = () => {
    setShowSettings(false)
    setPanicLocked(true)
    setPanicTaps(0)
  }

  const handlePanicTap = () => {
    const next = panicTaps + 1
    if (next >= 5) {
      setPanicLocked(false)
      setPanicTaps(0)
    } else {
      setPanicTaps(next)
    }
  }

  return (
    <UIContext.Provider
      value={{
        lang,
        dark,
        ghostMode,
        watermark,
        panicLocked,
        showSettings,
        toastMessage,
        t,
        toggleLang,
        toggleTheme,
        toggleGhostMode,
        toggleWatermark,
        engagePanic,
        handlePanicTap,
        setShowSettings,
        showToast,
      }}
    >
      {children}

      {/* Dynamic Watermark Overlay */}
      {watermark && (
        <div className="fixed inset-0 z-40 overflow-hidden pointer-events-none">
          {Array.from({ length: 40 }).map((_, i) => {
            const r = Math.floor(i / 4)
            const c = i % 4
            return (
              <span
                key={i}
                className="watermark-tile"
                style={{ top: `${r * 11 - 5}%`, left: `${c * 30 - 5}%` }}
              >
                @User · {new Date().toLocaleDateString()} · Cirvy
              </span>
            )
          })}
        </div>
      )}

      {/* Panic Lock Decoy Screen */}
      {panicLocked && (
        <div className="fixed inset-0 z-[200] bg-ink-950 flex flex-col items-center justify-center text-center px-8">
          <i className="fa-solid fa-calculator text-4xl text-ink-500 mb-4" />
          <p className="text-ink-500 font-display text-sm">0</p>
          <button
            onClick={handlePanicTap}
            className="mt-10 text-[11px] tracking-widest uppercase text-ink-700 font-display scale-tap cursor-pointer"
          >
            tap five times to unlock ({panicTaps}/5)
          </button>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[300] toast-enter">
          <div className="glass px-4 py-2.5 rounded-full text-xs font-medium shadow-glass">
            {toastMessage}
          </div>
        </div>
      )}
    </UIContext.Provider>
  )
}

export function useUI() {
  const context = useContext(UIContext)
  if (!context) throw new Error('useUI must be used within UIProvider')
  return context
}
