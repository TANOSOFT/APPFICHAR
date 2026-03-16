import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'

export function DocumentManager({ employee, adminProfile }) {
    const [documents, setDocuments] = useState([])
    const [selectedFile, setSelectedFile] = useState(null)
    const [description, setDescription] = useState('')
    const [uploading, setUploading] = useState(false)
    const [loading, setLoading] = useState(true)
    const uploadBtnRef = useRef(null)

    useEffect(() => {
        console.log('[DocumentManager] Component Mounted for employee:', employee?.full_name);
        if (employee) {
            fetchDocuments()
        }
        return () => {
            console.log('[DocumentManager] Component UNMOUNTED for employee:', employee?.full_name);
        }
    }, [employee])

    // Asegurar que el botón sea visible cuando se selecciona un archivo en móvil
    useEffect(() => {
        if (selectedFile && uploadBtnRef.current) {
            uploadBtnRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [selectedFile])

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
        console.log('[DocumentManager] File input change detected:', file ? { name: file.name, type: file.type, size: file.size } : 'No file');
        
        if (file) {
            const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
            
            if (!isPdf) {
                console.warn('[DocumentManager] Rejected non-PDF file:', file.name, file.type);
                alert('Por favor, selecciona solo archivos PDF.')
                event.target.value = ''
                setSelectedFile(null)
                return
            }
            
            console.log('[DocumentManager] PDF selected successfully:', file.name);
            setSelectedFile(file)
        } else {
            setSelectedFile(null)
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h4 style={{ color: '#374151', margin: 0 }}>📄 Gestión de Nóminas y Documentos</h4>
                <span style={{ 
                    fontSize: '0.75rem', 
                    color: 'white', 
                    backgroundColor: '#10b981', 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '4px',
                    fontWeight: 'bold' 
                }}>
                    BUILD: v1.7 (ESTABLE)
                </span>
            </div>

            <div style={{
                backgroundColor: '#ffffff',
                padding: '1.25rem',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
                marginBottom: '1.5rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '1rem',
                minHeight: '280px' // Mantener altura estable
            }}>
                <div style={{ width: '100%' }}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.875rem', color: '#4b5563' }}>
                        1. Descripción del documento:
                    </label>
                    <input
                        type="text"
                        placeholder="Ej: Nómina Marzo 2026"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            borderRadius: '8px',
                            border: '1px solid #d1d5db',
                            fontSize: '16px',
                            boxSizing: 'border-box',
                            outlineColor: '#4f46e5',
                            backgroundColor: 'white'
                        }}
                    />
                </div>

                <div style={{ width: '100%' }}>
                    <label style={{ display: 'block', marginBottom: '0.4rem', fontWeight: 'bold', fontSize: '0.875rem', color: '#4b5563' }}>
                        2. Archivo PDF:
                    </label>
                    <input
                        type="file"
                        id="document-upload-input"
                        onChange={handleFileChange}
                        disabled={uploading}
                        style={{
                            fontSize: '16px',
                            width: '100%',
                            padding: '0.5rem',
                            backgroundColor: '#f9fafb',
                            borderRadius: '8px',
                            border: '1px solid #d1d5db',
                            boxSizing: 'border-box'
                        }}
                    />
                    <div style={{ fontSize: '0.7rem', color: '#6b7280', marginTop: '0.2rem' }}>
                        Estado: {selectedFile ? `✅ Seleccionado (${(selectedFile.size / 1024).toFixed(1)} KB)` : '❌ No hay fichero'}
                    </div>
                    {selectedFile && (
                        <div style={{ 
                            fontSize: '0.85rem', 
                            color: '#059669', 
                            marginTop: '0.5rem', 
                            fontWeight: '600',
                            padding: '0.6rem',
                            backgroundColor: '#ecfdf5',
                            borderRadius: '8px',
                            border: '1px solid #10b981'
                        }}>
                           📎 {selectedFile.name}
                        </div>
                    )}
                </div>

                <button
                    ref={uploadBtnRef}
                    type="button"
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleUpload();
                    }}
                    disabled={uploading || !selectedFile}
                    id="submit-document-btn"
                    className="btn btn-primary"
                    style={{
                        width: '100%',
                        padding: '1.1rem',
                        fontWeight: 'bold',
                        backgroundColor: (uploading || !selectedFile) ? '#9ca3af' : '#4f46e5',
                        color: 'white',
                        border: 'none',
                        borderRadius: '10px',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        gap: '0.6rem',
                        cursor: (uploading || !selectedFile) ? 'default' : 'pointer',
                        transition: 'all 0.2s',
                        fontSize: '1rem',
                        marginTop: '0.5rem',
                        boxShadow: (uploading || !selectedFile) ? 'none' : '0 4px 12px rgba(79, 70, 229, 0.3)'
                    }}
                >
                    {uploading ? '⏳ Subiendo...' : '📤 SUBIR DOCUMENTO'}
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
                                fontSize: '0.875rem',
                                flexWrap: 'wrap',
                                gap: '0.75rem'
                            }}>
                                <div style={{ display: 'flex', flexDirection: 'column', minWidth: '150px' }}>
                                    <span style={{ fontWeight: '600' }}>
                                        {doc.description || 'Sin descripción'}
                                        {doc.is_signed && <span style={{ color: '#10b981', marginLeft: '0.5rem', fontSize: '0.7rem' }}>✅ FIRMADO</span>}
                                    </span>
                                    <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{doc.document_name}</span>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                    <button
                                        onClick={() => getDownloadUrl(doc.file_path)}
                                        className="btn"
                                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', backgroundColor: '#ecfdf5', color: '#059669', border: '1px solid #10b981', borderRadius: '6px' }}
                                    >
                                        ⬇️ Ver {doc.is_signed ? 'Firmado' : ''}
                                    </button>
                                    <button
                                        onClick={() => handleDelete(doc)}
                                        className="btn"
                                        style={{ padding: '0.35rem 0.6rem', fontSize: '0.75rem', backgroundColor: '#fef2f2', color: '#dc2626', border: '1px solid #ef4444', borderRadius: '6px' }}
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
