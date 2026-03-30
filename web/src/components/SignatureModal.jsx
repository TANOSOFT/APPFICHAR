import React, { useRef, useState } from 'react'
import SignatureCanvas from 'react-signature-canvas'
import { PDFDocument, rgb } from 'pdf-lib'
import { supabase } from '../lib/supabase'

export function SignatureModal({ isOpen, onClose, document, userId, onSigned }) {
    const sigCanvas = useRef(null)
    const [isProcessing, setIsProcessing] = useState(false)

    if (!isOpen) return null

    const handleClear = () => {
        sigCanvas.current.clear()
    }

    const handleSave = async () => {
        if (sigCanvas.current.isEmpty()) {
            alert('Por favor, realiza la firma primero.')
            return
        }

        try {
            setIsProcessing(true)

            // 1. Get the signature image as a base64 string
            const signatureDataUrl = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png')
            const signatureImageBytes = await fetch(signatureDataUrl).then(res => res.arrayBuffer())

            // 2. Fetch the original PDF
            const { data: fileData, error: downloadError } = await supabase.storage
                .from('employee-docs')
                .download(document.file_path)

            if (downloadError) throw downloadError
            const pdfBytes = await fileData.arrayBuffer()

            // 3. Load PDF and embed signature
            const pdfDoc = await PDFDocument.load(pdfBytes)
            const signatureImage = await pdfDoc.embedPng(signatureImageBytes)
            
            const pages = pdfDoc.getPages()
            const lastPage = pages[pages.length - 1]
            const { width, height } = lastPage.getSize()

            // Draw signature image based on defined placement
            const sigWidth = 150
            const sigHeight = (signatureImage.height / signatureImage.width) * sigWidth

            let xPos = width - sigWidth - 50 // default right
            if (document.signature_placement === 'left') {
                xPos = 50
            } else if (document.signature_placement === 'center') {
                xPos = (width - sigWidth) / 2
            }

            lastPage.drawImage(signatureImage, {
                x: xPos,
                y: 50,
                width: sigWidth,
                height: sigHeight,
            })

            // Add text metadata (who and when)
            lastPage.drawText(`Firmado por: ${userId}\nFecha: ${new Date().toLocaleString()}`, {
                x: xPos,
                y: 35,
                size: 8,
                color: rgb(0.1, 0.1, 0.1),
            })

            const modifiedPdfBytes = await pdfDoc.save()

            // 4. Upload modified PDF back to storage
            // We overwrite the original or create a new one? Let's create a new path for "signed" version
            const signedFilePath = document.file_path.replace('.pdf', '_signed.pdf')
            
            const { error: uploadError } = await supabase.storage
                .from('employee-docs')
                .upload(signedFilePath, modifiedPdfBytes, {
                    contentType: 'application/pdf',
                    upsert: true
                })

            if (uploadError) throw uploadError

            // 5. Update database record
            const { error: dbError } = await supabase
                .from('employee_documents')
                .update({
                    file_path: signedFilePath,
                    is_signed: true,
                    signed_at: new Date().toISOString()
                })
                .eq('id', document.id)

            if (dbError) throw dbError

            alert('✅ Documento firmado correctamente.')
            onSigned()
            onClose()
        } catch (err) {
            console.error('Error signing PDF:', err)
            alert('Error al firmar el documento: ' + err.message)
        } finally {
            setIsProcessing(false)
        }
    }

    return (
        <div className="modal-overlay" style={styles.overlay}>
            <div className="modal-content" style={styles.modal}>
                <h3 style={{ marginTop: 0 }}>Firmar Documento</h3>
                <p style={{ fontSize: '0.9rem', color: '#666' }}>
                    Dibuja tu firma en el recuadro inferior. Se incrustará en el documento PDF original.
                </p>

                <div style={styles.canvasContainer}>
                    <SignatureCanvas
                        ref={sigCanvas}
                        penColor="black"
                        canvasProps={{
                            width: 350,
                            height: 200,
                            className: 'sigCanvas',
                            style: { border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#fff' }
                        }}
                    />
                </div>

                <div style={styles.buttonGroup}>
                    <button onClick={handleClear} style={styles.secondaryBtn} disabled={isProcessing}>
                        Borrar
                    </button>
                    <div style={{ flex: 1 }}></div>
                    <button onClick={onClose} style={styles.cancelBtn} disabled={isProcessing}>
                        Cancelar
                    </button>
                    <button onClick={handleSave} style={styles.primaryBtn} disabled={isProcessing}>
                        {isProcessing ? 'Procesando...' : 'Firmar y Guardar'}
                    </button>
                </div>
            </div>
        </div>
    )
}

const styles = {
    overlay: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.6)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000,
        padding: '1rem'
    },
    modal: {
        backgroundColor: '#fff',
        padding: '2rem',
        borderRadius: '16px',
        width: '100%',
        maxWidth: '450px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
        textAlign: 'center'
    },
    canvasContainer: {
        margin: '1.5rem 0',
        display: 'flex',
        justifyContent: 'center'
    },
    buttonGroup: {
        display: 'flex',
        gap: '0.5rem',
        marginTop: '1rem'
    },
    primaryBtn: {
        backgroundColor: '#4f46e5',
        color: 'white',
        border: 'none',
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        cursor: 'pointer',
        fontWeight: 'bold'
    },
    secondaryBtn: {
        backgroundColor: '#f3f4f6',
        color: '#4b5563',
        border: '1px solid #d1d5db',
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        cursor: 'pointer'
    },
    cancelBtn: {
        backgroundColor: '#fff',
        color: '#ef4444',
        border: '1px solid #ef4444',
        padding: '0.5rem 1rem',
        borderRadius: '8px',
        cursor: 'pointer'
    }
}
