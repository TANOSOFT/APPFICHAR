import { useState, useEffect } from 'react'
import { supabase, getRedirectUrl } from '../lib/supabase'

export function EmployeeInvite({ profile, onInviteSuccess }) {
    const [loading, setLoading] = useState(false)
    const [pendingInvitations, setPendingInvitations] = useState([])
    const [editingInvitation, setEditingInvitation] = useState(null)
    const [showEditModal, setShowEditModal] = useState(false)
    const [formData, setFormData] = useState({
        email: '',
        fullName: '',
        employeeCode: '',
        role: 'employee',
        // New employee labor fields
        dni: '',
        socialSecurityNumber: '',
        contractType: 'indefinido',
        contractedHoursDaily: '8.00',
        contractedHoursWeekly: '40.00',
        contractStartDate: '',
        contractEndDate: ''
    })

    useEffect(() => {
        fetchPendingInvitations()
    }, [])

    const fetchPendingInvitations = async () => {
        try {
            const { data, error } = await supabase
                .from('pending_invitations')
                .select('*')
                .eq('tenant_id', profile.tenant_id)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })

            if (error) throw error
            setPendingInvitations(data || [])
        } catch (err) {
            console.error('Error fetching invitations:', err)
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()

        if (!formData.email || !formData.fullName) {
            alert('Por favor completa el email y nombre del empleado')
            return
        }

        try {
            setLoading(true)

            // Create a pending invitation record
            const { error: inviteError } = await supabase
                .from('pending_invitations')
                .insert({
                    tenant_id: profile.tenant_id,
                    email: formData.email.toLowerCase().trim(),
                    full_name: formData.fullName,
                    employee_code: formData.employeeCode,
                    role: formData.role,
                    invited_by: profile.id,
                    status: 'pending',
                    // New employee labor fields
                    dni: formData.dni.trim() || null,
                    social_security_number: formData.socialSecurityNumber.trim() || null,
                    contract_type: formData.contractType,
                    contracted_hours_daily: parseFloat(formData.contractedHoursDaily),
                    contracted_hours_weekly: parseFloat(formData.contractedHoursWeekly),
                    contract_start_date: formData.contractStartDate || null,
                    contract_end_date: formData.contractEndDate || null
                })

            if (inviteError) {
                if (inviteError.code === '23505') { // Unique constraint violation
                    alert('❌ Ya existe una invitación pendiente para este email')
                } else {
                    throw inviteError
                }
                return
            }

            // Send magic link (invitation email)
            const { error: otpError } = await supabase.auth.signInWithOtp({
                email: formData.email.toLowerCase().trim(),
                options: {
                    emailRedirectTo: getRedirectUrl()
                }
            })

            if (otpError) {
                console.warn('Invitación creada pero falló el envío del email:', otpError)
                alert(`✅ Invitación creada para ${formData.email}, pero hubo un problema al enviar el email automáticamente.\n\nPuedes intentar reenviarlo desde la lista de "Invitaciones Pendientes" más abajo.`)
            } else {
                alert(`✅ Invitación enviada con éxito a ${formData.email}\n\nEl empleado ha recibido un email con un enlace de acceso (Magic Link) para registrarse y acceder automáticamente a tu empresa.`)
            }

            // Reset form
            setFormData({
                email: '',
                fullName: '',
                employeeCode: '',
                role: 'employee',
                dni: '',
                socialSecurityNumber: '',
                contractType: 'indefinido',
                contractedHoursDaily: '8.00',
                contractedHoursWeekly: '40.00',
                contractStartDate: '',
                contractEndDate: ''
            })

            if (onInviteSuccess) onInviteSuccess()
            fetchPendingInvitations()

        } catch (err) {
            console.error('Error inviting employee:', err)
            alert('Error al crear invitación: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteInvitation = async (id) => {
        if (!confirm('¿Seguro que quieres eliminar esta invitación?')) return
        try {
            setLoading(true)
            const { error } = await supabase
                .from('pending_invitations')
                .delete()
                .eq('id', id)

            if (error) throw error
            fetchPendingInvitations()
        } catch (err) {
            alert('Error al eliminar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleResendInvitation = async (email) => {
        try {
            setLoading(true)
            const { error } = await supabase.auth.signInWithOtp({
                email: email.toLowerCase().trim(),
                options: {
                    emailRedirectTo: getRedirectUrl()
                }
            })
            if (error) throw error
            alert('✅ Enlace de acceso reenviado a ' + email)
        } catch (err) {
            alert('Error al reenviar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateInvitation = async (e) => {
        e.preventDefault()
        try {
            setLoading(true)
            const { error } = await supabase
                .from('pending_invitations')
                .update({
                    email: editingInvitation.email.toLowerCase().trim(),
                    full_name: editingInvitation.full_name,
                    employee_code: editingInvitation.employee_code,
                    role: editingInvitation.role,
                    dni: editingInvitation.dni || null,
                    social_security_number: editingInvitation.social_security_number || null,
                    contract_type: editingInvitation.contract_type,
                    contracted_hours_daily: parseFloat(editingInvitation.contracted_hours_daily),
                    contracted_hours_weekly: parseFloat(editingInvitation.contracted_hours_weekly),
                    contract_start_date: editingInvitation.contract_start_date || null,
                    contract_end_date: editingInvitation.contract_end_date || null
                })
                .eq('id', editingInvitation.id)

            if (error) throw error
            setShowEditModal(false)
            fetchPendingInvitations()
            alert('✅ Invitación actualizada')
        } catch (err) {
            alert('Error al actualizar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    return (
        <div>
            <h3>✉️ Invitar Empleado</h3>
            <p className="text-muted">Crea invitaciones para nuevos empleados</p>

            <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem' }}>
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        Email *
                    </label>
                    <input
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        placeholder="empleado@ejemplo.com"
                        style={{
                            padding: '0.5rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            fontSize: '1rem',
                            width: '100%'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        Nombre Completo *
                    </label>
                    <input
                        type="text"
                        required
                        value={formData.fullName}
                        onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                        placeholder="Juan Pérez"
                        style={{
                            padding: '0.5rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            fontSize: '1rem',
                            width: '100%'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        Código de Empleado
                    </label>
                    <input
                        type="text"
                        value={formData.employeeCode}
                        onChange={(e) => setFormData({ ...formData, employeeCode: e.target.value })}
                        placeholder="EMP001"
                        style={{
                            padding: '0.5rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            fontSize: '1rem',
                            width: '100%'
                        }}
                    />
                </div>

                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        Rol
                    </label>
                    <select
                        value={formData.role}
                        onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                        style={{
                            padding: '0.5rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            fontSize: '1rem',
                            width: '100%'
                        }}
                    >
                        <option value="employee">Empleado</option>
                        <option value="admin">Administrador (Control Total)</option>
                    </select>
                </div>

                {/* Divider for labor data section */}
                <div style={{
                    borderTop: '2px solid #e5e7eb',
                    margin: '1.5rem 0',
                    paddingTop: '1rem'
                }}>
                    <h4 style={{ marginBottom: '1rem', fontSize: '1rem', color: '#374151' }}>
                        📋 Datos Laborales
                    </h4>
                </div>

                {/* DNI */}
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        DNI/NIF
                    </label>
                    <input
                        type="text"
                        value={formData.dni}
                        onChange={(e) => setFormData({ ...formData, dni: e.target.value.toUpperCase() })}
                        placeholder="12345678Z"
                        maxLength="9"
                        style={{
                            padding: '0.5rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            fontSize: '1rem',
                            width: '100%'
                        }}
                    />
                </div>

                {/* Social Security Number */}
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        Número de Seguridad Social
                    </label>
                    <input
                        type="text"
                        value={formData.socialSecurityNumber}
                        onChange={(e) => setFormData({ ...formData, socialSecurityNumber: e.target.value })}
                        placeholder="12 12345678 90"
                        style={{
                            padding: '0.5rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            fontSize: '1rem',
                            width: '100%'
                        }}
                    />
                </div>

                {/* Contract Type */}
                <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                        Tipo de Contrato
                    </label>
                    <select
                        value={formData.contractType}
                        onChange={(e) => setFormData({ ...formData, contractType: e.target.value })}
                        style={{
                            padding: '0.5rem',
                            borderRadius: '4px',
                            border: '1px solid var(--border-color)',
                            fontSize: '1rem',
                            width: '100%'
                        }}
                    >
                        <option value="indefinido">Indefinido</option>
                        <option value="temporal">Temporal</option>
                        <option value="practicas">Prácticas</option>
                        <option value="freelance">Freelance</option>
                        <option value="otros">Otros</option>
                    </select>
                </div>

                {/* Contracted Hours */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Horas Diarias
                        </label>
                        <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="24"
                            value={formData.contractedHoursDaily}
                            onChange={(e) => setFormData({ ...formData, contractedHoursDaily: e.target.value })}
                            style={{
                                padding: '0.5rem',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                fontSize: '1rem',
                                width: '100%'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Horas Semanales
                        </label>
                        <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="168"
                            value={formData.contractedHoursWeekly}
                            onChange={(e) => setFormData({ ...formData, contractedHoursWeekly: e.target.value })}
                            style={{
                                padding: '0.5rem',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                fontSize: '1rem',
                                width: '100%'
                            }}
                        />
                    </div>
                </div>

                {/* Contract Dates */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Fecha Inicio Contrato
                        </label>
                        <input
                            type="date"
                            value={formData.contractStartDate}
                            onChange={(e) => setFormData({ ...formData, contractStartDate: e.target.value })}
                            style={{
                                padding: '0.5rem',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                fontSize: '1rem',
                                width: '100%'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Fecha Fin Contrato
                            <span style={{ fontSize: '0.75rem', color: '#666', marginLeft: '0.5rem' }}>
                                (vacío si indefinido)
                            </span>
                        </label>
                        <input
                            type="date"
                            value={formData.contractEndDate}
                            onChange={(e) => setFormData({ ...formData, contractEndDate: e.target.value })}
                            disabled={formData.contractType === 'indefinido'}
                            style={{
                                padding: '0.5rem',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                fontSize: '1rem',
                                width: '100%',
                                backgroundColor: formData.contractType === 'indefinido' ? '#f3f4f6' : 'white'
                            }}
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                >
                    {loading ? 'Creando invitación...' : '✉️ Crear Invitación'}
                </button>
            </form>

            <div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                backgroundColor: '#eff6ff',
                borderRadius: '8px',
                border: '1px solid #3b82f6'
            }}>
                <p style={{ margin: 0, fontSize: '0.875rem' }}>
                    <strong>ℹ️ Cómo funciona:</strong><br />
                    1. Creas la invitación con el email del empleado<br />
                    2. El empleado se registra en la app con ese email usando el Magic Link<br />
                    3. Al iniciar sesión, su perfil se crea automáticamente en tu empresa
                </p>
            </div>

            {/* Pending Invitations List */}
            <div style={{ marginTop: '2.5rem', paddingTop: '2rem', borderTop: '2px dashed #e5e7eb' }}>
                <h3 style={{ color: '#4f46e5' }}>📋 Invitaciones Pendientes</h3>
                <p className="text-muted">Empleados invitados que aún no se han registrado</p>

                {pendingInvitations.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '2rem', backgroundColor: '#f9fafb', borderRadius: '12px', marginTop: '1rem' }}>
                        No hay invitaciones pendientes.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '2px solid #e5e7eb', textAlign: 'left' }}>
                                    <th style={{ padding: '0.75rem' }}>Email</th>
                                    <th style={{ padding: '0.75rem' }}>Nombre</th>
                                    <th style={{ padding: '0.75rem' }}>Rol</th>
                                    <th style={{ padding: '0.75rem' }}>Fecha</th>
                                    <th style={{ padding: '0.75rem' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {pendingInvitations.map(inv => (
                                    <tr key={inv.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '0.75rem' }}>{inv.email}</td>
                                        <td style={{ padding: '0.75rem' }}>{inv.full_name}</td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <span style={{
                                                fontSize: '0.75rem',
                                                padding: '0.2rem 0.5rem',
                                                backgroundColor: inv.role === 'admin' ? '#fee2e2' : '#f0f9ff',
                                                color: inv.role === 'admin' ? '#991b1b' : '#0369a1',
                                                borderRadius: '999px'
                                            }}>
                                                {inv.role === 'admin' ? 'Admin' : 'Empleado'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem', fontSize: '0.875rem' }}>
                                            {new Date(inv.created_at).toLocaleDateString()}
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => handleResendInvitation(inv.email)}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#ecfdf5', color: '#047857' }}
                                                    title="Reenviar Email"
                                                >
                                                    📧
                                                </button>
                                                <button
                                                    onClick={() => { setEditingInvitation({ ...inv }); setShowEditModal(true); }}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                    title="Editar"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteInvitation(inv.id)}
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', backgroundColor: '#fef2f2', color: '#991b1b' }}
                                                    title="Eliminar"
                                                >
                                                    🗑️
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Edit Modal */}
            {showEditModal && editingInvitation && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex',
                    justifyContent: 'center', alignItems: 'center', zIndex: 1000,
                    padding: '1rem'
                }}>
                    <div className="card" style={{
                        width: '100%', maxWidth: '500px',
                        maxHeight: '90vh', overflowY: 'auto',
                        borderRadius: '16px'
                    }}>
                        <h3 style={{ color: '#4f46e5' }}>✏️ Corregir Invitación</h3>
                        <form onSubmit={handleUpdateInvitation} style={{ marginTop: '1.5rem' }}>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Email</label>
                                <input
                                    className="input" type="email" required
                                    value={editingInvitation.email}
                                    onChange={e => setEditingInvitation({ ...editingInvitation, email: e.target.value })}
                                />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Nombre</label>
                                <input
                                    className="input" type="text" required
                                    value={editingInvitation.full_name}
                                    onChange={e => setEditingInvitation({ ...editingInvitation, full_name: e.target.value })}
                                />
                            </div>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.5rem' }}>Rol</label>
                                <select
                                    className="input"
                                    value={editingInvitation.role}
                                    onChange={e => setEditingInvitation({ ...editingInvitation, role: e.target.value })}
                                >
                                    <option value="employee">Empleado</option>
                                    <option value="admin">Admin</option>
                                </select>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                                <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>Guardar</button>
                                <button
                                    type="button"
                                    onClick={() => setShowEditModal(false)}
                                    className="btn btn-secondary"
                                    style={{ flex: 1 }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
