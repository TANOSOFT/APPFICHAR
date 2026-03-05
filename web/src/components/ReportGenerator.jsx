import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, eachDayOfInterval, isSameDay, isWeekend, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import * as XLSX from 'xlsx'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { Capacitor } from '@capacitor/core'

/**
 * Helper to handle file saving/sharing on both Web and Mobile (Capacitor)
 */
const handleFileDownload = async (blob, fileName, mimeType) => {
    if (Capacitor.isNativePlatform()) {
        try {
            // Convert blob to base64
            const reader = new FileReader();
            const base64Promise = new Promise((resolve) => {
                reader.onloadend = () => {
                    const base64data = reader.result.split(',')[1];
                    resolve(base64data);
                };
            });
            reader.readAsDataURL(blob);
            const base64Data = await base64Promise;

            // Write to local filesystem
            const savedFile = await Filesystem.writeFile({
                path: fileName,
                data: base64Data,
                directory: Directory.Cache
            });

            // Share the file
            await Share.share({
                title: 'Descargar Reporte',
                text: `Aquí tienes tu reporte: ${fileName}`,
                url: savedFile.uri,
                dialogTitle: 'Abrir reporte con...'
            });
        } catch (err) {
            console.error('Error sharing file on mobile:', err);
            alert('Error al compartir el archivo: ' + err.message);
        }
    } else {
        // Standard Web Download
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
};

// Helper function to convert hex color to RGB array
// ... (rest of the helper functions remain the same)
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [66, 139, 202] // default blue
}

const loadImageAsBase64 = (url) => {
    return new Promise((resolve, reject) => {
        const img = new Image()
        img.crossOrigin = 'Anonymous'
        img.onload = () => {
            const canvas = document.createElement('canvas')
            canvas.width = img.width
            canvas.height = img.height
            const ctx = canvas.getContext('2d')
            ctx.drawImage(img, 0, 0)
            resolve(canvas.toDataURL('image/png'))
        }
        img.onerror = reject
        img.src = url
    })
}

export function ReportGenerator({ userId, profile }) {
    const [loading, setLoading] = useState(false)
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7)) // YYYY-MM

    const generatePDF = async () => {
        try {
            setLoading(true)
            const [year, month] = selectedMonth.split('-')
            const monthStart = startOfMonth(new Date(year, month - 1))
            const monthEnd = endOfMonth(new Date(year, month - 1))

            const { data: entries, error } = await supabase
                .from('time_entries')
                .select(`*, break_entries (id, break_type, start_at, end_at)`)
                .eq('user_id', userId)
                .gte('work_date', format(monthStart, 'yyyy-MM-dd'))
                .lte('work_date', format(monthEnd, 'yyyy-MM-dd'))
                .order('work_date', { ascending: true })
                .order('start_at', { ascending: true })

            if (error) throw error

            const { data: tenant } = await supabase.from('tenants').select('*').eq('id', profile.tenant_id).single()
            const { data: branding } = await supabase.from('tenant_branding').select('*').eq('tenant_id', profile.tenant_id).maybeSingle()

            const doc = new jsPDF()
            let currentY = 15
            const pageWidth = doc.internal.pageSize.width

            if (branding?.logo_path) {
                try {
                    const logoBase64 = await loadImageAsBase64(branding.logo_path)
                    doc.addImage(logoBase64, 'PNG', pageWidth - 55, currentY, 40, 20)
                } catch (err) { console.log('Logo error:', err) }
            }

            doc.setFontSize(12).setFont('helvetica', 'bold')
            doc.text((tenant?.legal_name || tenant?.name || 'Empresa').toUpperCase(), 20, currentY + 4)
            if (tenant?.cif) doc.setFontSize(9).setFont('helvetica', 'normal').text(`CIF: ${tenant.cif}`, 20, currentY + 9)

            currentY += 25
            const lineColor = branding?.primary_color ? hexToRgb(branding.primary_color) : [59, 130, 246]
            doc.setDrawColor(lineColor[0], lineColor[1], lineColor[2]).setLineWidth(0.5).line(15, currentY, pageWidth - 15, currentY)

            currentY += 8
            doc.setFontSize(14).setFont('helvetica', 'bold').text('REGISTRO DE JORNADA LABORAL', pageWidth / 2, currentY, { align: 'center' })
            doc.setFontSize(9).setFont('helvetica', 'normal').setTextColor(100).text('(Art. 34.9 del Estatuto de los Trabajadores)', pageWidth / 2, currentY + 6, { align: 'center' })

            currentY += 15
            doc.setFillColor(245).rect(15, currentY, pageWidth - 30, 14, 'F')
            doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(0).text('Empleado:', 20, currentY + 5)
            doc.setFont('helvetica', 'normal').text(profile.full_name || 'N/A', 45, currentY + 5)
            doc.setFont('helvetica', 'bold').text('Periodo:', 20, currentY + 11)
            doc.setFont('helvetica', 'normal').text(format(monthStart, 'MMMM yyyy', { locale: es }), 45, currentY + 11)

            const tableData = entries.map(entry => {
                const totalM = entry.end_at ? Math.floor((new Date(entry.end_at) - new Date(entry.start_at)) / 60000) : 0
                const breakM = entry.break_entries?.reduce((acc, b) => b.end_at ? acc + Math.floor((new Date(b.end_at) - new Date(b.start_at)) / 60000) : acc, 0) || 0
                const netM = totalM - breakM
                return [
                    format(new Date(entry.work_date), 'dd/MM/yyyy'),
                    format(new Date(entry.start_at), 'HH:mm'),
                    entry.end_at ? format(new Date(entry.end_at), 'HH:mm') : '-',
                    breakM > 0 ? `${breakM}m` : '-',
                    `${Math.floor(netM / 60)}h ${netM % 60}m`
                ]
            })

            doc.autoTable({
                head: [['Fecha', 'Entrada', 'Salida', 'Pausas', 'Tiempo Neto']],
                body: tableData,
                startY: currentY + 18,
                halign: 'center',
                tableWidth: 'auto',
                theme: 'striped',
                headStyles: {
                    fillColor: lineColor,
                    halign: 'center',
                    fontStyle: 'bold'
                },
                styles: {
                    fontSize: 10,
                    halign: 'center'
                },
                columnStyles: {
                    0: { cellWidth: 32 },
                    1: { cellWidth: 28 },
                    2: { cellWidth: 28 },
                    3: { cellWidth: 28 },
                    4: { cellWidth: 38, fontStyle: 'bold' }
                }
            })

            // Calculate totals
            let totalNetMinutes = 0
            entries.forEach(entry => {
                if (entry.end_at) {
                    let entryMinutes = Math.floor((new Date(entry.end_at) - new Date(entry.start_at)) / (1000 * 60))
                    if (entry.break_entries && entry.break_entries.length > 0) {
                        const breakMinutes = entry.break_entries.reduce((acc, brk) => {
                            if (brk.end_at) return acc + Math.floor((new Date(brk.end_at) - new Date(brk.start_at)) / (1000 * 60))
                            return acc
                        }, 0)
                        entryMinutes -= breakMinutes
                    }
                    totalNetMinutes += entryMinutes
                }
            })

            const totalHours = Math.floor(totalNetMinutes / 60)
            const totalMins = totalNetMinutes % 60

            const finalY = doc.lastAutoTable.finalY + 10
            doc.setFont('helvetica', 'bold').setFontSize(12).text(`TOTAL HORAS TRABAJADAS: ${totalHours}h ${totalMins}m`, 20, finalY)

            // Footer - signature area
            const pageHeight = doc.internal.pageSize.height
            doc.setFontSize(10).setFont('helvetica', 'normal')
            doc.text('Firma del Empleado:', 20, pageHeight - 30)
            doc.line(60, pageHeight - 30, 110, pageHeight - 30)
            doc.text('Firma del Responsable:', 120, pageHeight - 30)
            doc.line(170, pageHeight - 30, 190, pageHeight - 30)
            doc.setFontSize(8).text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 105, pageHeight - 10, { align: 'center' })

            // Save/Share PDF
            const pdfBlob = doc.output('blob')
            const fileName = `Registro_${profile.full_name || 'empleado'}_${selectedMonth}.pdf`
            await handleFileDownload(pdfBlob, fileName, 'application/pdf')

        } catch (err) {
            console.error('PDF Error:', err); alert('Error: ' + err.message)
        } finally { setLoading(false) }
    }

    const generateExcel = async () => {
        try {
            setLoading(true)
            const [year, month] = selectedMonth.split('-')
            const monthStart = startOfMonth(new Date(year, month - 1))
            const monthEnd = endOfMonth(new Date(year, month - 1))

            const { data: entries, error } = await supabase
                .from('time_entries')
                .select(`*, break_entries (*)`)
                .eq('user_id', userId)
                .gte('work_date', format(monthStart, 'yyyy-MM-dd'))
                .lte('work_date', format(monthEnd, 'yyyy-MM-dd'))
                .order('work_date', { ascending: true })

            if (error) throw error

            const excelData = entries.map(e => {
                const start = new Date(e.start_at)
                const end = e.end_at ? new Date(e.end_at) : null
                const breakM = e.break_entries?.reduce((acc, b) => b.end_at ? acc + Math.floor((new Date(b.end_at) - new Date(b.start_at)) / 60000) : acc, 0) || 0
                const netM = end ? Math.floor((end - start) / 60000) - breakM : 0
                return {
                    'Fecha': format(new Date(e.work_date), 'dd/MM/yyyy'),
                    'Entrada': format(start, 'HH:mm'),
                    'Salida': end ? format(end, 'HH:mm') : '',
                    'Pausas (min)': breakM,
                    'Horas Netas': (netM / 60).toFixed(2)
                }
            })

            const ws = XLSX.utils.json_to_sheet(excelData)
            const wb = XLSX.utils.book_new()
            XLSX.utils.book_append_sheet(wb, ws, 'Fichajes')

            const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
            const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            const fileName = `Fichajes_${profile.full_name}_${selectedMonth}.xlsx`

            await handleFileDownload(blob, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')

        } catch (err) { console.error('Excel Error:', err); alert('Error: ' + err.message) }
        finally { setLoading(false) }
    }

    const generateYearlyCalendarPDF = async () => {
        try {
            setLoading(true)
            const currentYear = new Date(selectedMonth).getFullYear()
            const yearStartStr = `${currentYear}-01-01`
            const yearEndStr = `${currentYear}-12-31`

            const { data: absences } = await supabase.from('absence_requests').select('*').eq('user_id', userId).eq('status', 'approved').gte('start_date', yearStartStr).lte('start_date', yearEndStr)
            const { data: holidays } = await supabase.from('company_holidays').select('*').eq('tenant_id', profile.tenant_id).gte('date', yearStartStr).lte('date', yearEndStr)
            const { data: tenant } = await supabase.from('tenants').select('*').eq('id', profile.tenant_id).single()
            const { data: branding } = await supabase.from('tenant_branding').select('*').eq('tenant_id', profile.tenant_id).maybeSingle()

            const doc = new jsPDF()
            const pageWidth = doc.internal.pageSize.width
            const pageHeight = doc.internal.pageSize.height
            const margin = 15
            const brandingColor = branding?.primary_color ? hexToRgb(branding.primary_color) : [59, 130, 246]

            // Header
            doc.setFontSize(16).setFont('helvetica', 'bold').text(`CALENDARIO LABORAL ${currentYear}`, pageWidth / 2, 20, { align: 'center' })
            doc.setFontSize(10).setFont('helvetica', 'bold').text((tenant?.legal_name || tenant?.name || 'Empresa').toUpperCase(), 20, 30)
            doc.setFont('helvetica', 'normal').text(`Empleado: ${profile.full_name}`, 20, 35)

            if (branding?.logo_path) {
                try {
                    const logoBase64 = await loadImageAsBase64(branding.logo_path)
                    doc.addImage(logoBase64, 'PNG', pageWidth - 55, 15, 40, 20)
                } catch (err) { console.log('Logo error:', err) }
            }

            // Calendar Layout Settings
            const colWidth = (pageWidth - (margin * 2)) / 3
            const monthHeight = 48
            const daySize = colWidth / 8
            const startY = 40

            const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
            const dayLabels = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

            for (let m = 0; m < 12; m++) {
                const col = m % 3
                const row = Math.floor(m / 3)
                const x = margin + (col * colWidth)
                const y = startY + (row * (monthHeight + 5))

                // Month Title
                doc.setFontSize(10).setFont('helvetica', 'bold').setTextColor(brandingColor[0], brandingColor[1], brandingColor[2])
                doc.text(months[m].toUpperCase(), x + (colWidth / 2), y, { align: 'center' })
                doc.setTextColor(0)

                // Day Labels
                doc.setFontSize(7).setFont('helvetica', 'bold')
                dayLabels.forEach((label, i) => {
                    doc.text(label, x + (i * daySize) + (daySize / 2), y + 5, { align: 'center' })
                })

                // Days
                const monthDate = new Date(currentYear, m, 1)
                const daysInMonth = new Date(currentYear, m + 1, 0).getDate()
                let firstDay = monthDate.getDay() // 0=Sun, 1=Mon...
                if (firstDay === 0) firstDay = 7 // Adjust to Mon=1, Sun=7

                doc.setFont('helvetica', 'normal').setFontSize(7)
                for (let d = 1; d <= daysInMonth; d++) {
                    const dayOfWeek = (firstDay + d - 2) % 7
                    const weekRow = Math.floor((firstDay + d - 2) / 7)
                    const dayX = x + (dayOfWeek * daySize)
                    const dayY = y + 8 + (weekRow * 6)

                    const currentDate = new Date(currentYear, m, d)
                    const dateStr = format(currentDate, 'yyyy-MM-dd')

                    // Styling based on day type
                    const isHoliday = holidays?.some(h => isSameDay(parseISO(h.date), currentDate))
                    const isAbsence = absences?.some(a => {
                        const start = parseISO(a.start_date)
                        const end = parseISO(a.end_date)
                        return currentDate >= start && currentDate <= end
                    })
                    const isWknd = isWeekend(currentDate)

                    if (isHoliday) {
                        doc.setFillColor(251, 191, 36).rect(dayX, dayY - 4, daySize, 6, 'F')
                    } else if (isAbsence) {
                        doc.setFillColor(96, 165, 250).rect(dayX, dayY - 4, daySize, 6, 'F')
                    } else if (isWknd) {
                        doc.setFillColor(243, 244, 246).rect(dayX, dayY - 4, daySize, 6, 'F')
                    }

                    doc.text(d.toString(), dayX + (daySize / 2), dayY, { align: 'center' })
                }
            }

            // Legend
            const legendY = pageHeight - 35
            doc.setFontSize(9).setFont('helvetica', 'bold').text('LEYENDA:', margin, legendY)

            doc.setFillColor(251, 191, 36).rect(margin + 25, legendY - 4, 8, 5, 'F')
            doc.setFontSize(8).setFont('helvetica', 'normal').text('Festivo', margin + 35, legendY)

            doc.setFillColor(96, 165, 250).rect(margin + 55, legendY - 4, 8, 5, 'F')
            doc.text('Ausencia/Baja', margin + 65, legendY)

            doc.setFillColor(243, 244, 246).rect(margin + 95, legendY - 4, 8, 5, 'F')
            doc.text('Fin de Semana', margin + 105, legendY)

            // Absence Summary Table
            if (absences && absences.length > 0) {
                doc.addPage()
                doc.setFontSize(14).setFont('helvetica', 'bold').text('DETALLE DE AUSENCIAS APROBADAS', pageWidth / 2, 20, { align: 'center' })

                const tableData = absences.map(a => [
                    a.type === 'vacation' ? 'Vacaciones' : a.type === 'sick_leave' ? 'Baja Médica' : 'Otras',
                    format(parseISO(a.start_date), 'dd/MM/yyyy'),
                    format(parseISO(a.end_date), 'dd/MM/yyyy'),
                    a.reason || '-'
                ])

                doc.autoTable({
                    head: [['Tipo', 'Desde', 'Hasta', 'Motivo']],
                    body: tableData,
                    startY: 30,
                    theme: 'striped',
                    headStyles: { fillColor: brandingColor }
                })
            }

            const pdfOutput = doc.output('blob')
            const fileName = `Calendario_${currentYear}_${profile.full_name.replace(/\s+/g, '_')}.pdf`
            await handleFileDownload(pdfOutput, fileName, 'application/pdf')

        } catch (err) { console.error('Calendar Error:', err); alert('Error: ' + err.message) }
        finally { setLoading(false) }
    }

    return (
        <div className="report-generator">
            <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>Mes del Reporte:</label>
                <input
                    type="month"
                    className="input"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    max={new Date().toISOString().slice(0, 7)}
                />
            </div>

            <button onClick={generatePDF} disabled={loading} className="btn btn-primary" style={{ width: '100%', marginBottom: '0.5rem' }}>
                {loading ? 'Generando...' : '📄 Descargar Reporte PDF'}
            </button>

            <button onClick={generateExcel} disabled={loading} className="btn btn-secondary" style={{ width: '100%', marginBottom: '0.5rem' }}>
                {loading ? 'Generando...' : '📊 Descargar Reporte Excel'}
            </button>

            <button onClick={generateYearlyCalendarPDF} disabled={loading} className="btn btn-secondary" style={{ width: '100%', backgroundColor: '#4b5563', color: 'white' }}>
                {loading ? 'Generando...' : '📅 Descargar Calendario Anual'}
            </button>
        </div>
    )
}
