import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function UserProfile({ profile, userId, onUpdate }) {
    const [loading, setLoading] = useState(false)
    const [fullName, setFullName] = useState(profile?.full_name || '')
    const [phone, setPhone] = useState(profile?.phone || '')
    const [address, setAddress] = useState(profile?.address_personal || '')
    const [expanded, setExpanded] = useState(false)

    useEffect(() => {
        if (profile) {
            setFullName(profile.full_name || '')
            setPhone(profile.phone || '')
            setAddress(profile.address_personal || '')
        }
    }, [profile])

    const handleSave = async (e) => {
        e.preventDefault()
        try {
            setLoading(true)
            const identifier = userId || profile?.id

            if (!identifier) {
                throw new Error('No se pudo identificar al usuario.')
            }

            // If it's a new profile (no profile prop or no tenant_id), 
            // we should not allow upserting without a tenant_id 
            // UNLESS the user is an admin about to create one.
            // But for now, to avoid "homeless" profiles:
            // SuperAdmins don't have tenant_id, so they skip this check
            if (profile?.role === 'super_admin') {
                // allow through
            } else if (!profile?.tenant_id) {
                // If the record exists in DB but we don't have it in state, we should check it first.
                const { data: existing } = await supabase.from('profiles').select('tenant_id, role').eq('id', identifier).single()

                // If it's a super_admin in DB (but maybe not in local profile object yet), also allow
                if (existing?.role === 'super_admin') {
                    // allow
                } else if (!existing?.tenant_id) {
                    throw new Error('No se puede guardar el perfil: no tienes una empresa vinculada. Si eres administrador, completa el registro de empresa primero.')
                }
            }

            const { error } = await supabase
                .from('profiles')
                .update({
                    full_name: fullName,
                    phone: phone,
                    address_personal: address,
                    updated_at: new Date().toISOString()
                })
                .eq('id', identifier)

            if (error) throw error

            alert('✅ Datos actualizados correctamente')
            if (onUpdate) onUpdate()
        } catch (err) {
            console.error('Error saving profile:', err)
            alert('Error al guardar datos: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            {/* Header / Trigger */}
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    padding: '0.5rem 0'
                }}
            >
                <h3 style={{ margin: 0 }}>👤 Mis Datos Personales</h3>
                <span style={{ fontSize: '1.5rem' }}>{expanded ? '▲' : '▼'}</span>
            </div>

            {expanded && (
                <form onSubmit={handleSave} style={{ marginTop: '1.5rem' }}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Nombre Completo
                        </label>
                        <input
                            className="input"
                            type="text"
                            value={fullName}
                            onChange={(e) => setFullName(e.target.value)}
                            placeholder="Tu nombre completo"
                            required
                        />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Teléfono
                        </label>
                        <input
                            className="input"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="600 000 000"
                        />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Dirección Particular
                        </label>
                        <input
                            className="input"
                            type="text"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                            placeholder="Calle Ejemplo, 12, Ático"
                        />
                    </div>

                    <div style={{ marginBottom: '1rem' }}>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Código de Empleado (No editable)
                        </label>
                        <input
                            className="input"
                            type="text"
                            value={profile?.employee_code || 'No asignado'}
                            disabled
                            style={{ backgroundColor: '#f3f4f6' }}
                        />
                    </div>

                    <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
                        {loading ? 'Guardando...' : '💾 Guardar Cambios'}
                    </button>
                </form>
            )}
        </div>
    )
}
