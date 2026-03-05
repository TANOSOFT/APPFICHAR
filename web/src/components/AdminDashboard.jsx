import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { format, startOfMonth, endOfMonth } from 'date-fns'
import { es } from 'date-fns/locale'
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import * as XLSX from 'xlsx'
import { DocumentManager } from './DocumentManager'

// Helper function to convert hex color to RGB array
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
    return result ? [
        parseInt(result[1], 16),
        parseInt(result[2], 16),
        parseInt(result[3], 16)
    ] : [66, 139, 202] // default blue
}

// Helper function to load image as base64
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

// Helper function to mask sensitive strings
const maskString = (str, visibleCount = 4) => {
    if (!str) return 'N/A'
    if (str.length <= visibleCount) return str
    return '*'.repeat(str.length - visibleCount) + str.slice(-visibleCount)
}

export function AdminDashboard({ profile }) {
    const [employees, setEmployees] = useState([])
    const [selectedEmployee, setSelectedEmployee] = useState(null)
    const [timeEntries, setTimeEntries] = useState([])
    const [loading, setLoading] = useState(false)
    const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7))
    const [editMode, setEditMode] = useState(false)
    const [editFormData, setEditFormData] = useState(null)
    const [showInactive, setShowInactive] = useState(false)

    useEffect(() => {
        if (profile?.tenant_id) {
            fetchEmployees()
        }
    }, [profile, showInactive])

    useEffect(() => {
        if (selectedEmployee) {
            fetchEmployeeEntries()
        }
    }, [selectedEmployee, selectedMonth])

    const fetchEmployees = async () => {
        try {
            setLoading(true)
            let query = supabase
                .from('profiles')
                .select(`
                    id, 
                    full_name, 
                    employee_code, 
                    role, 
                    active,
                    email,
                    dni,
                    social_security_number,
                    contract_type,
                    contracted_hours_daily,
                    contracted_hours_weekly,
                    contract_start_date,
                    contract_end_date
                `)
                .eq('tenant_id', profile.tenant_id)
                .neq('role', 'super_admin')

            if (!showInactive) {
                query = query.eq('active', true)
            }

            const { data, error } = await query.order('full_name')

            if (error) throw error
            setEmployees(data || [])
        } catch (err) {
            console.error('Error fetching employees:', err)
            alert('Error al cargar empleados: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const fetchEmployeeEntries = async () => {
        if (!selectedEmployee) return

        try {
            setLoading(true)
            const [year, month] = selectedMonth.split('-')
            const monthStart = startOfMonth(new Date(year, month - 1))
            const monthEnd = endOfMonth(new Date(year, month - 1))

            const { data, error } = await supabase
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
                .eq('user_id', selectedEmployee.id)
                .gte('work_date', format(monthStart, 'yyyy-MM-dd'))
                .lte('work_date', format(monthEnd, 'yyyy-MM-dd'))
                .order('work_date', { ascending: false })
                .order('start_at', { ascending: false })

            if (error) throw error
            setTimeEntries(data || [])
        } catch (err) {
            console.error('Error fetching entries:', err)
            alert('Error al cargar fichajes: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const formatDuration = (start, end, breaks = []) => {
        if (!end) return 'En curso...'
        const startDate = new Date(start)
        const endDate = new Date(end)
        let totalWorkTime = endDate - startDate

        // Subtract break durations
        if (breaks && breaks.length > 0) {
            const totalBreakTime = breaks.reduce((acc, breakEntry) => {
                if (breakEntry.end_at) {
                    return acc + (new Date(breakEntry.end_at) - new Date(breakEntry.start_at))
                }
                return acc
            }, 0)
            totalWorkTime -= totalBreakTime
        }

        const hours = Math.floor(totalWorkTime / (1000 * 60 * 60))
        const minutes = Math.floor((totalWorkTime % (1000 * 60 * 60)) / (1000 * 60))
        return `${hours}h ${minutes}m`
    }

    const calculateMonthlyTotal = () => {
        let totalMinutes = 0
        timeEntries.forEach(entry => {
            if (entry.end_at) {
                let entryMinutes = Math.floor((new Date(entry.end_at) - new Date(entry.start_at)) / (1000 * 60))

                // Subtract breaks
                if (entry.break_entries && entry.break_entries.length > 0) {
                    const breakMinutes = entry.break_entries.reduce((acc, brk) => {
                        if (brk.end_at) {
                            return acc + Math.floor((new Date(brk.end_at) - new Date(brk.start_at)) / (1000 * 60))
                        }
                        return acc
                    }, 0)
                    entryMinutes -= breakMinutes
                }

                totalMinutes += entryMinutes
            }
        })

        const hours = Math.floor(totalMinutes / 60)
        const mins = totalMinutes % 60
        return `${hours}h ${mins}m`
    }

    const toggleEmployeeStatus = async () => {
        if (!selectedEmployee) {
            alert('Por favor selecciona un empleado')
            return
        }

        const employeeId = selectedEmployee.id
        const employee = employees.find(e => e.id === employeeId)
        if (!employee) return

        const newStatus = !employee.active
        const actionText = newStatus ? 'reactivar' : 'desactivar'

        const confirmAction = window.confirm(
            `¿Estás seguro de que quieres ${actionText} a ${employee?.full_name}?` +
            (newStatus ? '\n\nEl empleado podrá volver a fichar y acceder al sistema.' : '\n\nEl empleado ya no podrá acceder al sistema, pero se conservarán todos sus datos históricos.')
        )

        if (!confirmAction) return

        try {
            setLoading(true)

            // Update profile active status
            const { error: updateError } = await supabase
                .from('profiles')
                .update({ active: newStatus })
                .eq('id', employeeId)

            if (updateError) throw updateError

            alert(`✅ Empleado ${employee?.full_name} ${newStatus ? 'reactivado' : 'desactivado'} correctamente`)

            // Refetch and reset
            await fetchEmployees()
            setSelectedEmployee(null)
            setTimeEntries([])

        } catch (err) {
            console.error('Error updating employee status:', err)
            alert('Error al actualizar empleado: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const deleteEmployee = async () => {
        if (!selectedEmployee) return

        const confirm1 = window.confirm(`🚨 ¿Estás SEGURO de eliminar DEFINITIVAMENTE el perfil de ${selectedEmployee.full_name}?`)
        if (!confirm1) return

        const confirm2 = window.confirm(`⚠️ Esta acción no se puede deshacer. Se borrarán todos sus fichajes y datos asociados. ¿Continuar?`)
        if (!confirm2) return

        try {
            setLoading(true)
            const { error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', selectedEmployee.id)

            if (error) throw error

            alert('✅ Perfil eliminado correctamente.')
            await fetchEmployees()
            setSelectedEmployee(null)
            setTimeEntries([])
        } catch (err) {
            console.error('Error deleting employee:', err)
            alert('Error al eliminar perfil: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateLaborData = async (e) => {
        e.preventDefault()
        if (editFormData.role === 'super_admin') {
            alert('🚫 No está permitido editar perfiles de Superadministrador desde este panel.')
            setEditMode(false)
            return
        }
        try {
            setLoading(true)

            // Validate DNI if changed
            if (editFormData.dni && editFormData.dni !== selectedEmployee.dni) {
                const dniRegex = /^[0-9]{8}[TRWAGMYFPDXBNJZSQVHLCKE]$/i
                if (!dniRegex.test(editFormData.dni)) {
                    alert('El formato del DNI no es válido (8 números y 1 letra)')
                    return
                }
            }

            const { error } = await supabase
                .from('profiles')
                .update({
                    dni: editFormData.dni?.toUpperCase(),
                    social_security_number: editFormData.social_security_number,
                    email: editFormData.email,
                    contract_type: editFormData.contract_type,
                    contracted_hours_daily: parseFloat(editFormData.contracted_hours_daily),
                    contracted_hours_weekly: parseFloat(editFormData.contracted_hours_weekly),
                    contract_start_date: editFormData.contract_start_date,
                    contract_end_date: editFormData.contract_type === 'indefinido' ? null : editFormData.contract_end_date
                })
                .eq('id', editFormData.id)

            if (error) throw error

            alert('✅ Datos actualizados correctamente')
            setEditMode(false)
            await fetchEmployees()

            // Re-select the employee to refresh display
            const updatedEmp = employees.find(emp => emp.id === editFormData.id)
            setSelectedEmployee(updatedEmp)

        } catch (err) {
            console.error('Error updating employee data:', err)
            alert('Error al actualizar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const generateEmployeePDF = async () => {
        if (!selectedEmployee) {
            alert('Por favor selecciona un empleado')
            return
        }

        try {
            setLoading(true)

            // Fetch tenant and branding info
            const { data: tenant } = await supabase
                .from('tenants')
                .select('*')
                .eq('id', profile.tenant_id)
                .single()

            const { data: branding } = await supabase
                .from('tenant_branding')
                .select('*')
                .eq('tenant_id', profile.tenant_id)
                .maybeSingle()

            // Generate PDF
            const doc = new jsPDF()
            const [year, month] = selectedMonth.split('-')
            const monthStart = startOfMonth(new Date(year, month - 1))

            let currentY = 15
            const pageWidth = doc.internal.pageSize.width

            // Load and add logo if available (on the right side)
            let logoLoaded = false
            if (branding?.logo_path) {
                try {
                    const logoBase64 = await loadImageAsBase64(branding.logo_path)
                    const logoX = pageWidth - 55
                    doc.addImage(logoBase64, 'PNG', logoX, currentY, 40, 20)
                    logoLoaded = true
                } catch (err) {
                    console.log('Could not load logo:', err)
                }
            }

            // Company info section (always aligned to the left at position 20)
            const companyInfoX = 20
            const companyAlign = 'left'

            // Company name (reduced size)
            doc.setFontSize(12)
            doc.setFont('helvetica', 'bold')
            const companyName = tenant?.legal_name || tenant?.name || 'Empresa'
            doc.text(companyName.toUpperCase(), companyInfoX, currentY + 4, { align: companyAlign })

            // CIF
            if (tenant?.cif) {
                doc.setFontSize(9)
                doc.setFont('helvetica', 'normal')
                doc.text(`CIF: ${tenant.cif}`, companyInfoX, currentY + 9, { align: companyAlign })
            }

            // Address
            if (tenant?.address) {
                doc.setFontSize(8)
                const addressLine = `${tenant.address}${tenant.city ? ', ' + tenant.city : ''}${tenant.postal_code ? ' - ' + tenant.postal_code : ''}`
                doc.text(addressLine, companyInfoX, currentY + 13, { align: companyAlign })
            }

            currentY = logoLoaded ? currentY + 25 : currentY + 18

            // Separator line
            const lineColor = branding?.primary_color ? hexToRgb(branding.primary_color) : [59, 130, 246]
            doc.setDrawColor(lineColor[0], lineColor[1], lineColor[2])
            doc.setLineWidth(0.5)
            doc.line(20, currentY, pageWidth - 20, currentY)
            currentY += 8

            // Title
            doc.setFontSize(14)
            doc.setFont('helvetica', 'bold')
            doc.setTextColor(0, 0, 0)
            doc.text('REGISTRO DE JORNADA LABORAL', 105, currentY, { align: 'center' })
            currentY += 5

            doc.setFontSize(9)
            doc.setFont('helvetica', 'italic')
            doc.text('(Art. 34.9 del Estatuto de los Trabajadores)', 105, currentY, { align: 'center' })
            currentY += 10

            // Employee and period info box
            doc.setFillColor(245, 245, 245)
            doc.roundedRect(20, currentY, pageWidth - 40, 12, 2, 2, 'F')

            doc.setFont('helvetica', 'bold')
            doc.setFontSize(10)
            doc.text(`Empleado:`, 25, currentY + 5)
            doc.setFont('helvetica', 'normal')
            doc.text(`${selectedEmployee.full_name || 'N/A'}`, 50, currentY + 5)

            doc.setFont('helvetica', 'bold')
            doc.text(`Periodo:`, 25, currentY + 9)
            doc.setFont('helvetica', 'normal')
            doc.text(format(monthStart, 'MMMM yyyy', { locale: es }), 50, currentY + 9)

            currentY += 17

            // Prepare table data
            const tableData = timeEntries.map(entry => {
                const workDate = format(new Date(entry.work_date), 'dd/MM/yyyy')
                const startTime = format(new Date(entry.start_at), 'HH:mm')
                const endTime = entry.end_at ? format(new Date(entry.end_at), 'HH:mm') : '-'

                let breakMinutes = 0
                if (entry.break_entries && entry.break_entries.length > 0) {
                    breakMinutes = entry.break_entries.reduce((acc, brk) => {
                        if (brk.end_at) {
                            return acc + Math.floor((new Date(brk.end_at) - new Date(brk.start_at)) / (1000 * 60))
                        }
                        return acc
                    }, 0)
                }
                const breakDisplay = breakMinutes > 0 ? `${breakMinutes}m` : '-'

                let netMinutes = 0
                if (entry.end_at) {
                    netMinutes = Math.floor((new Date(entry.end_at) - new Date(entry.start_at)) / (1000 * 60))
                    netMinutes -= breakMinutes
                }
                const netHours = Math.floor(netMinutes / 60)
                const netMins = netMinutes % 60
                const netDisplay = entry.end_at ? `${netHours}h ${netMins}m` : '-'

                return [workDate, startTime, endTime, breakDisplay, netDisplay]
            })

            // Add table
            currentY += 5

            const headerColor = branding?.primary_color
                ? hexToRgb(branding.primary_color)
                : [66, 139, 202]

            doc.autoTable({
                head: [['Fecha', 'Entrada', 'Salida', 'Pausas', 'Tiempo Neto']],
                body: tableData,
                startY: currentY,
                halign: 'center',
                tableWidth: 'auto',
                theme: 'striped',
                headStyles: {
                    fillColor: headerColor,
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
            const totalNet = calculateMonthlyTotal()

            // Add totals
            const finalY = doc.lastAutoTable.finalY + 10
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(12)
            doc.text(`TOTAL HORAS TRABAJADAS: ${totalNet}`, 20, finalY)

            // Footer - signature area
            const pageHeight = doc.internal.pageSize.height
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')
            doc.text('Firma del Empleado:', 20, pageHeight - 30)
            doc.line(60, pageHeight - 30, 110, pageHeight - 30)

            doc.text('Firma del Responsable:', 120, pageHeight - 30)
            doc.line(170, pageHeight - 30, 190, pageHeight - 30)

            // Add generation date
            doc.setFontSize(8)
            doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 105, pageHeight - 10, { align: 'center' })

            // Save PDF
            const fileName = `Registro_${selectedEmployee.full_name || 'empleado'}_${format(monthStart, 'yyyy-MM')}.pdf`
            doc.save(fileName)

            alert('✅ PDF generado correctamente')

        } catch (err) {
            console.error('Error generating PDF:', err)
            alert('Error al generar PDF: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const generateEmployeeExcel = async () => {
        if (!selectedEmployee) {
            alert('Por favor selecciona un empleado')
            return
        }

        try {
            setLoading(true)

            const [year, month] = selectedMonth.split('-')
            const monthStart = startOfMonth(new Date(year, month - 1))

            // Prepare data for Excel
            const excelData = timeEntries.map(entry => {
                const workDate = format(new Date(entry.work_date), 'dd/MM/yyyy')
                const startTime = format(new Date(entry.start_at), 'HH:mm')
                const endTime = entry.end_at ? format(new Date(entry.end_at), 'HH:mm') : ''

                let breakMinutes = 0
                if (entry.break_entries && entry.break_entries.length > 0) {
                    breakMinutes = entry.break_entries.reduce((acc, brk) => {
                        if (brk.end_at) {
                            return acc + Math.floor((new Date(brk.end_at) - new Date(brk.start_at)) / (1000 * 60))
                        }
                        return acc
                    }, 0)
                }

                let netMinutes = 0
                if (entry.end_at) {
                    netMinutes = Math.floor((new Date(entry.end_at) - new Date(entry.start_at)) / (1000 * 60))
                    netMinutes -= breakMinutes
                }

                const netHours = (netMinutes / 60).toFixed(2)

                return {
                    'Fecha': workDate,
                    'Entrada': startTime,
                    'Salida': endTime,
                    'Pausas (min)': breakMinutes,
                    'Tiempo Neto (min)': netMinutes,
                    'Tiempo Neto (h)': netHours
                }
            })

            // Create workbook and worksheet
            const wb = XLSX.utils.book_new()
            const ws = XLSX.utils.json_to_sheet(excelData)

            // Set column widths
            ws['!cols'] = [
                { wch: 12 }, // Fecha
                { wch: 10 }, // Entrada
                { wch: 10 }, // Salida
                { wch: 14 }, // Pausas
                { wch: 18 }, // Tiempo Neto (min)
                { wch: 16 }  // Tiempo Neto (h)
            ]

            XLSX.utils.book_append_sheet(wb, ws, 'Fichajes')

            // Generate and download
            XLSX.writeFile(wb, `Fichajes_${selectedEmployee.full_name || 'empleado'}_${format(monthStart, 'yyyy-MM')}.xlsx`)

            alert('✅ Excel descargado correctamente')

        } catch (err) {
            console.error('Error generating Excel:', err)
            alert('Error al generar Excel: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const generateBulkLaborReport = async () => {
        try {
            setLoading(true)

            // Fetch all employees for this tenant (including inactive if showInactive is true)
            let query = supabase
                .from('profiles')
                .select(`
                    id, 
                    full_name, 
                    employee_code, 
                    role, 
                    active,
                    dni,
                    social_security_number,
                    contract_type,
                    contracted_hours_daily,
                    contracted_hours_weekly,
                    contract_start_date,
                    contract_end_date
                `)
                .eq('tenant_id', profile.tenant_id)

            const { data: allEmployees, error } = await query.order('full_name')
            if (error) throw error

            if (!allEmployees || allEmployees.length === 0) {
                alert('No hay empleados para exportar')
                return
            }

            const excelData = allEmployees.map(emp => ({
                'Código': emp.employee_code || 'N/A',
                'Nombre Completo': emp.full_name,
                'DNI/NIF': emp.dni || 'N/A',
                'Nº Seg. Social': emp.social_security_number || 'N/A',
                'Tipo Contrato': emp.contract_type || 'No definido',
                'Horas/Día': emp.contracted_hours_daily || 0,
                'Horas/Semana': emp.contracted_hours_weekly || 0,
                'Inicio Contrato': emp.contract_start_date || 'N/A',
                'Fin Contrato': emp.contract_end_date || (emp.contract_type === 'indefinido' ? 'Indefinido' : 'N/A'),
                'Estado': emp.active ? 'Activo' : 'Inactivo',
                'Rol': emp.role === 'admin' ? 'Administrador' : emp.role === 'super_admin' ? 'Superadministrador' : 'Empleado'
            }))

            const wb = XLSX.utils.book_new()
            const ws = XLSX.utils.json_to_sheet(excelData)

            // Set column widths
            ws['!cols'] = [
                { wch: 10 }, // Código
                { wch: 30 }, // Nombre Completo
                { wch: 15 }, // DNI
                { wch: 20 }, // Seg Social
                { wch: 15 }, // Tipo Contrato
                { wch: 10 }, // Horas/Día
                { wch: 12 }, // Horas/Sem
                { wch: 15 }, // Inicio
                { wch: 15 }, // Fin
                { wch: 10 }, // Estado
                { wch: 12 }  // Rol
            ]

            XLSX.utils.book_append_sheet(wb, ws, 'Plantilla_Laboral')
            XLSX.writeFile(wb, `Informe_Laboral_Completo_${format(new Date(), 'yyyy-MM-dd')}.xlsx`)

            alert('✅ Informe laboral completo exportado correctamente')

        } catch (err) {
            console.error('Error generating bulk report:', err)
            alert('Error al generar informe: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            {/* Employee Selection */}
            <div style={{ marginTop: '1.5rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <label style={{ fontWeight: 'bold' }}>Seleccionar Empleado:</label>
                    <label style={{ fontSize: '0.875rem', color: '#6b7280', display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={showInactive}
                            onChange={(e) => setShowInactive(e.target.checked)}
                            style={{ marginRight: '0.5rem' }}
                        />
                        Mostrar inactivos
                    </label>
                </div>
                <select
                    value={selectedEmployee?.id || ''}
                    onChange={(e) => {
                        const emp = employees.find(emp => emp.id === e.target.value)
                        setSelectedEmployee(emp)
                    }}
                    style={{
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        fontSize: '1rem',
                        width: '100%',
                        marginBottom: '1rem'
                    }}
                >
                    <option value="">-- Selecciona un empleado --</option>
                    {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>
                            {emp.full_name || 'Sin nombre'} {emp.employee_code ? `(${emp.employee_code})` : ''} - {emp.role === 'admin' ? 'Administrador' : emp.role === 'super_admin' ? 'Superadministrador' : 'Empleado'} {!emp.active ? '(Inactivo)' : ''}
                        </option>
                    ))}
                </select>

                <button
                    onClick={generateBulkLaborReport}
                    disabled={loading}
                    className="btn btn-secondary"
                    style={{ width: '100%', marginBottom: '1.5rem', backgroundColor: '#4b5563', color: 'white' }}
                >
                    {loading ? 'Generando...' : '📊 Exportar Datos Laborales (Todos)'}
                </button>

                {selectedEmployee && (
                    <>
                        <div style={{
                            backgroundColor: '#fff',
                            padding: '1.5rem',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            marginBottom: '1.5rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                <h4 style={{ margin: 0, color: '#374151' }}>📋 Información Laboral</h4>
                                {selectedEmployee.role !== 'super_admin' && (
                                    <button
                                        onClick={() => {
                                            setEditFormData({ ...selectedEmployee })
                                            setEditMode(true)
                                        }}
                                        className="btn btn-secondary"
                                        style={{ padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}
                                    >
                                        ✏️ Editar
                                    </button>
                                )}
                            </div>

                            <style>{`
                                .admin-grid {
                                    display: grid;
                                    grid-template-columns: 1fr 1fr;
                                    gap: 1rem;
                                }
                                @media (max-width: 600px) {
                                    .admin-grid {
                                        grid-template-columns: 1fr;
                                    }
                                }
                            `}</style>
                            <div className="admin-grid">
                                <div>
                                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>DNI/NIF</p>
                                    <p style={{ margin: 0, fontWeight: '500' }}>
                                        {maskString(selectedEmployee.dni)}
                                    </p>
                                </div>
                                <div>
                                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Seguridad Social</p>
                                    <p style={{ margin: 0, fontWeight: '500' }}>
                                        {maskString(selectedEmployee.social_security_number)}
                                    </p>
                                </div>
                                <div>
                                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Tipo de Contrato</p>
                                    <p style={{ margin: 0, fontWeight: '500', textTransform: 'capitalize' }}>
                                        {selectedEmployee.contract_type || 'No definido'}
                                    </p>
                                </div>
                                <div>
                                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Horas Contratadas</p>
                                    <p style={{ margin: 0, fontWeight: '500' }}>
                                        {selectedEmployee.contracted_hours_daily}h día / {selectedEmployee.contracted_hours_weekly}h sem.
                                    </p>
                                </div>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Correo Electrónico</p>
                                    <p style={{ margin: 0, fontWeight: '500' }}>
                                        {selectedEmployee.email || 'No definido'}
                                    </p>
                                </div>
                                <div>
                                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Inicio Contrato</p>
                                    <p style={{ margin: 0, fontWeight: '500' }}>
                                        {selectedEmployee.contract_start_date || 'No definida'}
                                    </p>
                                </div>
                                <div>
                                    <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.875rem', color: '#6b7280' }}>Fin Contrato</p>
                                    <p style={{ margin: 0, fontWeight: '500' }}>
                                        {selectedEmployee.contract_end_date || (selectedEmployee.contract_type === 'indefinido' ? 'Indefinido' : 'No definida')}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Document Management Section */}
                        <div style={{
                            backgroundColor: '#fff',
                            padding: '1.5rem',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            marginBottom: '1.5rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}>
                            <DocumentManager employee={selectedEmployee} adminProfile={profile} />
                        </div>

                        {/* Actions and Reports Section */}
                        <div style={{
                            backgroundColor: '#fff',
                            padding: '1.5rem',
                            borderRadius: '8px',
                            border: '1px solid #e5e7eb',
                            marginBottom: '1.5rem',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                        }}>
                            <h4 style={{ margin: 0, color: '#374151', marginBottom: '1rem' }}>⚙️ Acciones y Reportes</h4>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                                Mes a consultar:
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
                                    fontSize: '1rem',
                                    marginBottom: '1rem',
                                    width: '100%'
                                }}
                            />
                            <button
                                onClick={generateEmployeePDF}
                                disabled={loading || timeEntries.length === 0}
                                className="btn btn-primary"
                                style={{ width: '100%', marginTop: '0.5rem' }}
                            >
                                {loading ? 'Generando PDF...' : '📄 Generar PDF del Empleado'}
                            </button>
                            <button
                                onClick={generateEmployeeExcel}
                                disabled={loading || timeEntries.length === 0}
                                className="btn btn-secondary"
                                style={{ width: '100%', marginTop: '0.5rem' }}
                            >
                                {loading ? 'Generando Excel...' : '📊 Generar Excel del Empleado'}
                            </button>
                            <button
                                onClick={toggleEmployeeStatus}
                                disabled={loading}
                                className="btn"
                                style={{
                                    width: '100%',
                                    marginTop: '0.5rem',
                                    backgroundColor: selectedEmployee.active ? '#dc3545' : '#10b981',
                                    color: 'white',
                                    border: 'none',
                                    padding: '0.75rem'
                                }}
                            >
                                {loading ? 'Procesando...' : selectedEmployee.active ? '🚫 Desactivar Empleado' : '✅ Reactivar Empleado'}
                            </button>
                            <button
                                onClick={deleteEmployee}
                                disabled={loading}
                                className="btn"
                                style={{
                                    width: '100%',
                                    marginTop: '1.5rem',
                                    backgroundColor: '#fef2f2',
                                    color: '#b91c1c',
                                    border: '1px solid #fee2e2',
                                    fontSize: '0.875rem',
                                    padding: '0.75rem'
                                }}
                            >
                                {loading ? 'Borrando...' : '🗑️ Eliminar Perfil Definitivamente'}
                            </button>
                        </div>

                        {/* Employee Summary Statistics */}
                        <div style={{
                            backgroundColor: '#f9fafb',
                            padding: '1.5rem',
                            borderRadius: '8px',
                            marginBottom: '1.5rem',
                            border: '1px solid #e5e7eb'
                        }}>
                            <h4 style={{ marginTop: 0, color: '#374151' }}>📊 Resumen Mensual</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1rem' }}>
                                <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block' }}>Total Horas</span>
                                    <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{calculateMonthlyTotal()}</span>
                                </div>
                                <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                    <span style={{ fontSize: '0.75rem', color: '#6b7280', display: 'block' }}>Días Fichados</span>
                                    <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>{timeEntries.length}</span>
                                </div>
                            </div>
                        </div>

                        {/* Recent Entries Table */}
                        <div style={{ marginTop: '2rem' }}>
                            <h4 style={{ color: '#374151', marginBottom: '1rem' }}>📝 Fichajes Recientes ({format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: es })})</h4>
                            {loading ? (
                                <p>Cargando fichajes...</p>
                            ) : timeEntries.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#f9fafb', borderRadius: '8px' }}>
                                    <p style={{ color: '#6b7280', margin: 0 }}>No hay fichajes registrados para este periodo.</p>
                                </div>
                            ) : (
                                <div style={{ overflowX: 'auto' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                                        <thead>
                                            <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                                <th style={{ padding: '0.75rem' }}>Fecha</th>
                                                <th style={{ padding: '0.75rem' }}>Entrada</th>
                                                <th style={{ padding: '0.75rem' }}>Salida</th>
                                                <th style={{ padding: '0.75rem' }}>Pausas</th>
                                                <th style={{ padding: '0.75rem' }}>Neto</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {timeEntries.map((entry) => (
                                                <tr key={entry.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                                    <td style={{ padding: '0.75rem' }}>{format(new Date(entry.work_date), 'dd/MM/yyyy')}</td>
                                                    <td style={{ padding: '0.75rem' }}>{format(new Date(entry.start_at), 'HH:mm')}</td>
                                                    <td style={{ padding: '0.75rem' }}>{entry.end_at ? format(new Date(entry.end_at), 'HH:mm') : '-'}</td>
                                                    <td style={{ padding: '0.75rem' }}>
                                                        {entry.break_entries?.reduce((acc, brk) => brk.end_at ? acc + Math.floor((new Date(brk.end_at) - new Date(brk.start_at)) / 60000) : acc, 0) || 0}m
                                                    </td>
                                                    <td style={{ padding: '0.75rem', fontWeight: 'bold' }}>{formatDuration(entry.start_at, entry.end_at, entry.break_entries)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* Edit Modal */}
            {editMode && (
                <div style={{
                    position: 'fixed',
                    top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    zIndex: 2000,
                    padding: '1rem'
                }}>
                    <div style={{
                        backgroundColor: '#fff',
                        padding: '2rem',
                        borderRadius: '12px',
                        width: '100%',
                        maxWidth: '600px',
                        maxHeight: '90vh',
                        overflowY: 'auto'
                    }}>
                        <h3 style={{ marginTop: 0 }}>Editar Empleado: {editFormData.full_name}</h3>
                        <form onSubmit={handleUpdateLaborData}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div style={{ gridColumn: 'span 2' }}>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280' }}>Nombre Completo</label>
                                    <input type="text" value={editFormData.full_name} disabled style={{ width: '100%', padding: '0.5rem', backgroundColor: '#f3f4f6' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280' }}>Email</label>
                                    <input type="email" value={editFormData.email || ''} onChange={e => setEditFormData({ ...editFormData, email: e.target.value })} style={{ width: '100%', padding: '0.5rem' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280' }}>DNI</label>
                                    <input type="text" value={editFormData.dni || ''} onChange={e => setEditFormData({ ...editFormData, dni: e.target.value })} style={{ width: '100%', padding: '0.5rem' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280' }}>Contrato</label>
                                    <select value={editFormData.contract_type || ''} onChange={e => setEditFormData({ ...editFormData, contract_type: e.target.value })} style={{ width: '100%', padding: '0.5rem' }}>
                                        <option value="indefinido">Indefinido</option>
                                        <option value="temporal">Temporal</option>
                                        <option value="practicas">Prácticas</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.75rem', color: '#6b7280' }}>Horas Diarias</label>
                                    <input type="number" step="0.5" value={editFormData.contracted_hours_daily || ''} onChange={e => setEditFormData({ ...editFormData, contracted_hours_daily: e.target.value })} style={{ width: '100%', padding: '0.5rem' }} />
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                <button type="button" onClick={() => setEditMode(false)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                                <button type="submit" disabled={loading} className="btn btn-primary" style={{ flex: 1 }}>{loading ? 'Guardando...' : 'Guardar'}</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
