import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim()
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()

let supabase;
try {
    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('CRITICAL: Supabase URL or Key is missing!')
    }
    supabase = createClient(supabaseUrl || 'https://placeholder.supabase.co', supabaseAnonKey || 'placeholder')
} catch (err) {
    console.error('Failed to initialize Supabase client:', err)
}

export { supabase }

export const getRedirectUrl = () => {
    // Current Vercel Production URL (Primary Fallback)
    const prodUrl = 'https://web-rust-omega-44.vercel.app'
    const appScheme = 'appfichar://'

    // 1. Detect if we are in the mobile app environment (Capacitor)
    const isApp = window.location.protocol === 'file:' ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1'

    // 2. If we are in the app, always return the custom scheme
    if (isApp) {
        return appScheme
    }

    // 3. If we are in the web browser, use the CURRENT origin
    const origin = window.location.origin

    // If we are on localhost in a browser (dev mode), fallback to production
    let redirectUrl = origin
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        redirectUrl = prodUrl
    }

    console.log('Generated Redirect URL:', redirectUrl)
    return redirectUrl
}
