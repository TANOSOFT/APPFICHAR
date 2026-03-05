import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

export function TimeHistory({ userId, refreshTrigger }) {
    const [entries, setEntries] = useState([])
    const [loading, setLoading] = useState(true)
    const [refreshing, setRefreshing] = useState(false)
    const [page, setPage] = useState(0)
    const [hasMore, setHasMore] = useState(true)
    const PAGE_SIZE = 15

    const fetchEntries = async (isManualRefresh = false, isLoadMore = false) => {
        try {
            if (isManualRefresh) {
                setRefreshing(true)
            } else if (!isLoadMore) {
                setLoading(true)
            }

            const currentPage = isLoadMore ? page + 1 : 0
            const from = currentPage * PAGE_SIZE
            const to = from + PAGE_SIZE - 1

            const { data, error } = await supabase
                .from('time_entries')
                .select(`
                    *,
                    break_entries (
                        id,
                        break_type,
                        start_at,
                        end_at
                    )
                `)
                .eq('user_id', userId)
                .order('work_date', { ascending: false })
                .order('start_at', { ascending: false })
                .range(from, to)

            if (error) throw error

            if (isLoadMore) {
                setEntries(prev => [...prev, ...(data || [])])
            } else {
                setEntries(data || [])
            }

            setPage(currentPage)
            setHasMore(data?.length === PAGE_SIZE)
        } catch (err) {
            console.error('Error fetching entries:', err)
        } finally {
            setLoading(false)
            setRefreshing(false)
        }
    }

    const handleManualRefresh = () => {
        fetchEntries(true, false)
    }

    const handleLoadMore = () => {
        fetchEntries(false, true)
    }

    useEffect(() => {
        if (!userId) return

        fetchEntries()

        // Subscribe to realtime changes for this user's time_entries
        const channel = supabase
            .channel(`time_entries_${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*', // Listen to all events (INSERT, UPDATE, DELETE)
                    schema: 'public',
                    table: 'time_entries',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    console.log('⚡ Time entry changed (realtime):', payload.eventType, payload)
                    // Refresh entries when any change occurs
                    fetchEntries()
                }
            )
            .subscribe((status) => {
                console.log('📡 Realtime subscription status:', status)
            })

        // Cleanup subscription on unmount
        return () => {
            console.log('Cleaning up realtime subscription')
            supabase.removeChannel(channel)
        }
    }, [userId, refreshTrigger]) // Refetch when refreshTrigger changes

    const formatDuration = (start, end, breaks = []) => {
        if (!end) return 'En curso...'
        const startDate = new Date(start)
        const endDate = new Date(end)
        let totalWorkTime = endDate - startDate

        // Subtract break durations
        if (breaks && breaks.length > 0) {
            const totalBreakTime = breaks.reduce((acc, breakEntry) => {
                if (breakEntry.end_at) {
                    const breakStart = new Date(breakEntry.start_at)
                    const breakEnd = new Date(breakEntry.end_at)
                    return acc + (breakEnd - breakStart)
                }
                return acc
            }, 0)
            totalWorkTime -= totalBreakTime
        }

        const hours = Math.floor(totalWorkTime / (1000 * 60 * 60))
        const minutes = Math.floor((totalWorkTime % (1000 * 60 * 60)) / (1000 * 60))
        return `${hours}h ${minutes}m`
    }

    const getTotalBreakTime = (breaks = []) => {
        if (!breaks || breaks.length === 0) return null

        const totalBreakMs = breaks.reduce((acc, breakEntry) => {
            if (breakEntry.end_at) {
                const breakStart = new Date(breakEntry.start_at)
                const breakEnd = new Date(breakEntry.end_at)
                return acc + (breakEnd - breakStart)
            }
            return acc
        }, 0)

        if (totalBreakMs === 0) return null

        const minutes = Math.floor(totalBreakMs / (1000 * 60))
        return `${minutes}m`
    }

    if (loading) return <div className="card">Cargando historial...</div>

    if (entries.length === 0) {
        return (
            <div className="card">
                <h3>Historial de Fichajes</h3>
                <p className="text-muted">No tienes fichajes registrados todavía.</p>
            </div>
        )
    }

    return (
        <div className="card" style={{ marginTop: '2rem', position: 'relative' }}>
            {/* Floating Refresh Button */}
            <button
                onClick={handleManualRefresh}
                disabled={refreshing}
                title="Actualizar listado"
                style={{
                    position: 'absolute',
                    top: '1rem',
                    right: '1rem',
                    padding: '0.5rem 1rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: refreshing ? 'wait' : 'pointer',
                    fontSize: '0.875rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s',
                    opacity: refreshing ? 0.7 : 1,
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                    zIndex: 10
                }}
                onMouseEnter={(e) => !refreshing && (e.target.style.backgroundColor = '#2563eb')}
                onMouseLeave={(e) => !refreshing && (e.target.style.backgroundColor = '#3b82f6')}
            >
                <span style={{
                    display: 'inline-block',
                    animation: refreshing ? 'spin 1s linear infinite' : 'none',
                    fontSize: '1rem'
                }}>
                    🔄
                </span>
                {refreshing ? 'Actualizando...' : 'Actualizar'}
            </button>

            <style>
                {`
                    @keyframes spin {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                `}
            </style>

            <h3>Historial de Fichajes</h3>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', marginTop: '1rem', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '2px solid var(--border-color)', textAlign: 'left' }}>
                            <th style={{ padding: '0.5rem' }}>Fecha</th>
                            <th style={{ padding: '0.5rem' }}>Entrada</th>
                            <th style={{ padding: '0.5rem' }}>Salida</th>
                            <th style={{ padding: '0.5rem' }}>Pausas</th>
                            <th style={{ padding: '0.5rem' }}>Tiempo Neto</th>
                            <th style={{ padding: '0.5rem' }}>Estado</th>
                        </tr>
                    </thead>
                    <tbody>
                        {entries.map((entry) => {
                            const breakTime = getTotalBreakTime(entry.break_entries)
                            return (
                                <tr key={entry.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                    <td style={{ padding: '0.5rem' }}>
                                        {format(new Date(entry.work_date), 'dd/MM/yyyy')}
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        {format(new Date(entry.start_at), 'HH:mm')}
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        {entry.end_at ? format(new Date(entry.end_at), 'HH:mm') : '-'}
                                    </td>
                                    <td style={{ padding: '0.5rem', color: breakTime ? '#856404' : '#999' }}>
                                        {breakTime || '-'}
                                    </td>
                                    <td style={{ padding: '0.5rem', fontWeight: 'bold' }}>
                                        {formatDuration(entry.start_at, entry.end_at, entry.break_entries)}
                                    </td>
                                    <td style={{ padding: '0.5rem' }}>
                                        <span
                                            style={{
                                                padding: '0.25rem 0.5rem',
                                                borderRadius: '4px',
                                                fontSize: '0.875rem',
                                                backgroundColor: entry.status === 'open' ? 'var(--secondary-color)' : 'var(--bg-secondary)',
                                                color: entry.status === 'open' ? 'white' : 'var(--text-color)'
                                            }}
                                        >
                                            {entry.status === 'open' ? 'Abierto' : 'Cerrado'}
                                        </span>
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>

            {hasMore && (
                <div style={{ textAlign: 'center', marginTop: '1.5rem' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={handleLoadMore}
                        disabled={loading}
                        style={{
                            padding: '0.5rem 2rem',
                            fontSize: '0.875rem',
                            backgroundColor: '#f3f4f6',
                            color: '#374151',
                            borderColor: '#d1d5db',
                            fontWeight: '600'
                        }}
                    >
                        {loading ? 'Cargando más...' : '🔽 Cargar más registros'}
                    </button>
                </div>
            )}
        </div>
    )
}
