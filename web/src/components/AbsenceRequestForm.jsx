import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, parseISO } from 'date-fns'

export function AbsenceRequestForm({ profile }) {
    const [loading, setLoading] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const [absenceType, setAbsenceType] = useState('vacation')
    const [startDate, setStartDate] = useState('')
    const [endDate, setEndDate] = useState('')
    const [reason, setReason] = useState('')
    const [requests, setRequests] = useState([])

    useEffect(() => {
        if (profile) {
            fetchMyRequests()
        }
    }, [profile])

    const fetchMyRequests = async () => {
        try {
            const { data, error } = await supabase
                .from('absence_requests')
                .select('*')
                .eq('user_id', profile.id)
                .order('created_at', { ascending: false })
                .limit(10)

            if (error) throw error
            setRequests(data || [])
        } catch (err) {
            console.error('Error fetching absence requests:', err)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!startDate || !endDate) {
            alert('Por favor selecciona las fechas de inicio y fin')
            return
        }

        if (new Date(startDate) > new Date(endDate)) {
            alert('La fecha de inicio no puede ser posterior a la de fin')
            return
        }

        try {
            setLoading(true)

            const { error } = await supabase
                .from('absence_requests')
                .insert([{
                    user_id: profile.id,
                    tenant_id: profile.tenant_id,
                    type: absenceType,
                    start_date: startDate,
                    end_date: endDate,
                    reason: reason.trim(),
                    status: 'pending'
                }])

            if (error) throw error

            alert('✅ Solicitud enviada correctamente')
            setStartDate('')
            setEndDate('')
            setReason('')
            fetchMyRequests()
        } catch (err) {
            console.error('Error submitting absence request:', err)
            alert('Error al enviar solicitud: ' + err.message)
        } finally {
            setLoading(false)
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

    const getTypeTranslation = (type) => {
        switch (type) {
            case 'vacation': return 'Vacaciones'
            case 'sick_leave': return 'Baja Médica'
            case 'personal_days': return 'Asuntos Propios'
            default: return 'Otro'
        }
    }

    return (
        <div>
            <div
                onClick={() => setExpanded(!expanded)}
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    cursor: 'pointer',
                    padding: '0.5rem 0',
                    borderBottom: expanded ? '2px solid var(--primary-color)' : 'none',
                    marginBottom: expanded ? '1.5rem' : '0'
                }}
            >
                <h4 style={{ margin: 0 }}>🏖️ Gestionar Vacaciones y Ausencias</h4>
                <span style={{ fontSize: '1.5rem' }}>{expanded ? '▼' : '▶'}</span>
            </div>

            {!expanded && (
                <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    Solicita vacaciones, bajas o días de asuntos propios.
                </p>
            )}

            {expanded && (
                <div>
                    <form onSubmit={handleSubmit} style={{ marginBottom: '2rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Tipo de Ausencia *</label>
                                <select
                                    value={absenceType}
                                    onChange={(e) => setAbsenceType(e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                    required
                                >
                                    <option value="vacation">Vacaciones</option>
                                    <option value="sick_leave">Baja Médica</option>
                                    <option value="personal_days">Asuntos Propios</option>
                                    <option value="other">Otro</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Fecha Inicio *</label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                    required
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Fecha Fin *</label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)' }}
                                    required
                                />
                            </div>
                        </div>

                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Motivo / Comentarios</label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Opcional: Detalles adicionales..."
                                style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', minHeight: '80px' }}
                            />
                        </div>

                        <button type="submit" disabled={loading} className="btn btn-primary" style={{ width: '100%' }}>
                            {loading ? 'Enviando...' : '✈️ Enviar Solicitud'}
                        </button>
                    </form>

                    <h5 style={{ borderBottom: '1px solid #eee', paddingBottom: '0.5rem' }}>Mis Solicitudes Recientes</h5>
                    {requests.length === 0 ? (
                        <p className="text-muted" style={{ fontSize: '0.875rem' }}>No tienes solicitudes registradas.</p>
                    ) : (
                        <div className="table-responsive">
                            <table className="table" style={{ fontSize: '0.875rem' }}>
                                <thead>
                                    <tr>
                                        <th>Tipo</th>
                                        <th>Inicio</th>
                                        <th>Fin</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {requests.map(req => (
                                        <tr key={req.id}>
                                            <td>{getTypeTranslation(req.type)}</td>
                                            <td>{format(parseISO(req.start_date), 'dd/MM/yyyy')}</td>
                                            <td>{format(parseISO(req.end_date), 'dd/MM/yyyy')}</td>
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
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
