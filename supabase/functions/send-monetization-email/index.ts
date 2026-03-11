import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const LOPD_GENERIC = `De conformidad con lo dispuesto en el Reglamento (UE) 2016/679 de 27 de abril (GDPR) y la Ley Orgánica 3/2018 de 5 de diciembre (LOPDGDD), le informamos que sus datos personales son tratados bajo la responsabilidad de la empresa remitente para el mantenimiento de la relación profesional y/o contractual. Sus datos se conservarán mientras exista un interés mutuo para ello. Puede ejercer sus derechos de acceso, rectificación, portabilidad, supresión, limitación y oposición dirigiéndose a la dirección del remitente.`;

const getEmailHtml = (type: string, data: any, lopdText?: string) => {
    const primaryColor = '#4f46e5';
    const secondaryColor = '#10b981';
    const errorColor = '#e11d48';

    let title = '';
    let content = '';
    let buttonText = '';
    let buttonUrl = '#'; // In a real app, this would be the billing or dashboard URL
    let accentColor = primaryColor;

    const footerLopd = lopdText || LOPD_GENERIC;

    switch (type) {
        case 'billing_notice':
            title = 'Aviso de Pago Pendiente';
            accentColor = secondaryColor;
            content = `
                <p>Estimado/a administrador,</p>
                <p>Le escribimos para recordarle que tiene un recibo pendiente de pago asociado a su suscripción de <strong>AppFichar</strong>.</p>
                <p>Para garantizar la continuidad del servicio y evitar interrupciones en el registro de jornada de sus empleados, le rogamos que regularice su situación lo antes posible.</p>
            `;
            buttonText = 'Ver Mis Facturas';
            break;
        case 'license_suspended':
            title = 'Cuenta Suspendida';
            accentColor = errorColor;
            content = `
                <p>Hola,</p>
                <p>Lamentamos informarle que el acceso de su empresa a la plataforma <strong>AppFichar</strong> ha sido <strong>suspendido</strong>.</p>
                <p>Esta acción suele deberse a la falta sistemática de pago o al vencimiento de su licencia de uso. Sus empleados no podrán fichar hasta que la cuenta sea reactivada.</p>
            `;
            buttonText = 'Contactar con Soporte';
            break;
        case 'plan_change':
            title = 'Actualización de Plan';
            accentColor = primaryColor;
            content = `
                <p>Hola,</p>
                <p>Le confirmamos que el plan de suscripción de su empresa ha sido actualizado correctamente.</p>
                <p>A partir de ahora, podrá disfrutar de las nuevas características y límites asociados a su nuevo nivel de servicio en <strong>AppFichar</strong>.</p>
            `;
            buttonText = 'Ver Mi Nuevo Plan';
            break;
        default:
            title = data.subject || 'Notificación de AppFichar';
            content = data.html || `<p>${data.text || ''}</p>`;
    }

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
            body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f7fa; color: #334155; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); }
            .header { background-color: ${accentColor}; color: white; padding: 40px 20px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; font-weight: 700; letter-spacing: -0.025em; }
            .content { padding: 40px 30px; line-height: 1.6; font-size: 16px; }
            .footer { background-color: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
            .lopd { margin-top: 20px; padding-top: 20px; border-top: 1px dashed #e2e8f0; font-size: 10px; color: #94a3b8; text-align: justify; line-height: 1.4; }
            .button { display: inline-block; padding: 12px 24px; background-color: ${accentColor}; color: white !important; text-decoration: none; border-radius: 6px; font-weight: 600; margin-top: 20px; }
            .logo { font-size: 20px; font-weight: 800; color: white; text-transform: uppercase; margin-bottom: 10px; opacity: 0.9; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">AppFichar</div>
                <h1>${title}</h1>
            </div>
            <div class="content">
                ${content}
                ${buttonText ? `<a href="${buttonUrl}" class="button">${buttonText}</a>` : ''}
                <p style="margin-top: 30px;">Atentamente,<br><strong>El equipo de AppFichar</strong></p>
                
                <div class="lopd">
                    ${footerLopd}
                </div>
            </div>
            <div class="footer">
                &copy; ${new Date().getFullYear()} AppFichar SaaS. Todos los derechos reservados.<br>
                Este es un mensaje automático, por favor no responda directamente a este email.
            </div>
        </div>
    </body>
    </html>
    `;
};

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

    const fromEmail = Deno.env.get('RESEND_FROM') || 'AppFichar <notificaciones@app-fichar.com>'
    console.log('Using From Email:', fromEmail)

    try {
        const body = await req.json()
        console.log('Request body received:', JSON.stringify(body))
        const { to, subject, html, text, type, tenant_id } = body

        let lopdText = null;
        if (tenant_id && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
            const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
            const { data: branding } = await supabaseAdmin
                .from('tenant_branding')
                .select('email_data_protection_text')
                .eq('tenant_id', tenant_id)
                .maybeSingle();
            
            if (branding?.email_data_protection_text) {
                lopdText = branding.email_data_protection_text;
            }
        }

        const finalHtml = type ? getEmailHtml(type, body, lopdText) : html

        console.log('Attempting to send email via Resend to:', to, 'Type:', type || 'manual')
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
                html: finalHtml,
                text: text,
            }),
        })

        const data = await res.json()
        console.log('Resend API Full Response:', JSON.stringify({
            status: res.status,
            ok: res.ok,
            data: data
        }))

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
    } catch (error: any) {
        console.error('Edge Function Catch Error:', error.message)
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        })
    }
})
