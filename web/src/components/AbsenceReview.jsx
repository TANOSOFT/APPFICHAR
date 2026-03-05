import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { fetchSpanishHolidays } from '../lib/holidayService'

export function AbsenceReview({ profile }) {
    const [requests, setRequests] = useState([])
    const [loading, setLoading] = useState(false)
    const [filterStatus, setFilterStatus] = useState('pending')
    const [filterType, setFilterType] = useState('all')
    const [highlightedId, setHighlightedId] = useState(null)
    const [holidays, setHolidays] = useState([])
    const [fetchingHolidays, setFetchingHolidays] = useState(false)
    const cardRefs = useRef({})

    useEffect(() => {
        if (profile) {
            fetchRequests()
            fetchHolidays()
        }
    }, [profile, filterStatus, filterType])

    // Listen for navigation from notifications
    useEffect(() => {
        const handleNavigate = (event) => {
            console.log('📅 Navigation event received in AbsenceReview:', event.detail)
            const requestId = event.detail?.requestId
            if (requestId) {
                // First, ensure we're showing pending requests (or the right ones)
                setFilterStatus('pending')

                // Wait for render
                setTimeout(() => {
                    const cardElement = cardRefs.current[requestId]
                    if (cardElement) {
                        cardElement.scrollIntoView({ behavior: 'smooth', block: 'center' })
                        setHighlightedId(requestId)
                        setTimeout(() => setHighlightedId(null), 3000)
                    }
                }, 800)
            }
        }

        window.addEventListener('navigateToAbsenceReview', handleNavigate)
        return () => window.removeEventListener('navigateToAbsenceReview', handleNavigate)
    }, [requests])

    const fetchRequests = async () => {
        try {
            setLoading(true)

            let query = supabase
                .from('absence_requests')
                .select(`
                    *,
                    profiles:user_id (
                        id,
                        full_name,
                        employee_code
                    )
                `)
                .eq('tenant_id', profile.tenant_id)
                .order('created_at', { ascending: false })

            if (filterStatus !== 'all') {
                query = query.eq('status', filterStatus)
            }
            if (filterType !== 'all') {
                query = query.eq('type', filterType)
            }

            const { data, error } = await query
            if (error) throw error
            setRequests(data || [])
        } catch (err) {
            console.error('Error fetching absence requests:', err)
            alert('Error al cargar solicitudes: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const fetchHolidays = async () => {
        try {
            const { data, error } = await supabase
                .from('company_holidays')
                .select('*')
                .eq('tenant_id', profile.tenant_id)
                .order('date', { ascending: true })

            if (error) throw error
            setHolidays(data || [])
        } catch (err) {
            console.error('Error fetching holidays:', err)
        }
    }

    const handleAutoLoadHolidays = async () => {
        try {
            // 1. Get tenant info to know the province
            const { data: tenant, error: tError } = await supabase
                .from('tenants')
                .select('province')
                .eq('id', profile.tenant_id)
                .single()

            if (tError) throw tError

            const province = tenant.province || prompt('No se ha definido la provincia de la empresa. Por favor, indícala (ej: Madrid):')
            if (!province) return

            const year = new Date().getFullYear()
            const confirmYear = prompt(`Se cargarán los festivos para ${province} en el año ${year}. ¿Es correcto? (Indica otro año si prefieres):`, year)
            if (!confirmYear) return

            setFetchingHolidays(true)
            const fetched = await fetchSpanishHolidays(confirmYear, province)

            if (fetched.length === 0) {
                alert('No se encontraron festivos para esa provincia/año.')
                return
            }

            // 2. Filter out duplicates (already in DB)
            const existingDates = new Set(holidays.map(h => h.date))
            const newHolidays = fetched.filter(f => !existingDates.has(f.date))

            if (newHolidays.length === 0) {
                alert('Los festivos ya están cargados en el sistema.')
                return
            }

            // 3. Save to database
            const payload = newHolidays.map(h => ({
                tenant_id: profile.tenant_id,
                date: h.date,
                name: h.name
            }))

            const { error: iError } = await supabase
                .from('company_holidays')
                .insert(payload)

            if (iError) throw iError

            alert(`✅ Se han cargado ${newHolidays.length} festivos oficiales (Nacionales y de ${province}).`)
            fetchHolidays()
        } catch (err) {
            console.error('Error loading holidays:', err)
            alert('Error al cargar festivos: ' + err.message)
        } finally {
            setFetchingHolidays(false)
        }
    }

    const handleDeleteHoliday = async (id) => {
        if (!confirm('¿Estás seguro de eliminar este día festivo?')) return
        try {
            const { error } = await supabase
                .from('company_holidays')
                .delete()
                .eq('id', id)

            if (error) throw error
            fetchHolidays()
        } catch (err) {
            alert('Error: ' + err.message)
        }
    }

    const handleReview = async (requestId, newStatus, adminComment = '') => {
        try {
            setLoading(true)

            const { error } = await supabase
                .from('absence_requests')
                .update({
                    status: newStatus,
                    admin_comment: adminComment,
                    updated_at: new Date().toISOString()
                })
                .eq('id', requestId)

            if (error) throw error

            alert(`✅ Solicitud ${newStatus === 'approved' ? 'aprobada' : 'rechazada'} correctamente`)
            fetchRequests()
        } catch (err) {
            console.error('Error reviewing absence request:', err)
            alert('Error al procesar solicitud: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const getTypeTranslation = (type) => {
        switch (type) {
            case 'vacation': return 'Vacaciones'
            case 'sick_leave': return 'Baja Médica'
            case 'personal_days': return 'Asuntos Propios'
            default: return 'Otro'
        }
    }

    const getStatusBadgeStyle = (status) => {
        switch (status) {
            case 'approved': return { backgroundColor: '#d1fae5', color: '#065f46' }
            case 'rejected': return { backgroundColor: '#fee2e2', color: '#991b1b' }
            default: return { backgroundColor: '#fef3c7', color: '#92400e' }
        }
    }

    const getStatusTranslation = (status) => {
        switch (status) {
            case 'approved': return 'Aprobada'
            case 'rejected': return 'Rechazada'
            default: return 'Pendiente'
        }
    }

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                    <h4>📋 Gestionar Solicitudes de Ausencia</h4>
                    <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                        Revisa y gestiona las solicitudes de vacaciones y otras ausencias de tu equipo.
                    </p>
                </div>
                <button
                    onClick={handleAutoLoadHolidays}
                    className="btn btn-secondary"
                    disabled={fetchingHolidays}
                    style={{
                        backgroundColor: '#4f46e5',
                        color: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        fontSize: '0.875rem'
                    }}
                >
                    {fetchingHolidays ? 'Cargando...' : '📅 Cargar Festivos Oficiales'}
                </button>
            </div>

            {/* Current Holidays List (Mini View) */}
            {holidays.length > 0 && (
                <div style={{
                    marginBottom: '2rem',
                    padding: '1rem',
                    backgroundColor: '#f8fafc',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                }}>
                    <h5 style={{ margin: 0, fontSize: '0.9rem', color: '#475569' }}>Festivos Configurables ({holidays.length})</h5>
                    <div style={{
                        display: 'flex',
                        gap: '0.5rem',
                        marginTop: '0.75rem',
                        overflowX: 'auto',
                        paddingBottom: '0.5rem'
                    }}>
                        {holidays.map(h => (
                            <div key={h.id} style={{
                                flexShrink: 0,
                                padding: '0.25rem 0.75rem',
                                backgroundColor: 'white',
                                border: '1px solid #e2e8f0',
                                borderRadius: '16px',
                                fontSize: '0.75rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.4rem'
                            }}>
                                <span>{format(parseISO(h.date), 'dd/MM')}</span>
                                <span style={{ color: '#64748b' }}>{h.name}</span>
                                <button onClick={() => handleDeleteHoliday(h.id)} style={{ border: 'none', background: 'none', color: '#ef4444', padding: 0, cursor: 'pointer', fontSize: '0.8rem' }}>×</button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Estado</label>
                    <select
                        value={filterStatus}
                        onChange={(e) => setFilterStatus(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                    >
                        <option value="pending">Pendientes</option>
                        <option value="approved">Aprobadas</option>
                        <option value="rejected">Rechazadas</option>
                        <option value="all">Todas</option>
                    </select>
                </div>
                <div>
                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: 'bold', marginBottom: '0.25rem' }}>Tipo</label>
                    <select
                        value={filterType}
                        onChange={(e) => setFilterType(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                    >
                        <option value="all">Todos</option>
                        <option value="vacation">Vacaciones</option>
                        <option value="sick_leave">Baja Médica</option>
                        <option value="personal_days">Asuntos Propios</option>
                        <option value="other">Otro</option>
                    </select>
                </div>
            </div>

            {loading && <p>Cargando solicitudes...</p>}

            {!loading && requests.length === 0 ? (
                <p className="text-muted">No se encontraron solicitudes.</p>
            ) : (
                <div className="table-responsive">
                    <table className="table">
                        <thead>
                            <tr>
                                <th>Empleado</th>
                                <th>Tipo</th>
                                <th>Inicio</th>
                                <th>Fin</th>
                                <th>Motivo</th>
                                <th>Estado</th>
                                <th>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {requests.map(req => (
                                <tr
                                    key={req.id}
                                    ref={(el) => cardRefs.current[req.id] = el}
                                    style={{
                                        transition: 'background-color 0.3s ease',
                                        backgroundColor: highlightedId === req.id ? '#fef3c7' : 'transparent'
                                    }}
                                >
                                    <td>
                                        <strong>{req.profiles?.full_name}</strong>
                                        {req.profiles?.employee_code && (
                                            <div style={{ fontSize: '0.75rem', color: '#666' }}>{req.profiles.employee_code}</div>
                                        )}
                                    </td>
                                    <td>{getTypeTranslation(req.type)}</td>
                                    <td>{format(parseISO(req.start_date), 'dd/MM/yyyy')}</td>
                                    <td>{format(parseISO(req.end_date), 'dd/MM/yyyy')}</td>
                                    <td>
                                        <div style={{ maxWidth: '200px', fontSize: '0.875rem' }} title={req.reason}>
                                            {req.reason || '-'}
                                        </div>
                                    </td>
                                    <td>
                                        <span style={{
                                            padding: '2px 8px',
                                            borderRadius: '12px',
                                            fontSize: '0.75rem',
                                            fontWeight: 'bold',
                                            ...getStatusBadgeStyle(req.status)
                                        }}>
                                            {getStatusTranslation(req.status)}
                                        </span>
                                    </td>
                                    <td>
                                        {req.status === 'pending' && (
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => handleReview(req.id, 'approved')}
                                                    className="btn btn-primary"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                >
                                                    Aprobar
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        const comment = prompt('Comentario (opcional):')
                                                        if (comment !== null) handleReview(req.id, 'rejected', comment)
                                                    }}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                >
                                                    Rechazar
                                                </button>
                                            </div>
                                        )}
                                        {req.status !== 'pending' && req.admin_comment && (
                                            <div style={{ fontSize: '0.75rem', color: '#666', fontStyle: 'italic' }}>
                                                "{req.admin_comment}"
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
