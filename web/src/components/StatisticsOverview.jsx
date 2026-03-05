import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, startOfWeek, endOfWeek, differenceInMinutes } from 'date-fns'
import { es } from 'date-fns/locale'
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444']

export function StatisticsOverview({ userId, selectedMonth }) {
    const [stats, setStats] = useState(null)
    const [dailyData, setDailyData] = useState([])
    const [weeklyData, setWeeklyData] = useState([])
    const [distributionData, setDistributionData] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (userId && selectedMonth) {
            fetchStatistics()
        }
    }, [userId, selectedMonth])

    const fetchStatistics = async () => {
        try {
            setLoading(true)

            const [year, month] = selectedMonth.split('-')
            const monthStart = startOfMonth(new Date(year, month - 1))
            const monthEnd = endOfMonth(new Date(year, month - 1))

            // Fetch time entries with breaks
            const { data: entries, error } = await supabase
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
                .gte('work_date', format(monthStart, 'yyyy-MM-dd'))
                .lte('work_date', format(monthEnd, 'yyyy-MM-dd'))
                .order('work_date', { ascending: true })

            if (error) throw error

            // Calculate statistics
            calculateStats(entries, monthStart, monthEnd)
            prepareDailyData(entries, monthStart, monthEnd)
            prepareWeeklyData(entries)
            prepareDistributionData(entries)

        } catch (err) {
            console.error('Error fetching statistics:', err)
        } finally {
            setLoading(false)
        }
    }

    const calculateStats = (entries, monthStart, monthEnd) => {
        let totalMinutes = 0
        let totalBreakMinutes = 0
        let daysWorked = new Set()

        entries.forEach(entry => {
            if (entry.end_at) {
                daysWorked.add(entry.work_date)

                const workMinutes = differenceInMinutes(
                    new Date(entry.end_at),
                    new Date(entry.start_at)
                )
                totalMinutes += workMinutes

                // Calculate breaks
                if (entry.break_entries && entry.break_entries.length > 0) {
                    entry.break_entries.forEach(brk => {
                        if (brk.end_at) {
                            const breakMinutes = differenceInMinutes(
                                new Date(brk.end_at),
                                new Date(brk.start_at)
                            )
                            totalBreakMinutes += breakMinutes
                        }
                    })
                }
            }
        })

        const netMinutes = totalMinutes - totalBreakMinutes
        const totalHours = Math.floor(netMinutes / 60)
        const totalMins = netMinutes % 60
        const avgHoursPerDay = daysWorked.size > 0 ? (netMinutes / daysWorked.size / 60).toFixed(1) : 0

        // Calculate workable days (Mon-Fri)
        const allDays = eachDayOfInterval({ start: monthStart, end: monthEnd })
        const workableDays = allDays.filter(day => {
            const dayOfWeek = day.getDay()
            return dayOfWeek !== 0 && dayOfWeek !== 6 // Not Sunday or Saturday
        }).length

        setStats({
            totalHours: `${totalHours}h ${totalMins}m`,
            totalMinutes: netMinutes,
            avgHoursPerDay,
            daysWorked: daysWorked.size,
            workableDays,
            attendanceRate: ((daysWorked.size / workableDays) * 100).toFixed(1)
        })
    }

    const prepareDailyData = (entries, monthStart, monthEnd) => {
        const dailyMap = {}

        entries.forEach(entry => {
            if (!entry.end_at) return

            const date = entry.work_date
            if (!dailyMap[date]) {
                dailyMap[date] = { totalMinutes: 0, breakMinutes: 0 }
            }

            const workMinutes = differenceInMinutes(
                new Date(entry.end_at),
                new Date(entry.start_at)
            )
            dailyMap[date].totalMinutes += workMinutes

            if (entry.break_entries) {
                entry.break_entries.forEach(brk => {
                    if (brk.end_at) {
                        dailyMap[date].breakMinutes += differenceInMinutes(
                            new Date(brk.end_at),
                            new Date(brk.start_at)
                        )
                    }
                })
            }
        })

        const chartData = Object.keys(dailyMap).map(date => ({
            day: format(new Date(date), 'dd/MM'),
            hours: ((dailyMap[date].totalMinutes - dailyMap[date].breakMinutes) / 60).toFixed(1)
        }))

        setDailyData(chartData)
    }

    const prepareWeeklyData = (entries) => {
        const weeklyMap = {}

        entries.forEach(entry => {
            if (!entry.end_at) return

            const date = new Date(entry.work_date)
            const weekStart = startOfWeek(date, { weekStartsOn: 1 })
            const weekKey = format(weekStart, 'yyyy-MM-dd')

            if (!weeklyMap[weekKey]) {
                weeklyMap[weekKey] = { totalMinutes: 0, breakMinutes: 0 }
            }

            const workMinutes = differenceInMinutes(
                new Date(entry.end_at),
                new Date(entry.start_at)
            )
            weeklyMap[weekKey].totalMinutes += workMinutes

            if (entry.break_entries) {
                entry.break_entries.forEach(brk => {
                    if (brk.end_at) {
                        weeklyMap[weekKey].breakMinutes += differenceInMinutes(
                            new Date(brk.end_at),
                            new Date(brk.start_at)
                        )
                    }
                })
            }
        })

        const chartData = Object.keys(weeklyMap)
            .sort()
            .map((weekKey, index) => ({
                week: `Sem ${index + 1}`,
                hours: ((weeklyMap[weekKey].totalMinutes - weeklyMap[weekKey].breakMinutes) / 60).toFixed(1)
            }))

        setWeeklyData(chartData)
    }

    const prepareDistributionData = (entries) => {
        let totalWorkMinutes = 0
        let totalBreakMinutes = 0

        entries.forEach(entry => {
            if (!entry.end_at) return

            totalWorkMinutes += differenceInMinutes(
                new Date(entry.end_at),
                new Date(entry.start_at)
            )

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
        })

        const netWorkMinutes = totalWorkMinutes - totalBreakMinutes

        setDistributionData([
            { name: 'Trabajo', value: parseFloat((netWorkMinutes / 60).toFixed(1)) },
            { name: 'Pausas', value: parseFloat((totalBreakMinutes / 60).toFixed(1)) }
        ])
    }

    if (loading) {
        return <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando estadísticas...</div>
    }

    if (!stats) {
        return <div style={{ textAlign: 'center', padding: '2rem' }}>No hay datos disponibles</div>
    }

    return (
        <div>
            {/* Key Metrics Cards */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: window.innerWidth > 768 ? 'repeat(4, 1fr)' : 'repeat(2, 1fr)',
                gap: '1rem',
                marginBottom: '2rem'
            }}>
                <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#3b82f6' }}>
                        {stats.totalHours}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.875rem' }}>Total Trabajadas</div>
                </div>

                <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#10b981' }}>
                        {stats.avgHoursPerDay}h
                    </div>
                    <div style={{ color: '#666', fontSize: '0.875rem' }}>Promedio Diario</div>
                </div>

                <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>
                        {stats.daysWorked}/{stats.workableDays}
                    </div>
                    <div style={{ color: '#666', fontSize: '0.875rem' }}>Días Trabajados</div>
                </div>

                <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
                    <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#8b5cf6' }}>
                        {stats.attendanceRate}%
                    </div>
                    <div style={{ color: '#666', fontSize: '0.875rem' }}>Asistencia</div>
                </div>
            </div>

            {/* Charts */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: window.innerWidth > 1024 ? '2fr 1fr' : '1fr',
                gap: '1rem',
                marginBottom: '1rem'
            }}>
                {/* Daily Hours Chart */}
                <div className="card">
                    <h4 style={{ marginBottom: '1rem' }}>📊 Horas por Día</h4>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={dailyData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="day" style={{ fontSize: '0.75rem' }} />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="hours" fill="#3b82f6" name="Horas" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* Distribution Pie Chart */}
                <div className="card">
                    <h4 style={{ marginBottom: '1rem' }}>⏱️ Distribución de Tiempo</h4>
                    <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                            <Pie
                                data={distributionData}
                                cx="50%"
                                cy="50%"
                                labelLine={false}
                                label={({ name, value }) => `${name}: ${value}h`}
                                outerRadius={80}
                                fill="#8884d8"
                                dataKey="value"
                            >
                                {distributionData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Weekly Trend Chart */}
            {weeklyData.length > 0 && (
                <div className="card">
                    <h4 style={{ marginBottom: '1rem' }}>📈 Tendencia Semanal</h4>
                    <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={weeklyData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="week" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="hours" stroke="#10b981" strokeWidth={2} name="Horas" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    )
}
