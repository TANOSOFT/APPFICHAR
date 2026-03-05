import { useState, useEffect } from 'react'
import { CompanySettings } from './CompanySettings'
import { EmployeeInvite } from './EmployeeInvite'
import { ReportGenerator } from './ReportGenerator'
import { AdminDashboard } from './AdminDashboard'
import { AdminAnalytics } from './AdminAnalytics'
import { CorrectionRequest } from './CorrectionRequest'
import { CorrectionReview } from './CorrectionReview'
import { AbsenceReview } from './AbsenceReview'

export function AdminMenu({ profile, userId, initialTab = 'reports', onComplete, onRefresh }) {
    const [activeTab, setActiveTab] = useState(initialTab)

    // Listen for navigation events from notifications
    useEffect(() => {
        const handleNavigateToReview = (event) => {
            setActiveTab('corrections_review')
        }

        const handleNavigateToAbsence = (event) => {
            setActiveTab('absences')
        }

        window.addEventListener('navigateToCorrectionsReview', handleNavigateToReview)
        window.addEventListener('navigateToAbsenceReview', handleNavigateToAbsence)

        return () => {
            window.removeEventListener('navigateToCorrectionsReview', handleNavigateToReview)
            window.removeEventListener('navigateToAbsenceReview', handleNavigateToAbsence)
        }
    }, [])

    const allTabs = [
        { id: 'reports', label: '📊 Reportes' },
        { id: 'analytics', label: '📈 Analytics' },
        { id: 'dashboard', label: '👥 Panel Empleados' },
        { id: 'absences', label: '📅 Gestionar Ausencias' },
        { id: 'corrections_request', label: '✏️ Solicitar Corrección' },
        { id: 'corrections_review', label: '📋 Revisar Correcciones' },
        { id: 'employees', label: '✉️ Invitar Empleados', roles: ['admin'] },
        { id: 'branding', label: '🎨 Branding', roles: ['admin'] }
    ]

    const tabs = allTabs.filter(tab => !tab.roles || tab.roles.includes(profile.role))

    return (
        <div className="card admin-menu-card" style={{ marginTop: '2rem', padding: '1rem' }}>
            <h3>⚙️ Menú de Administración</h3>
            <p className="text-muted">Gestiona la configuración de tu empresa</p>

            {/* Tabs */}
            <div style={{
                display: 'flex',
                gap: '0.25rem',
                marginTop: '1.5rem',
                borderBottom: '2px solid var(--border-color)',
                paddingBottom: '0',
                overflowX: 'auto',
                whiteSpace: 'nowrap',
                scrollbarWidth: 'none', // Firefox
                msOverflowStyle: 'none', // IE/Edge
                WebkitOverflowScrolling: 'touch'
            }}>
                <style>{`
                    .admin-tabs::-webkit-scrollbar {
                        display: none;
                    }
                `}</style>
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        style={{
                            flexShrink: 0,
                            padding: '0.75rem 1rem',
                            border: 'none',
                            background: activeTab === tab.id ? '#fff' : 'transparent',
                            borderBottom: activeTab === tab.id ? '3px solid #428bca' : '3px solid transparent',
                            cursor: 'pointer',
                            fontWeight: activeTab === tab.id ? 'bold' : 'normal',
                            fontSize: '0.9rem',
                            color: activeTab === tab.id ? '#428bca' : '#666',
                            transition: 'all 0.2s ease',
                            marginBottom: '-2px'
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab Content */}
            <div style={{ marginTop: '1.5rem' }}>
                {activeTab === 'reports' && (
                    <div>
                        <h4>📊 Generar Reportes</h4>
                        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                            Exporta tu registro de jornada laboral en formato PDF
                        </p>
                        <ReportGenerator userId={userId} profile={profile} />
                    </div>
                )}

                {activeTab === 'analytics' && (
                    <div>
                        <h4>📈 Analytics y Estadísticas</h4>
                        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                            Comparativa y análisis de rendimiento de empleados
                        </p>
                        <AdminAnalytics profile={profile} />
                    </div>
                )}

                {activeTab === 'dashboard' && (
                    <div>
                        <h4>👥 Panel de Empleados</h4>
                        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                            Gestiona y visualiza los fichajes de todos los empleados
                        </p>
                        <AdminDashboard profile={profile} />
                    </div>
                )}

                {activeTab === 'absences' && (
                    <div>
                        <AbsenceReview profile={profile} />
                    </div>
                )}

                {activeTab === 'corrections_request' && (
                    <div>
                        <CorrectionRequest profile={profile} />
                    </div>
                )}

                {activeTab === 'corrections_review' && (
                    <div>
                        <CorrectionReview profile={profile} />
                    </div>
                )}

                {activeTab === 'employees' && (
                    <div>
                        <h4>✉️ Invitar Empleados</h4>
                        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                            Invita nuevos empleados a tu empresa
                        </p>
                        <EmployeeInvite profile={profile} />
                    </div>
                )}

                {activeTab === 'branding' && (
                    <div>
                        <h4>🎨 Configuración de Branding</h4>
                        <p className="text-muted" style={{ marginBottom: '1.5rem' }}>
                            Personaliza el logo, colores y datos legales de tu empresa
                        </p>
                        <CompanySettings profile={profile} onComplete={onComplete} />
                    </div>
                )}
            </div>
        </div>
    )
}
