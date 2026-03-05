import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function DocumentManager({ employee, adminProfile }) {
    const [documents, setDocuments] = useState([])
    const [selectedFile, setSelectedFile] = useState(null)
    const [description, setDescription] = useState('')
    const [uploading, setUploading] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        if (employee) {
            fetchDocuments()
        }
    }, [employee])

    const fetchDocuments = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('employee_documents')
                .select('*')
                .eq('employee_id', employee.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            setDocuments(data || [])
        } catch (err) {
            console.error('Error fetching documents:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleFileChange = (event) => {
        const file = event.target.files[0]
        if (file) {
            if (file.type !== 'application/pdf') {
                alert('Por favor, selecciona solo archivos PDF.')
                event.target.value = ''
                setSelectedFile(null)
                return
            }
            setSelectedFile(file)
        }
    }

    const handleUpload = async () => {
        if (!selectedFile) {
            alert('Por favor, selecciona un archivo primero.')
            return
        }

        if (!description.trim()) {
            if (!window.confirm('¿Quieres subir el documento sin descripción?')) return
        }

        try {
            setUploading(true)

            const fileExt = selectedFile.name.split('.').pop()
            const fileName = `${Math.random()}.${fileExt}`
            const filePath = `${adminProfile.tenant_id}/${employee.id}/${fileName}`

            // 1. Upload to Storage
            const { error: uploadError } = await supabase.storage
                .from('employee-docs')
                .upload(filePath, selectedFile)

            if (uploadError) throw uploadError

            // 2. Save metadata to Database
            const { error: dbError } = await supabase
                .from('employee_documents')
                .insert([{
                    tenant_id: adminProfile.tenant_id,
                    employee_id: employee.id,
                    document_name: selectedFile.name,
                    description: description.trim() || selectedFile.name,
                    file_path: filePath,
                    file_type: selectedFile.type,
                    uploaded_by: adminProfile.id
                }])

            if (dbError) throw dbError

            alert('✅ Documento subido correctamente')
            setDescription('')
            setSelectedFile(null)
            fetchDocuments()
        } catch (err) {
            console.error('Error uploading document:', err)
            alert('Error al subir documento: ' + err.message)
        } finally {
            setUploading(false)
        }
    }

    const handleDelete = async (doc) => {
        if (!window.confirm(`¿Estás seguro de eliminar el documento "${doc.document_name}"?`)) return

        try {
            setLoading(true)
            // 1. Delete from Storage
            const { error: storageError } = await supabase.storage
                .from('employee-docs')
                .remove([doc.file_path])

            if (storageError) throw storageError

            // 2. Delete from Database
            const { error: dbError } = await supabase
                .from('employee_documents')
                .delete()
                .eq('id', doc.id)

            if (dbError) throw dbError

            alert('✅ Documento eliminado')
            fetchDocuments()
        } catch (err) {
            console.error('Error deleting document:', err)
            alert('Error al eliminar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const getDownloadUrl = async (path) => {
        try {
            const { data, error } = await supabase.storage
                .from('employee-docs')
                .createSignedUrl(path, 60) // 1 minute expiry

            if (error) throw error
            window.open(data.signedUrl, '_blank')
        } catch (err) {
            console.error('Error generating download URL:', err)
            alert('Error al descargar: ' + err.message)
        }
    }

    return (
        <div style={{ marginTop: '1.5rem' }}>
            <h4 style={{ color: '#374151', marginBottom: '1rem' }}>📄 Gestión de Nóminas y Documentos</h4>

            <div style={{
                backgroundColor: '#f9fafb',
                padding: '1.25rem',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                marginBottom: '1.5rem'
            }}>
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.875rem', color: '#4b5563' }}>
                        1. Escribe una descripción:
                    </label>
                    <input
                        type="text"
                        placeholder="Ej: Nómina Febrero 2024"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            border: '1px solid #d1d5db',
                            fontSize: '0.875rem'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '1.25rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', fontSize: '0.875rem', color: '#4b5563' }}>
                        2. Selecciona el archivo (PDF):
                    </label>
                    <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileChange}
                        disabled={uploading}
                        style={{
                            fontSize: '0.875rem',
                            width: '100%',
                            padding: '0.5rem',
                            backgroundColor: '#fff',
                            borderRadius: '8px',
                            border: '1px solid #d1d5db'
                        }}
                    />
                </div>

                <button
                    onClick={handleUpload}
                    disabled={uploading || !selectedFile}
                    className="btn btn-primary"
                    style={{
                        width: '100%',
                        padding: '0.75rem',
                        fontWeight: 'bold',
                        backgroundColor: (uploading || !selectedFile) ? '#9ca3af' : '#4f46e5',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    {uploading ? '⏳ Subiendo...' : '📤 Subir Documento'}
                </button>
            </div>

            <div className="document-list">
                {loading ? (
                    <p>Cargando documentos...</p>
                ) : documents.length === 0 ? (
                    <p style={{ fontSize: '0.875rem', color: '#6b7280', fontStyle: 'italic' }}>No hay documentos subidos para este empleado.</p>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0 }}>
                        {documents.map(doc => (
                            <li key={doc.id} style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.75rem',
                                borderBottom: '1px solid #e5e7eb',
                                fontSize: '0.875rem'
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: '600' }}>{doc.description || 'Sin descripción'}</span>
                                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{doc.document_name}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => getDownloadUrl(doc.file_path)}
                                        className="btn"
                                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #10b981' }}
                                    >
                                        ⬇️ Ver
                                    </button>
                                    <button
                                        onClick={() => handleDelete(doc)}
                                        className="btn"
                                        style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #ef4444' }}
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}
