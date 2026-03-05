import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, differenceInMinutes } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

export function AdminAnalytics({ profile }) {
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
    const [employeeStats, setEmployeeStats] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (profile?.tenant_id && selectedMonth) {
            fetchEmployeeStats()
        }
    }, [profile, selectedMonth])

    const fetchEmployeeStats = async () => {
        try {
            setLoading(true)

            const [year, month] = selectedMonth.split('-')
            const monthStart = startOfMonth(new Date(year, month - 1))
            const monthEnd = endOfMonth(new Date(year, month - 1))

            // Fetch all employees
            const { data: employees, error: empError } = await supabase
                .from('profiles')
                .select('id, full_name, employee_code')
                .eq('tenant_id', profile.tenant_id)
                .order('full_name')

            if (empError) throw empError

            // Fetch all time entries for the month
            const { data: entries, error: entriesError } = await supabase
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
                .eq('tenant_id', profile.tenant_id)
                .gte('work_date', format(monthStart, 'yyyy-MM-dd'))
                .lte('work_date', format(monthEnd, 'yyyy-MM-dd'))

            if (entriesError) throw entriesError

            // Calculate stats per employee
            const stats = employees.map(emp => {
                const empEntries = entries.filter(e => e.user_id === emp.id)

                let totalMinutes = 0
                let totalBreakMinutes = 0
                const daysWorked = new Set()

                empEntries.forEach(entry => {
                    if (entry.end_at) {
                        daysWorked.add(entry.work_date)

                        const workMinutes = differenceInMinutes(
                            new Date(entry.end_at),
                            new Date(entry.start_at)
                        )
                        totalMinutes += workMinutes

                        if (entry.break_entries) {
                            entry.break_entries.forEach(brk => {
                                if (brk.end_at) {
                                    totalBreakMinutes += differenceInMinutes(
                                        new Date(brk.end_at),
                                        new Date(brk.start_at)
                                    )
                                }
                            })
                        }
                    }
                })

                const netMinutes = totalMinutes - totalBreakMinutes
                const totalHours = (netMinutes / 60).toFixed(1)
                const avgHoursPerDay = daysWorked.size > 0 ? (netMinutes / daysWorked.size / 60).toFixed(1) : 0

                return {
                    name: emp.full_name,
                    code: emp.employee_code || 'N/A',
                    totalHours: parseFloat(totalHours),
                    avgHours: parseFloat(avgHoursPerDay),
                    daysWorked: daysWorked.size,
                    entriesCount: empEntries.length
                }
            })

            // Sort by total hours descending
            stats.sort((a, b) => b.totalHours - a.totalHours)

            setEmployeeStats(stats)

        } catch (err) {
            console.error('Error fetching employee stats:', err)
        } finally {
            setLoading(false)
        }
    }

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando estadísticas...</div>
    }

    const totalHours = employeeStats.reduce((sum, emp) => sum + emp.totalHours, 0)
    const avgHours = employeeStats.length > 0 ? (totalHours / employeeStats.length).toFixed(1) : 0

    return (
        <div>
            {/* Month Selector */}
            <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    Seleccionar Mes:
                </label>
                <input
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    max={new Date().toISOString().slice(0, 7)}
                    style={{
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        fontSize: '1rem'
                    }}
                />
            </div>

            {/* Summary Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: window.innerWidth > 768 ? 'repeat(3, 1fr)' : '1fr',
                gap: '1rem',
                marginBottom: '2rem'
            }}>
                <div className="card" style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#f0f9ff' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>
                        {employeeStats.length}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.875rem' }}>Total Empleados</div>
                </div>

                <div className="card" style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#f0fdf4' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>
                        {totalHours.toFixed(1)}h
                    </div>
                    <div style={{ color: '#666', fontSize: '0.875rem' }}>Horas Totales</div>
                </div>

                <div className="card" style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#fef3c7' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
                        {avgHours}h
                    </div>
                    <div style={{ color: '#666', fontSize: '0.875rem' }}>Promedio por Empleado</div>
                </div>
            </div>

            {/* Comparison Chart */}
            {employeeStats.length > 0 && (
                <div className="card" style={{ marginBottom: '1.5rem' }}>
                    <h4 style={{ marginBottom: '1rem' }}>📊 Comparativa de Horas Trabajadas</h4>
                    <ResponsiveContainer width="100%" height={300}>
                        <BarChart data={employeeStats}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                                dataKey="name"
                                angle={-45}
                                textAnchor="end"
                                height={100}
                                style={{ fontSize: '0.75rem' }}
                            />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="totalHours" fill="#3b82f6" name="Horas Totales" />
                            <Bar dataKey="avgHours" fill="#10b981" name="Promedio Diario" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            )}

            {/* Employee Table */}
            <div className="card">
                <h4 style={{ marginBottom: '1rem' }}>👥 Detalle por Empleado</h4>
                <div style={{ overflowX: 'auto' }}>
                    <table className="table" style={{ minWidth: '600px' }}>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Empleado</th>
                                <th>Código</th>
                                <th style={{ textAlign: 'center' }}>Días Trabajados</th>
                                <th style={{ textAlign: 'center' }}>Total Horas</th>
                                <th style={{ textAlign: 'center' }}>Promedio/Día</th>
                            </tr>
                        </thead>
                        <tbody>
                            {employeeStats.map((emp, index) => (
                                <tr key={emp.code}>
                                    <td>{index + 1}</td>
                                    <td style={{ fontWeight: 'bold' }}>{emp.name}</td>
                                    <td>{emp.code}</td>
                                    <td style={{ textAlign: 'center' }}>{emp.daysWorked}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#3b82f6' }}>
                                        {emp.totalHours}h
                                    </td>
                                    <td style={{ textAlign: 'center', color: '#10b981' }}>
                                        {emp.avgHours}h
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {employeeStats.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>
                        No hay datos para este mes
                    </div>
                )}
            </div>
        </div>
    )
}
