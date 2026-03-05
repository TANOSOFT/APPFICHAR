import React, { useState, useEffect } from 'react'
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import { supabase, getRedirectUrl } from './lib/supabase'
import { NotificationBell } from './components/NotificationBell'
import { PushNotifications } from '@capacitor/push-notifications'
import { App as CapApp } from '@capacitor/app'
import { SplashScreen } from '@capacitor/splash-screen'
import { TimeTracker } from './components/TimeTracker'
import { TimeHistory } from './components/TimeHistory'
import { ReportGenerator } from './components/ReportGenerator'
import { AdminDashboard } from './components/AdminDashboard'
import { AdminMenu } from './components/AdminMenu'
import { CorrectionRequest } from './components/CorrectionRequest'
import { AbsenceRequestForm } from './components/AbsenceRequestForm'
import { StatisticsCollapsible } from './components/StatisticsCollapsible'
import { ReportsCollapsible } from './components/ReportsCollapsible'
import { SuperAdminMenu } from './components/SuperAdminMenu'
import { UserProfile } from './components/UserProfile'

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) { return { hasError: true, error }; }
    componentDidCatch(error, errorInfo) { console.error("Error caught by boundary:", error, errorInfo); }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '20px', textAlign: 'center', background: 'white', height: '100vh' }}>
                    <h2>Algo ha salido mal</h2>
                    <pre style={{ fontSize: '10px', color: 'red' }}>{this.state.error?.message}</pre>
                    <button onClick={() => window.location.reload()} className="btn btn-primary">Reintentar</button>
                </div>
            );
        }
        return this.props.children;
    }
}

function App() {
    return (
        <Router>
            <ErrorBoundary>
                <AppInner />
            </ErrorBoundary>
        </Router>
    )
}

function AppInner() {
    const [session, setSession] = useState(null)

    // Diagnostic log for version verification
    useEffect(() => {
        console.log('Fichar App v1.1.0 Loaded - Current Build: OvN-ZbjJ')
    }, [])

    useEffect(() => {
        let isProcessing = false

        const handleAuthUrl = async (urlStr) => {
            if (isProcessing) return
            console.log('Processing Auth URL:', urlStr)

            try {
                const url = new URL(urlStr)
                const params = new URLSearchParams(url.hash.substring(1) || url.search)
                const accessToken = params.get('access_token')
                const refreshToken = params.get('refresh_token')

                if (accessToken && refreshToken) {
                    isProcessing = true

                    const { data, error } = await supabase.auth.setSession({
                        access_token: accessToken,
                        refresh_token: refreshToken
                    })

                    if (error) {
                        // Ignore abortion as it means another process took over
                        if (!error.message?.includes('aborted')) {
                            alert('❌ Error de Autenticación:\n' + error.message)
                        }
                        isProcessing = false
                        return
                    }

                    if (data?.session) {
                        console.log('Session established via manual trigger')
                        setSession(data.session)
                        if (window.location.protocol.startsWith('http')) {
                            window.history.replaceState(null, null, window.location.pathname)
                        }
                    }
                }
            } catch (err) {
                if (!err.message?.includes('aborted')) {
                    console.error('Error in handleAuthUrl:', err)
                }
            } finally {
                setTimeout(() => { isProcessing = false }, 2000)
            }
        }

        // 1. Initial check (Web)
        if (window.location.hash || window.location.search) {
            handleAuthUrl(window.location.href)
        }

        // 2. Capacitor Listeners
        CapApp.getLaunchUrl().then((launchUrl) => {
            if (launchUrl?.url) {
                handleAuthUrl(launchUrl.url)
            }
        })

        const urlListener = CapApp.addListener('appUrlOpen', async (data) => {
            if (data.url) {
                handleAuthUrl(data.url)
            }
        })

        // 3. Monitor Auth State changes
        const {
            data: { subscription },
        } = supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth event:', event)
            if (session) {
                setSession(session)
            } else if (event === 'SIGNED_OUT') {
                setSession(null)
            }
        })

        // 4. Persistence check
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) setSession(session)
        })

        // 5. Mobile Notifications Setup
        const setupNotifications = async () => {
            try {
                // Only for native platforms
                const { platform } = await CapApp.getInfo()
                if (platform === 'web') return

                // 1. Request BOTH Push and Local permissions
                let pushPerm = await PushNotifications.checkPermissions()
                if (pushPerm.receive === 'prompt') {
                    pushPerm = await PushNotifications.requestPermissions()
                }

                let localPerm = await LocalNotifications.checkPermissions()
                if (localPerm.display === 'prompt') {
                    localPerm = await LocalNotifications.requestPermissions()
                }

                if (pushPerm.receive !== 'granted') {
                    console.warn('Push notification permissions not granted')
                }

                // 2. Create Notification Channel (Android Requirement for reliable banners)
                if (platform === 'android') {
                    await LocalNotifications.createChannel({
                        id: 'fichar-alerts',
                        name: 'Alertas de Fichaje',
                        description: 'Notificaciones sobre jornadas, horas extras y solicitudes',
                        importance: 5, // High importance for banners
                        visibility: 1, // Public
                        sound: 'default',
                        vibration: true
                    })
                }

                // 3. Register for Push
                await PushNotifications.register()

                PushNotifications.addListener('registration', async ({ value }) => {
                    console.log('Push registration success, token:', value)
                    const { data: { user } } = await supabase.auth.getUser()
                    if (user) {
                        const { error } = await supabase.from('device_tokens').upsert({
                            user_id: user.id,
                            token: value,
                            platform: platform,
                            last_seen: new Date().toISOString()
                        }, { onConflict: 'user_id, token' })

                        if (error) console.error('Error saving device token:', error)
                    }
                })

                PushNotifications.addListener('registrationError', (error) => {
                    console.error('Push registration error:', error)
                })

                // 4. Remote Push Listeners (Handle pulses from FCM)
                PushNotifications.addListener('pushNotificationReceived', (notification) => {
                    console.log('Remote push received:', notification)
                    // If app is in foreground, we might want to show a local alert
                })

                PushNotifications.addListener('pushNotificationActionPerformed', (notification) => {
                    console.log('Push action performed:', notification)
                })

            } catch (err) {
                console.error('Error setting up notifications:', err)
            }
        }
        if (session) {
            setupNotifications()
        }

        // Hide splash screen after initialization
        setTimeout(() => {
            SplashScreen.hide().catch(() => { })
        }, 500)

        return () => {
            subscription.unsubscribe()
            urlListener.remove()
        }
    }, [])

    const content = !session ? <Auth /> : <Dashboard session={session} />

    return (
        <div style={{ minHeight: '100vh', backgroundColor: '#f3f4f6', position: 'relative' }}>
            {content}
        </div>
    )
}

// Minimal Placeholder Components for MVP showcase
function Auth() {
    const [loading, setLoading] = useState(false)
    const [email, setEmail] = useState('')
    const [token, setToken] = useState('')
    const [step, setStep] = useState('email') // email | otp

    const handleLoginEmail = async (event) => {
        event.preventDefault()
        if (!email) return

        setLoading(true)
        try {
            const { error } = await supabase.auth.signInWithOtp({
                email: email.toLowerCase().trim(),
                options: {
                    emailRedirectTo: getRedirectUrl()
                }
            })

            if (error) {
                // Detailed error mapping
                if (error.message.includes('rate limit')) {
                    alert('⚠️ Límite de correos alcanzado. Por favor, espera una hora antes de volver a intentarlo.')
                } else {
                    alert('Error al enviar acceso: ' + error.message)
                }
            } else {
                setStep('otp')
            }
        } catch (err) {
            alert('Error crítico: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleVerifyOtp = async (event) => {
        event.preventDefault()
        setLoading(true)
        const { error } = await supabase.auth.verifyOtp({
            email,
            token,
            type: 'magiclink'
        })
        if (error) alert('Error: Código no válido o caducado')
        setLoading(false)
    }

    return (
        <div className="auth-container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div className="auth-card card" style={{ margin: 'auto' }}>
                <h1>Fichar App</h1>
                <div key={step}>
                    {step === 'email' ? (
                        <>
                            <p>Inicia sesión con tu email</p>
                            <form onSubmit={handleLoginEmail}>
                                <input
                                    className="input"
                                    type="email"
                                    placeholder="Tu correo electrónico"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    autoFocus
                                    required
                                />
                                <button className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
                                    {loading ? 'Enviando...' : 'Enviar Acceso'}
                                </button>
                            </form>
                        </>
                    ) : (
                        <>
                            <p>Introduce el código enviado a <strong>{email}</strong></p>
                            <form onSubmit={handleVerifyOtp}>
                                <input
                                    className="input"
                                    type="text"
                                    placeholder="000000"
                                    value={token}
                                    onChange={(e) => setToken(e.target.value.replace(/\D/g, ''))}
                                    autoFocus
                                    style={{
                                        textAlign: 'center',
                                        fontSize: '2rem',
                                        letterSpacing: '0.5rem',
                                        fontWeight: 'bold'
                                    }}
                                    maxLength={10}
                                    required
                                />
                                <button className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
                                    {loading ? 'Verificando...' : 'Entrar en la App'}
                                </button>
                                <button
                                    className="btn btn-secondary"
                                    type="button"
                                    onClick={() => setStep('email')}
                                    style={{ width: '100%', marginTop: '0.5rem', backgroundColor: 'transparent', color: 'var(--text-muted)' }}
                                >
                                    Volver a intentar con otro email
                                </button>
                            </form>
                        </>
                    )}
                </div>
                {loading && <div style={{ marginTop: '1rem', color: 'var(--primary-color)' }}>Cargando...</div>}
            </div>
        </div>
    )
}

// Dashboard Component declared here

function Dashboard({ session }) {
    const [loading, setLoading] = useState(true)
    const [username, setUsername] = useState(null)
    const [profile, setProfile] = useState(null)
    const [refreshTrigger, setRefreshTrigger] = useState(0)
    const [showOnboarding, setShowOnboarding] = useState(false)
    const [tenant, setTenant] = useState(null)
    const [branding, setBranding] = useState(null)
    const [viewMode, setViewMode] = useState('employee') // 'admin' | 'employee'

    useEffect(() => {
        if (profile?.role === 'admin' || profile?.role === 'super_admin') {
            setViewMode('admin')
        }
    }, [profile?.role])

    useEffect(() => {
        getProfile()
    }, [session])

    const getProfile = async () => {
        try {
            setLoading(true)
            const { user } = session

            let { data, error, status } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', user.id)
                .single()

            if (error && status !== 406) {
                throw error
            }

            if (data) {
                setUsername(data.full_name)
                setProfile(data)

                if (data.tenant_id) {
                    const { data: tenantData } = await supabase
                        .from('tenants')
                        .select('name')
                        .eq('id', data.tenant_id)
                        .single()
                    setTenant(tenantData)

                    const { data: brandingData } = await supabase
                        .from('tenant_branding')
                        .select('*')
                        .eq('tenant_id', data.tenant_id)
                        .maybeSingle()
                    setBranding(brandingData)

                    // Check for onboarding (only for admins)
                    if (data.role === 'admin' && !brandingData) {
                        setShowOnboarding(true)
                    }
                }
            } else {
                // Check if user has a pending invitation
                const { data: invitation, error: inviteError } = await supabase
                    .from('pending_invitations')
                    .select('*')
                    .eq('email', user.email.toLowerCase().trim())
                    .eq('status', 'pending')
                    .maybeSingle()

                if (inviteError) console.error('Error checking invitation:', inviteError)

                if (invitation) {
                    // Create profile from invitation
                    const { error: profileError } = await supabase
                        .from('profiles')
                        .insert([{
                            id: user.id,
                            tenant_id: invitation.tenant_id,
                            full_name: invitation.full_name,
                            employee_code: invitation.employee_code,
                            role: invitation.role,
                            active: true
                        }])

                    if (profileError) {
                        console.error('Error creating profile from invitation:', profileError)
                        throw profileError
                    }

                    // Mark invitation as accepted
                    await supabase
                        .from('pending_invitations')
                        .update({ status: 'accepted', accepted_at: new Date().toISOString() })
                        .eq('id', invitation.id)

                    // Refresh profile
                    getProfile()
                }
            }
        } catch (error) {
            console.error('Error getting profile:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleTimeEntryChange = () => {
        setRefreshTrigger(prev => prev + 1)
    }

    if (loading) return <div className="container">Cargando...</div>

    // Onboarding Wizard Overlay for new Admins
    if (showOnboarding && profile?.role === 'admin') {
        return (
            <div className="container" style={{ padding: '50px 0' }}>
                <div className="card" style={{ border: '2px solid #4f46e5', textAlign: 'center' }}>
                    <h2 style={{ color: '#4f46e5' }}>🚀 ¡Bienvenido al Sistema!</h2>
                    <p>Como administrador, el primer paso es configurar los datos básicos de tu empresa.</p>
                    <hr style={{ margin: '1.5rem 0' }} />

                    {/* Reusing CompanySettings for onboarding */}
                    <AdminMenu
                        profile={profile}
                        userId={session.user.id}
                        initialTab="branding"
                        onComplete={() => setShowOnboarding(false)}
                    />

                    <div style={{ marginTop: '2rem' }}>
                        <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // Critical State: Logged in but NO company associated
    if (profile && !profile.tenant_id && profile.role !== 'super_admin') {
        return (
            <div className="container" style={{ textAlign: 'center', marginTop: '4rem' }}>
                <div className="card">
                    <h2 style={{ color: '#e11d48' }}>⚠️ Perfil Incompleto</h2>
                    <p>Tu cuenta no tiene una empresa asociada.</p>
                    <div style={{ border: '1px solid var(--primary-color)', padding: '1rem', borderRadius: '8px', marginTop: '1rem' }}>
                        <UserProfile profile={profile} userId={session.user.id} onUpdate={getProfile} />
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="container" style={{ padding: '50px 0 100px 0' }}>
            <NotificationBell userId={session.user.id} />

            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                marginBottom: '2rem',
                justifyContent: 'center',
                flexDirection: 'column'
            }}>
                {branding?.logo_path && (
                    <img
                        src={branding.logo_path}
                        alt="Logo"
                        style={{ maxHeight: '60px', maxWidth: '200px', objectFit: 'contain' }}
                    />
                )}
                <div style={{ textAlign: 'center' }}>
                    <h1 style={{ margin: 0 }}>{tenant?.name || 'Panel de Control'}</h1>
                    <p style={{ margin: '0.25rem 0 0 0', color: 'var(--text-muted)' }}>
                        Bienvenido, {username || session.user.email}
                    </p>
                </div>

                {profile?.role === 'admin' && (
                    <div style={{ marginTop: '1rem' }}>
                        <button
                            className="btn"
                            onClick={() => setViewMode(viewMode === 'admin' ? 'employee' : 'admin')}
                            style={{
                                backgroundColor: viewMode === 'admin' ? '#f3f4f6' : '#4f46e5',
                                color: viewMode === 'admin' ? '#374151' : 'white',
                                border: '1px solid #d1d5db',
                                borderRadius: '20px',
                                padding: '0.5rem 1.5rem',
                                fontWeight: 'bold',
                                fontSize: '0.875rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s'
                            }}
                        >
                            {viewMode === 'admin' ? '👤 Cambiar a Vista Empleado' : '⚙️ Volver a Gestión'}
                        </button>
                    </div>
                )}
            </div>

            {viewMode === 'employee' && (
                <div className="card" style={{ border: '1px solid var(--primary-color)' }}>
                    <UserProfile profile={profile} userId={session.user.id} onUpdate={getProfile} />
                </div>
            )}

            {viewMode === 'employee' && (
                <>
                    <TimeTracker profile={profile} session={session} onEntryChange={handleTimeEntryChange} />
                    <div className="card">
                        <TimeHistory userId={session.user.id} refreshTrigger={refreshTrigger} />
                    </div>
                    <div className="card">
                        <StatisticsCollapsible userId={session.user.id} />
                    </div>
                    <div className="card">
                        <ReportsCollapsible userId={session.user.id} profile={profile} />
                    </div>
                    <div className="card">
                        <CorrectionRequest profile={profile} />
                    </div>
                    <div className="card">
                        <AbsenceRequestForm profile={profile} />
                    </div>
                </>
            )}

            {profile && profile.role === 'super_admin' && viewMode === 'admin' && (
                <SuperAdminMenu profile={profile} />
            )}

            {profile && profile.role === 'admin' && viewMode === 'admin' && (
                <AdminMenu profile={profile} userId={session.user.id} />
            )}

            <div style={{ marginTop: '50px' }}>
                <button className="btn btn-secondary" onClick={() => supabase.auth.signOut()}>
                    Cerrar Sesión
                </button>
            </div>
        </div>
    )
}


export default App
