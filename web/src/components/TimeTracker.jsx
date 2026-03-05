import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function TimeTracker({ profile: initialProfile, session, onEntryChange }) {
    const [loading, setLoading] = useState(true)
    const [currentEntry, setCurrentEntry] = useState(null)
    const [currentBreak, setCurrentBreak] = useState(null)
    const [profile, setProfile] = useState(initialProfile)

    useEffect(() => {
        if (initialProfile) {
            setProfile(initialProfile);
            fetchState();
        }
    }, [initialProfile, session]);

    const fetchState = async () => {
        try {
            setLoading(true)
            const { user } = session

            // 1. Get Open Entry (robustly find the latest)
            const { data: entryDataList } = await supabase
                .from('time_entries')
                .select('*')
                .eq('user_id', user.id)
                .eq('status', 'open')
                .order('start_at', { ascending: false })
                .limit(1)

            const entryData = entryDataList && entryDataList.length > 0 ? entryDataList[0] : null

            // Check for stale entries (> 24h)
            if (entryData && entryData.status === 'open') {
                const startTime = new Date(entryData.start_at).getTime();
                const nowTime = new Date().getTime();
                const diffHours = (nowTime - startTime) / (1000 * 60 * 60);

                if (diffHours >= 24) {
                    console.log('🕒 Entry older than 24h detected, auto-closing...');
                    await handleAutoClose(entryData);
                    return; // fetchState will be called again by handleAutoClose/onEntryChange
                }
            }

            setCurrentEntry(entryData)

            // 2. Get Active Break (robustly find the latest)
            if (entryData) {
                const { data: breakDataList } = await supabase
                    .from('break_entries')
                    .select('*')
                    .eq('time_entry_id', entryData.id)
                    .is('end_at', null)
                    .order('start_at', { ascending: false })
                    .limit(1)

                const breakData = breakDataList && breakDataList.length > 0 ? breakDataList[0] : null
                setCurrentBreak(breakData)
            }

        } catch (error) {
            console.error('Error loading state:', error)
        } finally {
            setLoading(false)
        }
    }

    const handleClockIn = async () => {
        if (!profile || !profile.tenant_id) {
            console.error('❌ No tenant_id found, cannot clock in')
            alert('Error: Tu usuario no está vinculado a ninguna empresa. Por favor, contacta con tu administrador.')
            return
        }

        // Guard: Prevent duplicate start if already working
        if (currentEntry) {
            console.warn('⚠️ Already have an open entry, skipping insert');
            return;
        }

        try {
            setLoading(true)
            const { data, error } = await supabase.from('time_entries').insert({
                tenant_id: profile.tenant_id,
                user_id: profile.id,
                start_at: new Date().toISOString(),
                status: 'open',
                source: 'web'
            }).select().single()

            if (error) throw error
            setCurrentEntry(data)
            if (onEntryChange) onEntryChange()
        } catch (err) {
            alert(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleClockOut = async () => {
        if (!currentEntry) return
        try {
            setLoading(true)
            const now = new Date().toISOString()
            console.log('🕒 Attempting clock-out for entry:', currentEntry.id, 'at', now)

            const { error } = await supabase.from('time_entries').update({
                end_at: now,
                status: 'closed',
                updated_at: now
            }).eq('id', currentEntry.id)

            if (error) {
                console.error('Supabase error during clock-out:', error);
                throw new Error(error.message || 'Error de permisos o red');
            }

            console.log('✅ Clock-out successful')
            setCurrentEntry(null)
            setCurrentBreak(null)
            if (onEntryChange) onEntryChange()
        } catch (err) {
            console.error('❌ Clock-out error:', err.message)
            alert('Error al finalizar jornada: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleAutoClose = async (staleEntry) => {
        try {
            setLoading(true)
            // Default close at 8h after start to avoid huge durations
            const startDate = new Date(staleEntry.start_at);
            const autoEndDate = new Date(startDate.getTime() + (8 * 60 * 60 * 1000)).toISOString();

            const { error: updateError } = await supabase.from('time_entries').update({
                end_at: autoEndDate,
                status: 'closed',
                notes: (staleEntry.notes ? staleEntry.notes + '\n' : '') + 'Sistema: Cierre automático por exceso de 24h'
            }).eq('id', staleEntry.id);

            if (updateError) throw updateError;

            // Notify user
            await supabase.from('notifications').insert({
                user_id: profile.id,
                tenant_id: profile.tenant_id,
                type: 'system_auto_close',
                title: '🕒 Jornada cerrada automáticamente',
                message: 'Tu jornada del ' + startDate.toLocaleDateString() + ' se cerró automáticamente tras 24h abierta para evitar errores.'
            });

            console.log('✅ Stale entry auto-closed');
            if (onEntryChange) onEntryChange();
        } catch (err) {
            console.error('❌ Error auto-closing entry:', err);
            alert('Error al procesar jornada antigua: ' + err.message);
        } finally {
            setLoading(false)
        }
    }

    const handleStartBreak = async () => {
        if (!currentEntry || !profile?.tenant_id) {
            alert('Error: No se pudo verificar la empresa vinculada.')
            return
        }

        // Guard: Prevent duplicate break
        if (currentBreak) {
            console.warn('⚠️ Already in a break, skipping insert');
            return;
        }

        try {
            setLoading(true)
            const { data, error } = await supabase.from('break_entries').insert({
                tenant_id: profile.tenant_id,
                time_entry_id: currentEntry.id,
                break_type: 'rest',
                start_at: new Date().toISOString()
            }).select().single()

            if (error) throw error
            setCurrentBreak(data)
            if (onEntryChange) onEntryChange()
        } catch (err) {
            alert(err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleEndBreak = async () => {
        if (!currentBreak) return
        try {
            setLoading(true)
            const { error } = await supabase.from('break_entries').update({
                end_at: new Date().toISOString()
            }).eq('id', currentBreak.id)

            if (error) throw error
            setCurrentBreak(null)
            if (onEntryChange) onEntryChange()
        } catch (err) {
            alert(err.message)
        } finally {
            setLoading(false)
        }
    }

    if ((loading && !currentEntry && !profile) || (!profile && !loading)) {
        return <div className="card">Cargando estado de fichaje...</div>
    }

    return (
        <div className="card" style={{ maxWidth: '500px', margin: '1.5rem auto', textAlign: 'center' }}>
            <h2 style={{ marginBottom: '1.5rem', color: 'var(--primary-color)' }}>🕒 Registro de Tiempo</h2>

            {currentEntry ? (
                <div>
                    <div style={{
                        padding: '1rem',
                        backgroundColor: '#ecfdf5',
                        borderRadius: '8px',
                        marginBottom: '1rem',
                        border: '1px solid #10b981'
                    }}>
                        <p style={{ margin: 0, color: '#065f46', fontWeight: 'bold' }}>
                            🟢 Trabajando desde las {new Date(currentEntry.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                    </div>

                    {currentBreak ? (
                        <div style={{ marginTop: '1rem', padding: '1rem', backgroundColor: '#fffbeb', borderRadius: '8px', border: '1px solid #f59e0b' }}>
                            <p style={{ margin: '0 0 0.5rem 0', color: '#92400e', fontWeight: 'bold' }}>
                                🟡 En Pausa desde {new Date(currentBreak.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                            <button onClick={handleEndBreak} className="btn" style={{ width: '100%', backgroundColor: '#10b981', color: 'white' }}>
                                Finalizar Pausa
                            </button>
                        </div>
                    ) : (
                        <div style={{ marginTop: '1rem' }}>
                            <button onClick={handleStartBreak} className="btn" style={{ width: '100%', marginBottom: '0.75rem', backgroundColor: '#f59e0b', color: 'white' }}>
                                ☕ Iniciar Pausa
                            </button>
                        </div>
                    )}

                    <div style={{ marginTop: '0.5rem' }}>
                        <button onClick={handleClockOut} className="btn btn-secondary" style={{ width: '100%', backgroundColor: '#ef4444', color: 'white' }}>
                            ⏹️ Finalizar Jornada (Clock Out)
                        </button>
                    </div>
                </div>
            ) : (
                <div style={{ padding: '1rem' }}>
                    <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>No has iniciado jornada todavía.</p>
                    <button onClick={handleClockIn} className="btn btn-primary" style={{ width: '100%', padding: '1rem', fontSize: '1.125rem' }}>
                        ▶️ Iniciar Jornada (Clock In)
                    </button>
                </div>
            )}
        </div>
    )
}
