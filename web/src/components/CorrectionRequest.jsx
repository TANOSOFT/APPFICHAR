import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

export function CorrectionRequest({ profile }) {
    const [loading, setLoading] = useState(false)
    const [requestType, setRequestType] = useState('modify')
    const [timeEntryId, setTimeEntryId] = useState('')
    const [reason, setReason] = useState('')
    const [expanded, setExpanded] = useState(false) // Control collapse/expand

    // For modify type
    const [requestedDate, setRequestedDate] = useState('')
    const [requestedStartTime, setRequestedStartTime] = useState('')
    const [requestedEndTime, setRequestedEndTime] = useState('')

    // For calendar
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
    const [selectedDate, setSelectedDate] = useState(null)
    const [selectedEntry, setSelectedEntry] = useState(null)
    const [timeEntries, setTimeEntries] = useState([])

    // Filtered entries based on selected date
    const filteredEntries = selectedDate
        ? timeEntries.filter(entry => isSameDay(parseISO(entry.work_date), selectedDate))
        : []

    useEffect(() => {
        if (requestType === 'modify' || requestType === 'delete') {
            fetchTimeEntries()
        }
    }, [profile, selectedMonth, requestType])

    const fetchTimeEntries = async () => {
        try {
            const [year, month] = selectedMonth.split('-')
            const monthStart = startOfMonth(new Date(year, month - 1))
            const monthEnd = endOfMonth(new Date(year, month - 1))

            const { data, error } = await supabase
                .from('time_entries')
                .select('*')
                .eq('user_id', profile.id)
                .gte('work_date', format(monthStart, 'yyyy-MM-dd'))
                .lte('work_date', format(monthEnd, 'yyyy-MM-dd'))
                .order('work_date', { ascending: false })

            if (error) throw error
            setTimeEntries(data || [])
        } catch (err) {
            console.error('Error fetching time entries:', err)
        }
    }

    const handleEntrySelect = (entry) => {
        setSelectedEntry(entry)
        // Pre-fill fields with current values
        setRequestedDate(entry.work_date)
        setRequestedStartTime(format(new Date(entry.start_at), 'HH:mm'))
        if (entry.end_at) {
            setRequestedEndTime(format(new Date(entry.end_at), 'HH:mm'))
        } else {
            setRequestedEndTime('')
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!reason.trim()) {
            alert('Por favor indica el motivo de la corrección')
            return
        }

        if ((requestType === 'modify' || requestType === 'delete') && !selectedEntry) {
            alert('Por favor selecciona un fichaje para ' + (requestType === 'modify' ? 'modificar' : 'eliminar'))
            return
        }

        try {
            setLoading(true)

            // Get current user
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error('Usuario no autenticado')

            const requestData = {
                tenant_id: profile.tenant_id,
                user_id: user.id,
                request_type: requestType,
                reason: reason.trim(),
                status: 'pending'
            }

            if (requestType === 'modify' || requestType === 'delete') {
                requestData.time_entry_id = selectedEntry.id

                // Store original values for reference
                if (requestType === 'modify') {
                    requestData.original_date = selectedEntry.work_date
                    requestData.original_start_at = selectedEntry.start_at
                    requestData.original_end_at = selectedEntry.end_at
                }
            }

            // Add requested values
            if (requestedDate) {
                requestData.requested_date = requestedDate

                if (requestedStartTime) {
                    // Ensure date is in ISO format (yyyy-MM-dd)
                    const isoDate = requestedDate.includes('-') && requestedDate.length === 10
                        ? requestedDate
                        : format(new Date(requestedDate), 'yyyy-MM-dd')

                    const startDateTime = new Date(`${isoDate}T${requestedStartTime}:00`)
                    requestData.requested_start_at = startDateTime.toISOString()
                }

                if (requestedEndTime) {
                    // Ensure date is in ISO format (yyyy-MM-dd)
                    const isoDate = requestedDate.includes('-') && requestedDate.length === 10
                        ? requestedDate
                        : format(new Date(requestedDate), 'yyyy-MM-dd')

                    const endDateTime = new Date(`${isoDate}T${requestedEndTime}:00`)
                    requestData.requested_end_at = endDateTime.toISOString()
                }
            }

            const { error } = await supabase
                .from('correction_requests')
                .insert([requestData])

            if (error) throw error

            // Send Email Notification to Admins
            const { data: admins } = await supabase
                .from('profiles')
                .select('email')
                .eq('tenant_id', profile.tenant_id)
                .in('role', ['admin', 'super_admin'])
            
            if (admins && admins.length > 0) {
                const typeName = requestType === 'modify' ? 'Modificar fichaje' : requestType === 'add_missing' ? 'Añadir fichaje olvidado' : 'Eliminar fichaje erróneo';
                const dateStr = requestedDate ? format(new Date(requestedDate), 'dd/MM/yyyy') : (selectedEntry ? format(new Date(selectedEntry.work_date), 'dd/MM/yyyy') : '');
                const htmlBody = `
                    <p>Hola Administrador,</p>
                    <p>El empleado <strong>${profile.full_name || user.email}</strong> ha solicitado una corrección de fichaje (<strong>${typeName}</strong>) para la fecha <strong>${dateStr}</strong>.</p>
                    <p>Motivo: ${reason.trim()}</p>
                    <p>Por favor, accede a Fichar App en la pestaña "Ver Notificaciones / Correcciones" para revisar la solicitud y aprobarla o rechazarla.</p>
                `;

                for (const admin of admins) {
                    if (!admin.email) continue;
                    await supabase.functions.invoke('send-monetization-email', {
                        body: {
                            to: admin.email,
                            subject: 'Nueva Corrección de Fichaje: ' + (profile.full_name || 'Empleado'),
                            html: htmlBody,
                            type: 'custom',
                            tenant_id: profile.tenant_id
                        }
                    }).catch(err => console.error('Email invoking failed:', err))
                }
            }

            alert('✅ Solicitud de corrección enviada correctamente')

            // Reset form
            setReason('')
            setSelectedEntry(null)
            setRequestedDate('')
            setRequestedStartTime('')
            setRequestedEndTime('')

        } catch (err) {
            console.error('Error creating correction request:', err)
            alert('Error al enviar solicitud: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            {/* Collapsible Header */}
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
                <h4 style={{ margin: 0 }}>✏️ Solicitar Corrección de Fichaje</h4>
                <span style={{ fontSize: '1.5rem' }}>{expanded ? '▼' : '▶'}</span>
            </div>

            {!expanded && (
                <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    Haz clic para solicitar correcciones de fichajes
                </p>
            )}

            {/* Collapsible Content */}
            {expanded && (
                <div>
                    <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                        Solicita correcciones si olvidaste fichar o hay errores en tus registros
                    </p>

                    <form onSubmit={handleSubmit}>
                        {/* Request Type */}
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                Tipo de Solicitud *
                            </label>
                            <select
                                value={requestType}
                                onChange={(e) => setRequestType(e.target.value)}
                                style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    borderRadius: '4px',
                                    border: '1px solid var(--border-color)'
                                }}
                            >
                                <option value="modify">Modificar fichaje existente</option>
                                <option value="add_missing">Añadir fichaje olvidado</option>
                                <option value="delete">Eliminar fichaje erróneo</option>
                            </select>
                        </div>

                        {/* Time Entry Selection with Calendar (for modify/delete) */}
                        {(requestType === 'modify' || requestType === 'delete') && (
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                    Selecciona el fichaje a {requestType === 'modify' ? 'modificar' : 'eliminar'}:
                                </label>

                                <div style={{
                                    display: 'grid',
                                    gridTemplateColumns: window.innerWidth > 768 ? '300px 1fr' : '1fr',
                                    gap: '1rem'
                                }}>
                                    {/* Calendar Section */}
                                    <div style={{
                                        border: '1px solid var(--border-color)',
                                        borderRadius: '4px',
                                        padding: '1rem'
                                    }}>
                                        {/* Month Selector */}
                                        <div style={{ marginBottom: '1rem' }}>
                                            <input
                                                type="month"
                                                value={selectedMonth}
                                                onChange={(e) => {
                                                    setSelectedMonth(e.target.value)
                                                    setSelectedDate(null)
                                                    setSelectedEntry(null)
                                                }}
                                                max={new Date().toISOString().slice(0, 7)}
                                                style={{
                                                    width: '100%',
                                                    padding: '0.5rem',
                                                    borderRadius: '4px',
                                                    border: '1px solid var(--border-color)'
                                                }}
                                            />
                                        </div>

                                        {/* Calendar Grid */}
                                        <div>
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(7, 1fr)',
                                                gap: '2px',
                                                fontSize: '0.75rem',
                                                textAlign: 'center',
                                                marginBottom: '0.5rem'
                                            }}>
                                                <div style={{ fontWeight: 'bold' }}>L</div>
                                                <div style={{ fontWeight: 'bold' }}>M</div>
                                                <div style={{ fontWeight: 'bold' }}>M</div>
                                                <div style={{ fontWeight: 'bold' }}>J</div>
                                                <div style={{ fontWeight: 'bold' }}>V</div>
                                                <div style={{ fontWeight: 'bold' }}>S</div>
                                                <div style={{ fontWeight: 'bold' }}>D</div>
                                            </div>
                                            <div style={{
                                                display: 'grid',
                                                gridTemplateColumns: 'repeat(7, 1fr)',
                                                gap: '2px'
                                            }}>
                                                {(() => {
                                                    const [year, month] = selectedMonth.split('-')
                                                    const monthStart = startOfMonth(new Date(year, month - 1))
                                                    const monthEnd = endOfMonth(new Date(year, month - 1))
                                                    const days = eachDayOfInterval({ start: monthStart, end: monthEnd })

                                                    // Get day of week for first day (0 = Monday)
                                                    const firstDayOfWeek = (monthStart.getDay() + 6) % 7

                                                    // Add empty cells for days before month starts
                                                    const cells = []
                                                    for (let i = 0; i < firstDayOfWeek; i++) {
                                                        cells.push(<div key={`empty-${i}`} />)
                                                    }

                                                    // Add month days
                                                    days.forEach(day => {
                                                        const hasEntries = timeEntries.some(entry =>
                                                            isSameDay(parseISO(entry.work_date), day)
                                                        )
                                                        const isSelected = selectedDate && isSameDay(day, selectedDate)
                                                        const isToday = isSameDay(day, new Date())

                                                        cells.push(
                                                            <button
                                                                key={day.toISOString()}
                                                                type="button"
                                                                onClick={() => setSelectedDate(day)}
                                                                disabled={!hasEntries}
                                                                style={{
                                                                    padding: '0.5rem',
                                                                    border: isToday ? '2px solid #2196F3' : '1px solid var(--border-color)',
                                                                    borderRadius: '4px',
                                                                    backgroundColor: isSelected ? '#2196F3' : hasEntries ? '#e3f2fd' : '#f9f9f9',
                                                                    color: isSelected ? '#fff' : hasEntries ? '#000' : '#ccc',
                                                                    cursor: hasEntries ? 'pointer' : 'not-allowed',
                                                                    fontSize: '0.75rem',
                                                                    fontWeight: isToday ? 'bold' : 'normal'
                                                                }}
                                                            >
                                                                {format(day, 'd')}
                                                            </button>
                                                        )
                                                    })

                                                    return cells
                                                })()}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Time Entries Table */}
                                    <div>
                                        {filteredEntries.length === 0 && (
                                            <p className="text-muted">
                                                {selectedDate
                                                    ? 'No hay fichajes para este día'
                                                    : 'Selecciona un día con fichajes (resaltado en azul)'}
                                            </p>
                                        )}
                                        {filteredEntries.length > 0 && (
                                            <div style={{
                                                maxHeight: '400px',
                                                overflowY: 'auto',
                                                border: '1px solid var(--border-color)',
                                                borderRadius: '4px'
                                            }}>
                                                <table className="table" style={{ marginBottom: 0 }}>
                                                    <thead style={{ position: 'sticky', top: 0, backgroundColor: '#fff' }}>
                                                        <tr>
                                                            <th>Seleccionar</th>
                                                            <th>Fecha</th>
                                                            <th>Entrada</th>
                                                            <th>Salida</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {filteredEntries.map((entry) => (
                                                            <tr
                                                                key={entry.id}
                                                                onClick={() => handleEntrySelect(entry)}
                                                                style={{
                                                                    cursor: 'pointer',
                                                                    backgroundColor: selectedEntry?.id === entry.id ? '#e3f2fd' : 'transparent'
                                                                }}
                                                            >
                                                                <td>
                                                                    <input
                                                                        type="radio"
                                                                        name="selectedEntry"
                                                                        checked={selectedEntry?.id === entry.id}
                                                                        onChange={() => handleEntrySelect(entry)}
                                                                    />
                                                                </td>
                                                                <td>{format(new Date(entry.work_date), 'dd/MM/yyyy')}</td>
                                                                <td>{format(new Date(entry.start_at), 'HH:mm')}</td>
                                                                <td>{entry.end_at ? format(new Date(entry.end_at), 'HH:mm') : '-'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Reason */}
                        <div style={{ marginBottom: '1rem' }}>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                Motivo *
                            </label>
                            <textarea
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Explica el motivo de la corrección..."
                                style={{
                                    width: '100%',
                                    padding: '0.5rem',
                                    borderRadius: '4px',
                                    border: '1px solid var(--border-color)',
                                    minHeight: '80px',
                                    resize: 'vertical'
                                }}
                                required
                            />
                        </div>

                        {/* Date and Times */}
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: window.innerWidth > 768 ? '1fr 1fr 1fr' : '1fr',
                            gap: '1rem',
                            marginBottom: '1rem'
                        }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                    Fecha
                                </label>
                                <input
                                    type="date"
                                    value={requestedDate}
                                    onChange={(e) => setRequestedDate(e.target.value)}
                                    max={new Date().toISOString().split('T')[0]}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: '4px',
                                        border: '1px solid var(--border-color)'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                    Hora Entrada
                                </label>
                                <input
                                    type="time"
                                    value={requestedStartTime}
                                    onChange={(e) => setRequestedStartTime(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: '4px',
                                        border: '1px solid var(--border-color)'
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                    Hora Salida
                                </label>
                                <input
                                    type="time"
                                    value={requestedEndTime}
                                    onChange={(e) => setRequestedEndTime(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        borderRadius: '4px',
                                        border: '1px solid var(--border-color)'
                                    }}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="btn btn-primary"
                            style={{ width: '100%' }}
                        >
                            {loading ? 'Enviando...' : '📝 Enviar Solicitud'}
                        </button>
                    </form>
                </div>
            )}
        </div>
    )
}
