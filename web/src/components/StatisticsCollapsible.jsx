import { useState } from 'react'
import { StatisticsOverview } from './StatisticsOverview'

export function StatisticsCollapsible({ userId }) {
    const [expanded, setExpanded] = useState(false)
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))

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
                <h4 style={{ margin: 0 }}>📊 Estadísticas y Análisis</h4>
                <span style={{ fontSize: '1.5rem' }}>{expanded ? '▼' : '▶'}</span>
            </div>

            {!expanded && (
                <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    Ver gráficos y métricas de rendimiento
                </p>
            )}

            {/* Collapsible Content */}
            {expanded && (
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

                    <StatisticsOverview userId={userId} selectedMonth={selectedMonth} />
                </div>
            )}
        </div>
    )
}
