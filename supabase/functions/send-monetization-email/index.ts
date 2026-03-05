import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    const apiKey = Deno.env.get('RESEND_API_KEY')
    console.log('RESEND_API_KEY Present:', !!apiKey)

    if (!apiKey) {
        return new Response(JSON.stringify({ error: 'RESEND_API_KEY is not set in Supabase Secrets' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }

    const fromEmail = Deno.env.get('RESEND_FROM') || 'AppFichar <onboarding@resend.dev>'
    console.log('Using From Email:', fromEmail)

    try {
        const body = await req.json()
        console.log('Request body received:', JSON.stringify(body))
        const { to, subject, html, text } = body

        console.log('Attempting to send email via Resend to:', to)
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                from: fromEmail,
                to: Array.isArray(to) ? to : [to],
                subject: subject,
                html: html,
                text: text,
            }),
        })

        const data = await res.json()
        console.log('Resend API Response Status:', res.status)
        console.log('Resend API Response Data:', JSON.stringify(data))

        if (!res.ok) {
            return new Response(JSON.stringify({
                error: data.message || 'Resend error',
                details: data,
                resendStatus: res.status
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: res.status,
            })
        }

        return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        })
    } catch (error) {
        console.error('Edge Function Catch Error:', error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
