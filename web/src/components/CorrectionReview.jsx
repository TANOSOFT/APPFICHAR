import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export function CorrectionReview({ profile }) {
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(false)
    const [filter, setFilter] = useState('pending')
    const [highlightedId, setHighlightedId] = useState(null)
    const cardRefs = useRef({})

    useEffect(() => {
        fetchRequests()
    }, [filter, profile])

    // Listen for navigation from notifications
    useEffect(() => {
        const handleNavigate = (event) => {
            console.log('🎯 Navigation event received in CorrectionReview:', event.detail)
            const requestId = event.detail?.requestId
            if (requestId) {
                // First, ensure we're showing pending requests
                setFilter('pending')

                // Wait for tab to switch and content to render
                setTimeout(() => {
                    console.log('📍 Looking for request card:', requestId)
                    console.log('📦 Available refs:', Object.keys(cardRefs.current))

                    const cardElement = cardRefs.current[requestId]
                    if (cardElement) {
                        console.log('✅ Found card element, scrolling...')
                        cardElement.scrollIntoView({
                            behavior: 'smooth',
                            block: 'center'
                        })
                        // Highlight temporarily
                        setHighlightedId(requestId)
                        setTimeout(() => setHighlightedId(null), 3000)
                    } else {
                        console.warn('❌ Card element not found for ID:', requestId)
                        console.log('Available requests:', requests.map(r => r.id))
                    }
                }, 800) // Increased timeout to ensure rendering
            }
        }

        window.addEventListener('navigateToCorrectionsReview', handleNavigate)
        return () => {
            window.removeEventListener('navigateToCorrectionsReview', handleNavigate)
        }
    }, [requests]) // Add requests as dependency

    const fetchRequests = async () => {
        try {
            setLoading(true)

            // First get correction requests
            let query = supabase
                .from('correction_requests')
                .select('*')
                .eq('tenant_id', profile.tenant_id)
                .order('created_at', { ascending: false })

            if (filter !== 'all') {
                query = query.eq('status', filter)
            }

            const { data: requestsData, error: requestsError } = await query

            if (requestsError) throw requestsError

            // Then get profiles for those requests
            if (requestsData && requestsData.length > 0) {
                const userIds = [...new Set(requestsData.map(r => r.user_id))]

                const { data: profilesData, error: profilesError } = await supabase
                    .from('profiles')
                    .select('id, full_name, employee_code')
                    .in('id', userIds)

                if (profilesError) throw profilesError

                // Combine data
                const requestsWithProfiles = requestsData.map(req => ({
                    ...req,
                    profiles: profilesData.find(p => p.id === req.user_id)
                }))

                setRequests(requestsWithProfiles)
            } else {
                setRequests([])
            }

        } catch (err) {
            console.error('Error fetching requests:', err)
            alert('Error al cargar solicitudes: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleReview = async (requestId, newStatus, notes = '') => {
        try {
            setLoading(true)

            const { data: request, error: fetchError } = await supabase
                .from('correction_requests')
                .select('*')
                .eq('id', requestId)
                .single()

            if (fetchError) throw fetchError

            // Update request status
            const { error: updateError } = await supabase
                .from('correction_requests')
                .update({
                    status: newStatus,
                    reviewed_by: profile.id,
                    reviewed_at: new Date().toISOString(),
                    review_notes: notes
                })
                .eq('id', requestId)

            if (updateError) throw updateError

            // If approved, apply the correction
            if (newStatus === 'approved') {
                await applyCorrection(request)
            }

            // Send Email Notification to Employee
            const { data: userProfile } = await supabase
                .from('profiles')
                .select('email, full_name')
                .eq('id', request.user_id)
                .single()

            if (userProfile?.email) {
                const typeName = request.request_type === 'modify' ? 'Modificar fichaje' : request.request_type === 'add_missing' ? 'Añadir fichaje olvidado' : 'Eliminar fichaje erróneo';
                const statusStr = newStatus === 'approved' ? 'APROBADA' : 'RECHAZADA';
                const dateStr = request.requested_date ? format(new Date(request.requested_date), 'dd/MM/yyyy') : '-';
                const htmlBody = `
                    <p>Hola ${userProfile.full_name || 'Empleado'},</p>
                    <p>Tu solicitud de corrección de fichaje (<strong>${typeName}</strong> para la fecha <strong>${dateStr}</strong>) ha sido <strong>${statusStr}</strong> por la administración.</p>
                    ${notes ? `<p><strong>Comentarios del Administrador:</strong> ${notes}</p>` : ''}
                    <p>Puedes revisar tus fichajes actualizados en Fichar App.</p>
                `;
                
                await supabase.functions.invoke('send-monetization-email', {
                    body: {
                        to: userProfile.email,
                        subject: `Resolución de Corrección de Fichaje: ${statusStr}`,
                        html: htmlBody,
                        type: 'custom',
                        tenant_id: profile.tenant_id
                    }
                }).catch(e => {
                    console.error('Email error:', e)
                    alert('Aviso: Fallo al enviar el email al empleado (' + e.message + ')')
                })
            } else {
                alert('Aviso: El empleado no tiene un correo registrado en su perfil. No se le notificará por email.')
            }

            alert(`✅ Solicitud ${newStatus === 'approved' ? 'aprobada' : 'rechazada'} correctamente`)
            fetchRequests()

        } catch (err) {
            console.error('Error reviewing request:', err)
            alert('Error al procesar solicitud: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const applyCorrection = async (request) => {
        try {
            if (request.request_type === 'modify' && request.time_entry_id) {
                // Update existing entry
                const updateData = {}
                if (request.requested_date) updateData.work_date = request.requested_date
                if (request.requested_start_at) updateData.start_at = request.requested_start_at
                if (request.requested_end_at) updateData.end_at = request.requested_end_at

                const { error } = await supabase
                    .from('time_entries')
                    .update(updateData)
                    .eq('id', request.time_entry_id)

                if (error) throw error

            } else if (request.request_type === 'add_missing') {
                // Create new entry
                const { error } = await supabase
                    .from('time_entries')
                    .insert([{
                        user_id: request.user_id,
                        tenant_id: request.tenant_id,
                        work_date: request.requested_date,
                        start_at: request.requested_start_at,
                        end_at: request.requested_end_at
                    }])

                if (error) throw error

            } else if (request.request_type === 'delete' && request.time_entry_id) {
                // Delete entry
                const { error } = await supabase
                    .from('time_entries')
                    .delete()
                    .eq('id', request.time_entry_id)

                if (error) throw error
            }
        } catch (err) {
            console.error('Error applying correction:', err)
            throw err
        }
    }

    const getTypeLabel = (type) => {
        switch (type) {
            case 'modify': return '✏️ Modificar'
            case 'add_missing': return '➕ Añadir'
            case 'delete': return '🗑️ Eliminar'
            default: return type
        }
    }

    const getStatusBadge = (status) => {
        const styles = {
            pending: { bg: '#fff3cd', color: '#856404', text: '⏳ Pendiente' },
            approved: { bg: '#d4edda', color: '#155724', text: '✅ Aprobada' },
            rejected: { bg: '#f8d7da', color: '#721c24', text: '❌ Rechazada' }
        }
        const style = styles[status] || styles.pending
        return (
            <span style={{
                backgroundColor: style.bg,
                color: style.color,
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                fontSize: '0.875rem',
                fontWeight: 'bold'
            }}>
                {style.text}
            </span>
        )
    }

    return (
        <div>
            <h4>📋 Revisar Solicitudes de Corrección</h4>
            <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                Aprueba o rechaza las solicitudes de corrección de empleados
            </p>

            {/* Filter */}
            <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    Filtrar por estado:
                </label>
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    style={{
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)'
                    }}
                >
                    <option value="pending">Pendientes</option>
                    <option value="approved">Aprobadas</option>
                    <option value="rejected">Rechazadas</option>
                    <option value="all">Todas</option>
                </select>
            </div>

            {loading && <p>Cargando...</p>}

            {!loading && requests.length === 0 && (
                <p className="text-muted">No hay solicitudes {filter !== 'all' ? filter : ''}</p>
            )}

            {/* Requests Table */}
            {!loading && requests.length > 0 && (
                <div style={{
                    overflowX: 'auto',
                    marginTop: '1rem',
                    WebkitOverflowScrolling: 'touch' // Smooth scrolling on iOS
                }}>
                    <table className="table" style={{ minWidth: '800px' }}>
                        <thead>
                            <tr>
                                <th>Empleado</th>
                                <th>Tipo</th>
                                <th>Fecha</th>
                                <th>Entrada</th>
                                <th>Salida</th>
                                <th>Motivo</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map((req) => (
                                <tr
                                    key={req.id}
                                    ref={(el) => cardRefs.current[req.id] = el}
                                    style={{
                                        transition: 'background-color 0.3s ease',
                                        backgroundColor: highlightedId === req.id ? '#fef3c7' : 'transparent'
                                    }}
                                >
                                    <td>
                                        <strong>{req.profiles?.full_name || 'Desconocido'}</strong>
                                        {req.profiles?.employee_code && (
                                            <div style={{ fontSize: '0.875rem', color: '#666' }}>
                                                {req.profiles.employee_code}
                                            </div>
                                        )}
                                    </td>
                                    <td>{getTypeLabel(req.request_type)}</td>
                                    <td>
                                        {req.requested_date
                                            ? format(new Date(req.requested_date), 'dd/MM/yyyy', { locale: es })
                                            : '-'
                                        }
                                    </td>
                                    <td>
                                        {req.requested_start_at
                                            ? format(new Date(req.requested_start_at), 'HH:mm')
                                            : '-'
                                        }
                                    </td>
                                    <td>
                                        {req.requested_end_at
                                            ? format(new Date(req.requested_end_at), 'HH:mm')
                                            : '-'
                                        }
                                    </td>
                                    <td style={{ maxWidth: '200px' }}>
                                        <div style={{
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap'
                                        }} title={req.reason}>
                                            {req.reason}
                                        </div>
                                    </td>
                                    <td>{getStatusBadge(req.status)}</td>
                                    <td>
                                        {req.status === 'pending' && (
                                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                <button
                                                    onClick={() => handleReview(req.id, 'approved')}
                                                    disabled={loading}
                                                    className="btn btn-primary"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                                                >
                                                    ✅
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const notes = prompt('Motivo del rechazo (opcional):')
                                                        if (notes !== null) {
                                                            handleReview(req.id, 'rejected', notes)
                                                        }
                                                    }}
                                                    disabled={loading}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                                                >
                                                    ❌
                                                </button>
                                            </div>
                                        )}
                                        {req.status !== 'pending' && req.review_notes && (
                                            <div style={{ fontSize: '0.75rem', color: '#666' }}>
                                                {req.review_notes}
                                            </div>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
