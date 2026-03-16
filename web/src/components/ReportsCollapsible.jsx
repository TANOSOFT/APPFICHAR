import { useState, useEffect } from 'react'
import { ReportGenerator } from './ReportGenerator'
import { supabase } from '../lib/supabase'
import { SignatureModal } from './SignatureModal'

export function ReportsCollapsible({ userId, profile }) {
    const [expanded, setExpanded] = useState(false)
    const [documents, setDocuments] = useState([])
    const [loading, setLoading] = useState(false)
    const [signingDoc, setSigningDoc] = useState(null)

    useEffect(() => {
        if (expanded) {
            fetchMyDocuments()
        }
    }, [expanded])

    const fetchMyDocuments = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('employee_documents')
                .select('*')
                .eq('employee_id', userId)
                .order('created_at', { ascending: false })

            if (error) throw error
            setDocuments(data || [])
        } catch (err) {
            console.error('Error fetching my documents:', err)
        } finally {
            setLoading(false)
        }
    }

    const downloadDoc = async (path) => {
        try {
            const { data, error } = await supabase.storage
                .from('employee-docs')
                .createSignedUrl(path, 60)
            if (error) throw error
            window.open(data.signedUrl, '_blank')
        } catch (err) {
            alert('Error al descargar: ' + err.message)
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
                    borderBottom: expanded ? '2px solid #4b5563' : 'none',
                    marginBottom: expanded ? '1.5rem' : '0'
                }}
            >
                <h4 style={{ margin: 0 }}>📄 Mis Reportes y Nóminas</h4>
                <span style={{ fontSize: '1.5rem' }}>{expanded ? '▼' : '▶'}</span>
            </div>

            {!expanded && (
                <p className="text-muted" style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                    Nóminas, contratos y registro de jornada mensual
                </p>
            )}

            {/* Collapsible Content */}
            {expanded && (
                <div style={{ padding: '0.5rem 0' }}>
                    <div style={{ marginBottom: '2rem' }}>
                        <h5 style={{ marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}>
                            📅 Registro de Jornada
                        </h5>
                        <ReportGenerator userId={userId} profile={profile} />
                    </div>

                    <div>
                        <h5 style={{ marginBottom: '1rem', borderBottom: '1px solid #e5e7eb', paddingBottom: '0.5rem' }}>
                            📁 Mis Documentos (Nóminas, Contratos)
                        </h5>
                        {loading ? (
                            <p style={{ fontSize: '0.875rem' }}>Cargando documentos...</p>
                        ) : documents.length === 0 ? (
                            <p style={{ fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic' }}>
                                No tienes documentos disponibles todavía.
                            </p>
                        ) : (
                            <ul style={{ listStyle: 'none', padding: 0 }}>
                                {documents.map(doc => (
                                    <li key={doc.id} style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '0.75rem',
                                        borderBottom: '1px solid #f3f4f6',
                                        fontSize: '0.875rem'
                                    }}>
                                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                                            <span style={{ fontWeight: '600' }}>{doc.description || 'Sin descripción'}</span>
                                            <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                                                {doc.document_name} {doc.is_signed && <span style={{ color: '#10b981', fontWeight: 'bold' }}>(FIRMADO)</span>}
                                            </span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            {doc.file_type === 'application/pdf' && !doc.is_signed && (
                                                <button
                                                    onClick={() => setSigningDoc(doc)}
                                                    className="btn"
                                                    style={{
                                                        padding: '0.25rem 0.75rem',
                                                        fontSize: '0.75rem',
                                                        backgroundColor: '#10b981',
                                                        color: 'white'
                                                    }}
                                                >
                                                    ✍️ Firmar
                                                </button>
                                            )}
                                            <button
                                                onClick={() => downloadDoc(doc.file_path)}
                                                className="btn"
                                                style={{
                                                    padding: '0.25rem 0.75rem',
                                                    fontSize: '0.75rem',
                                                    backgroundColor: doc.is_signed ? '#4f46e5' : '#6b7280',
                                                    color: 'white'
                                                }}
                                            >
                                                {doc.is_signed ? '⬇️ Ver Firmado' : '⬇️ Descargar'}
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                    {/* Signature Modal */}
                    <SignatureModal
                        isOpen={!!signingDoc}
                        onClose={() => setSigningDoc(null)}
                        document={signingDoc}
                        userId={userId}
                        onSigned={fetchMyDocuments}
                    />
                </div>
            )}
        </div>
    )
}
