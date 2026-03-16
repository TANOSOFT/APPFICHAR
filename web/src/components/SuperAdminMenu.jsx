import { useState, useEffect } from 'react'
import { supabase, getRedirectUrl } from '../lib/supabase'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { AdminMenu } from './AdminMenu'
import { MonetizationPanel } from './MonetizationPanel'

export function SuperAdminMenu({ profile }) {
    // Custom Professional Styles for SuperAdmin
    const modalStyles = `
        @keyframes modalIn {
            from { opacity: 0; transform: translateY(20px) scale(0.95); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .super-admin-modal-card {
            animation: modalIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
        }
        .super-admin-input:focus {
            border-color: #6366f1 !important;
            box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.1) !important;
            outline: none;
        }
    `;
    const [tenants, setTenants] = useState([])
    const [loading, setLoading] = useState(false)
    const [stats, setStats] = useState({ companies: 0, employees: 0, timeEntries: 0 })
    const [showNewTenantModal, setShowNewTenantModal] = useState(false)
    const [newTenantData, setNewTenantData] = useState({
        name: '',
        legal_name: '',
        admin_email: '',
        admin_name: ''
    })
    const [selectedTenant, setSelectedTenant] = useState(null)
    const [tenantProfiles, setTenantProfiles] = useState([])
    const [tenantInvitations, setTenantInvitations] = useState([])
    const [orphanedProfiles, setOrphanedProfiles] = useState([])
    const [activeTab, setActiveTab] = useState('companies') // companies, users, system
    const [tenantSearch, setTenantSearch] = useState('')
    const [userSearch, setUserSearch] = useState('')
    const [globalUsers, setGlobalUsers] = useState([])
    const [showEditTenantModal, setShowEditTenantModal] = useState(false)
    const [editingTenant, setEditingTenant] = useState(null)

    useEffect(() => {
        fetchTenants()
        fetchGlobalStats()
        fetchOrphanedProfiles()
        if (activeTab === 'users') {
            fetchGlobalUsers(userSearch)
        }
    }, [activeTab])

    useEffect(() => {
        if (selectedTenant) {
            fetchTenantData(selectedTenant.id)
        }
    }, [selectedTenant])

    const fetchTenantData = async (tenantId) => {
        setLoading(true)
        await Promise.all([
            fetchTenantProfiles(tenantId),
            fetchTenantInvitations(tenantId)
        ])
        setLoading(false)
    }

    const fetchTenantProfiles = async (tenantId) => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })

            if (error) throw error
            setTenantProfiles(data || [])
        } catch (err) {
            console.error('Error fetching profiles:', err)
        }
    }

    const fetchTenantInvitations = async (tenantId) => {
        try {
            const { data, error } = await supabase
                .from('pending_invitations')
                .select('*')
                .eq('tenant_id', tenantId)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })

            if (error) throw error
            setTenantInvitations(data || [])
        } catch (err) {
            console.error('Error fetching invitations:', err)
        }
    }

    const fetchOrphanedProfiles = async () => {
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .is('tenant_id', null)

            if (error) throw error
            setOrphanedProfiles(data || [])
        } catch (err) {
            console.error('Error fetching orphaned profiles:', err)
        }
    }

    const fetchGlobalUsers = async (query = '') => {
        try {
            setLoading(true)
            let supabaseQuery = supabase
                .from('profiles')
                .select('*, tenants(name)')
                .order('created_at', { ascending: false })
                .limit(100)

            if (query && query.trim().length > 0) {
                // Search by name or email
                supabaseQuery = supabaseQuery.or(`full_name.ilike.%${query}%,email.ilike.%${query}%`)
            }

            const { data, error } = await supabaseQuery

            if (error) throw error
            setGlobalUsers(data || [])
        } catch (err) {
            console.error('Error fetching global users:', err)
        } finally {
            setLoading(false)
        }
    }

    const handleAssignTenant = async (userId, tenantId) => {
        if (!tenantId) return
        try {
            setLoading(true)
            const { error } = await supabase
                .from('profiles')
                .update({ tenant_id: tenantId })
                .eq('id', userId)

            if (error) throw error
            alert('✅ Usuario asignado a la empresa correctamente.')
            fetchOrphanedProfiles()
            fetchTenants()
            fetchGlobalStats()
        } catch (err) {
            alert('Error al asignar empresa: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteInvitation = async (invitationId) => {
        if (!confirm('¿Seguro que quieres cancelar esta invitación? El enlace dejará de funcionar.')) return
        try {
            setLoading(true)
            const { error } = await supabase
                .from('pending_invitations')
                .delete()
                .eq('id', invitationId)

            if (error) throw error
            fetchTenantInvitations(selectedTenant.id)
        } catch (err) {
            alert('Error al borrar invitación: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleResendAdminInvite = async (tenantId) => {
        try {
            setLoading(true)
            let emailToSend = null

            // 1. Try to find the email in pending_invitations first
            const { data: invite, error: fetchError } = await supabase
                .from('pending_invitations')
                .select('email')
                .eq('tenant_id', tenantId)
                .eq('role', 'admin')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()

            if (fetchError) throw fetchError

            if (invite?.email) {
                emailToSend = invite.email
            } else {
                // 2. Fallback: Try profiles (though it might not have email column yet)
                const { data: adminProfile, error: profileError } = await supabase
                    .from('profiles')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .eq('role', 'admin')
                    .limit(1)
                    .maybeSingle()

                if (profileError) throw profileError
                if (adminProfile?.email) {
                    emailToSend = adminProfile.email
                }
            }

            if (!emailToSend) {
                alert('⚠️ No se encontró ningún email para el administrador de esta empresa.')
                return
            }

            await handleResendInvitation(emailToSend)
        } catch (err) {
            alert('Error al enviar enlace de acceso: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleResendInvitation = async (email) => {
        try {
            setLoading(true)
            const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
                redirectTo: getRedirectUrl()
            })
            if (error) throw error
            alert('✅ Enlace de activación (reset de clave) reenviado a ' + email)
        } catch (err) {
            alert('Error al reenviar: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleChangeUserRole = async (userId, newRole) => {
        try {
            setLoading(true)
            const { error } = await supabase
                .from('profiles')
                .update({ role: newRole })
                .eq('id', userId)

            if (error) throw error
            alert('✅ Rol actualizado correctamente')
            fetchTenantProfiles(selectedTenant.id)
        } catch (err) {
            alert('Error al actualizar rol: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteProfile = async (userId, userName) => {
        if (!confirm(`🚨 ¿ESTÁS ABSOLUTAMENTE SEGURO de eliminar DEFINITIVAMENTE el perfil de "${userName}"?\n\nEsta acción borrará todos sus fichajes, ausencias y datos asociados de forma IRREVERSIBLE.`)) return
        try {
            setLoading(true)
            const { error } = await supabase
                .from('profiles')
                .delete()
                .eq('id', userId)

            if (error) throw error
            alert('✅ Perfil eliminado correctamente.')
            fetchTenantProfiles(selectedTenant.id)
            fetchGlobalStats()
        } catch (err) {
            alert('Error al borrar perfil: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleExportTenant = async (tenant) => {
        try {
            setLoading(true)
            // Clean tenant object for export (remove joined counts/UI fields)
            const cleanTenant = { ...tenant }
            delete cleanTenant.profiles

            const backup = {
                exported_at: new Date().toISOString(),
                tenant: cleanTenant,
                branding: null,
                profiles: [],
                centers: [],
                time_entries: [],
                break_entries: [],
                correction_requests: [],
                absence_requests: [],
                company_holidays: [],
                pending_invitations: []
            }

            // Tables to export (filtered by tenant_id)
            const tables = [
                'tenant_branding', 'profiles', 'centers', 'time_entries',
                'break_entries', 'correction_requests', 'absence_requests',
                'company_holidays', 'pending_invitations'
            ]

            for (const table of tables) {
                const { data, error } = await supabase
                    .from(table)
                    .select('*')
                    .eq('tenant_id', tenant.id)

                if (error) throw error

                if (table === 'tenant_branding') backup.branding = data?.[0] || null
                else backup[table] = data || []
            }

            // Create blob and download
            const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `BACKUP_${tenant.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd_HHmm')}.json`
            document.body.appendChild(a)
            a.click()
            document.body.removeChild(a)
            URL.revokeObjectURL(url)

            alert('✅ Copia de seguridad descargada correctamente. Guárdala bien antes de borrar.')
        } catch (err) {
            console.error('Error exporting tenant:', err)
            alert('Error al exportar datos: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteTenant = async (tenant) => {
        const confirm1 = confirm(`🚨 ¿ESTÁS TOTALMENTE SEGURO de eliminar la empresa "${tenant.name}"?`)
        if (!confirm1) return

        const confirm2 = confirm(`⚠️ Esto borrará todos los empleados, fichajes y configuraciones. ¿Has descargado ya la copia de seguridad JSON?`)
        if (!confirm2) return

        const securityCode = prompt(`Escribe el nombre de la empresa (${tenant.name}) para confirmar el borrado definitivo:`)
        if (securityCode?.trim().toLowerCase() !== tenant.name.trim().toLowerCase()) {
            alert('El nombre no coincide. Operación cancelada.')
            return
        }

        try {
            setLoading(true)

            // Delete in order to respect FKs (or rely on CASCADE if configured)
            // schema.sql has several ON DELETE CASCADE on tenant_id, but let's be explicit where needed

            // 1. Delete tenant (cascades to others if defined)
            const { error: deleteError } = await supabase
                .from('tenants')
                .delete()
                .eq('id', tenant.id)

            if (deleteError) throw deleteError

            alert('✅ Empresa eliminada correctamente del sistema.')
            fetchTenants()
            fetchGlobalStats()
        } catch (err) {
            console.error('Error deleting tenant:', err)
            alert('Error crítico al borrar empresa: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleRestoreTenant = async (event) => {
        const file = event.target.files[0]
        if (!file) return

        const reader = new FileReader()
        reader.onload = async (e) => {
            try {
                setLoading(true)
                const backup = JSON.parse(e.target.result)

                if (!backup.tenant || !backup.profiles) {
                    throw new Error('El archivo JSON no parece ser una copia de seguridad válida.')
                }

                // 1. Restore Tenant
                const tenantToRestore = { ...backup.tenant }
                // Remove UI fields that might be in old or new backups
                delete tenantToRestore.profiles

                const { data: tenant, error: tErr } = await supabase
                    .from('tenants')
                    .upsert([tenantToRestore])
                    .select()
                    .single()

                if (tErr) throw tErr

                // 2. Restore Branding
                if (backup.branding) {
                    await supabase.from('tenant_branding').upsert([backup.branding])
                }

                // 3. Restore Tables in order to respect FKs
                const tables = [
                    'profiles', 'centers', 'time_entries',
                    'break_entries', 'correction_requests', 'absence_requests',
                    'company_holidays', 'pending_invitations'
                ]

                for (const table of tables) {
                    if (backup[table] && backup[table].length > 0) {
                        const { error } = await supabase
                            .from(table)
                            .upsert(backup[table])

                        if (error) {
                            console.error(`Error restaurando tabla ${table}:`, error)
                            // We continue with others but alert
                        }
                    }
                }

                alert(`✅ Restauración completada: "${tenant.name}" ha sido recuperada con éxito.`)
                fetchTenants()
                fetchGlobalStats()
            } catch (err) {
                console.error('Error restoring tenant:', err)
                alert('Error al restaurar: ' + err.message)
            } finally {
                setLoading(false)
                event.target.value = '' // Reset input
            }
        }
        reader.readAsText(file)
    }

    const fetchTenants = async () => {
        try {
            setLoading(true)
            const { data, error } = await supabase
                .from('tenants')
                .select(`
                    *,
                    profiles:profiles(count)
                `)
                .order('created_at', { ascending: false })

            if (error) throw error
            setTenants(data || [])
        } catch (err) {
            console.error('Error fetching tenants:', err)
        } finally {
            setLoading(false)
        }
    }

    const fetchGlobalStats = async () => {
        try {
            const { count: tenantCount } = await supabase.from('tenants').select('*', { count: 'exact', head: true })
            const { count: profileCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
            const { count: entryCount } = await supabase.from('time_entries').select('*', { count: 'exact', head: true })

            setStats({
                companies: tenantCount || 0,
                employees: profileCount || 0,
                timeEntries: entryCount || 0
            })
        } catch (err) {
            console.error('Error fetching global stats:', err)
        }
    }

    const handleCreateTenant = async (e) => {
        e.preventDefault()
        try {
            setLoading(true)

            // 1. Create Tenant
            const { data: tenant, error: tErr } = await supabase
                .from('tenants')
                .insert([{
                    name: newTenantData.name,
                    legal_name: newTenantData.legal_name
                }])
                .select()
                .single()

            if (tErr) throw tErr

            // 2. Create Initial Admin Invitation
            const { error: iErr } = await supabase
                .from('pending_invitations')
                .insert([{
                    tenant_id: tenant.id,
                    email: newTenantData.admin_email.toLowerCase().trim(),
                    full_name: newTenantData.admin_name,
                    role: 'admin',
                    status: 'pending'
                }])

            if (iErr) throw iErr

            // 3. Send activation link to Admin
            const { error: authErr } = await supabase.auth.resetPasswordForEmail(newTenantData.admin_email.toLowerCase().trim(), {
                redirectTo: getRedirectUrl()
            })

            if (authErr) throw authErr

            alert(`✅ Empresa "${tenant.name}" creada correctamente. Se ha enviado un enlace de acceso a ${newTenantData.admin_email}`)

            // Reset and refresh
            setNewTenantData({ name: '', legal_name: '', admin_email: '', admin_name: '' })
            setShowNewTenantModal(false)
            fetchTenants()
            fetchGlobalStats()
        } catch (err) {
            console.error('Error creating tenant:', err)
            alert('Error al crear empresa: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateTenant = async (e) => {
        e.preventDefault()
        try {
            setLoading(true)
            const { error } = await supabase
                .from('tenants')
                .update({
                    name: editingTenant.name,
                    legal_name: editingTenant.legal_name
                })
                .eq('id', editingTenant.id)

            if (error) throw error
            alert('✅ Datos de la empresa actualizados correctamente.')
            setShowEditTenantModal(false)
            fetchTenants()
        } catch (err) {
            alert('Error al actualizar empresa: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const filteredTenants = tenants.filter(t =>
        t.name.toLowerCase().includes(tenantSearch.toLowerCase()) ||
        (t.legal_name && t.legal_name.toLowerCase().includes(tenantSearch.toLowerCase()))
    )

    if (selectedTenant) {
        return (
            <div className="card" style={{ marginTop: '2rem', border: '2px solid #6366f1' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                    <div>
                        <h2 style={{ margin: 0, color: '#4f46e5' }}>🏭 Gestionando: {selectedTenant.name}</h2>
                        <p className="text-muted">Vista de administración para esta empresa</p>
                    </div>
                    <button
                        className="btn btn-secondary"
                        onClick={() => setSelectedTenant(null)}
                    >
                        ⬅️ Volver al Panel Global
                    </button>
                </div>

                <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px dashed #e5e7eb' }}>
                    <h3 style={{ margin: 0, color: '#4f46e5' }}>👥 Gestión de Usuarios Registrados</h3>
                    <p className="text-muted">Cambia roles de usuarios que ya han activado su cuenta</p>

                    <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{ padding: '0.75rem' }}>Nombre</th>
                                    <th style={{ padding: '0.75rem' }}>Email</th>
                                    <th style={{ padding: '0.75rem' }}>Rol Actual</th>
                                    <th style={{ padding: '0.75rem' }}>Cambiar Rol</th>
                                    <th style={{ padding: '0.75rem' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tenantProfiles.length === 0 && (
                                    <tr>
                                        <td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                                            No hay usuarios registrados todavía en esta empresa.
                                        </td>
                                    </tr>
                                )}
                                {tenantProfiles.map(u => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '0.75rem' }}>
                                            <strong>{u.full_name}</strong>
                                            <div style={{ fontSize: '0.75rem', color: '#666' }}>{u.employee_code}</div>
                                        </td>
                                        <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#4b5563' }}>
                                            {u.email || <span style={{ color: '#ef4444', fontStyle: 'italic' }}>Sin sincronizar</span>}
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <span style={{
                                                padding: '0.25rem 0.5rem',
                                                borderRadius: '4px',
                                                fontSize: '0.875rem',
                                                backgroundColor: u.role === 'admin' ? '#fee2e2' : '#f0f9ff',
                                                color: u.role === 'admin' ? '#991b1b' : '#0369a1'
                                            }}>
                                                {u.role === 'admin' ? 'Administrador' : u.role === 'super_admin' ? 'Superadministrador' : 'Empleado'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <select
                                                value={u.role}
                                                onChange={(e) => handleChangeUserRole(u.id, e.target.value)}
                                                style={{ padding: '0.25rem', borderRadius: '4px' }}
                                            >
                                                <option value="employee">Empleado</option>
                                                <option value="admin">Administrador</option>
                                            </select>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <button
                                                onClick={() => handleDeleteProfile(u.id, u.full_name)}
                                                className="btn btn-secondary"
                                                style={{
                                                    padding: '0.25rem 0.5rem',
                                                    fontSize: '0.75rem',
                                                    backgroundColor: '#fee2e2',
                                                    color: '#991b1b',
                                                    borderColor: '#fecaca'
                                                }}
                                            >
                                                🗑️ Borrar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={{ marginTop: '2.5rem', paddingTop: '2rem', borderTop: '2px dashed #e5e7eb' }}>
                    <h3 style={{ margin: 0, color: '#4f46e5' }}>✉️ Invitaciones Pendientes</h3>
                    <p className="text-muted">Usuarios invitados que aún no se han registrado</p>

                    <div style={{ overflowX: 'auto', marginTop: '1rem' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '1px solid #e5e7eb' }}>
                                    <th style={{ padding: '0.75rem' }}>Email / Nombre</th>
                                    <th style={{ padding: '0.75rem' }}>Rol Invitado</th>
                                    <th style={{ padding: '0.75rem' }}>Enviada</th>
                                    <th style={{ padding: '0.75rem' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tenantInvitations.length === 0 && (
                                    <tr>
                                        <td colSpan="4" style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>
                                            No hay invitaciones pendientes.
                                        </td>
                                    </tr>
                                )}
                                {tenantInvitations.map(inv => (
                                    <tr key={inv.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '0.75rem' }}>
                                            <strong>{inv.email}</strong>
                                            <div style={{ fontSize: '0.75rem', color: '#666' }}>{inv.full_name}</div>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <span style={{ fontSize: '0.875rem', color: '#4f46e5', fontWeight: 'bold' }}>
                                                {inv.role === 'admin' ? 'ADMINISTRADOR' : 'EMPLEADO'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                                            {format(new Date(inv.created_at), 'dd/MM/yyyy')}
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                <button
                                                    onClick={() => handleResendInvitation(inv.email)}
                                                    className="btn btn-secondary"
                                                    style={{
                                                        padding: '0.25rem 0.5rem',
                                                        fontSize: '0.75rem',
                                                        backgroundColor: '#ecfdf5',
                                                        color: '#047857',
                                                        borderColor: '#a7f3d0'
                                                    }}
                                                    title="Enviar Enlace de Activación (Password Reset)"
                                                >
                                                    🔑 Reactivar
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteInvitation(inv.id)}
                                                    className="btn btn-secondary"
                                                    style={{
                                                        padding: '0.25rem 0.5rem',
                                                        fontSize: '0.75rem',
                                                        backgroundColor: '#fee2e2',
                                                        color: '#991b1b',
                                                        borderColor: '#fecaca'
                                                    }}
                                                >
                                                    🗑️ Cancelar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px dashed #e5e7eb' }}>
                    <h3 style={{ margin: 0, color: '#4f46e5', marginBottom: '1.5rem' }}>⚙️ Panel Administrativo</h3>
                    {/* We pass a spoofed profile with the target tenant_id */}
                    <AdminMenu
                        profile={{ ...profile, tenant_id: selectedTenant.id }}
                        userId={profile.id}
                        onRefresh={() => fetchTenantData(selectedTenant.id)}
                    />
                </div>
            </div>
        )
    }

    return (
        <div className="card admin-card" style={{ marginTop: '2rem', border: '2px solid #6366f1', maxWidth: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
            <style>{`
                ${modalStyles}
                @media (max-width: 768px) {
                    .admin-card { padding: 0.75rem !important; margin-top: 1rem !important; }
                    .admin-header h2 { font-size: 1.1rem !important; line-height: 1.2; }
                    .admin-header p { font-size: 0.75rem !important; }
                    .btn-stack { width: 100%; flex-direction: column !important; margin-top: 0.5rem; }
                    .btn-stack button { width: 100%; justify-content: center; }
                    .tabs-scroll { 
                        display: flex !important;
                        overflow-x: auto !important; 
                        white-space: nowrap !important; 
                        -webkit-overflow-scrolling: touch;
                        padding-bottom: 5px;
                        margin-bottom: 0.5rem;
                        width: 100%;
                    }
                    .tabs-scroll button { 
                        padding: 0.5rem 0.75rem !important; 
                        font-size: 0.8rem !important; 
                        flex-shrink: 0;
                    }
                    .hide-on-mobile { display: none !important; }
                    .full-width-on-mobile { width: 100% !important; flex: 1 1 100% !important; }
                }
                @media (max-width: 400px) {
                    .admin-header h2 { font-size: 1rem !important; }
                    .tabs-scroll button { padding: 0.4rem 0.6rem !important; font-size: 0.75rem !important; }
                }
            `}</style>
            <div className="admin-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', width: '100%' }}>
                <div style={{ flex: '1 1 200px' }}>
                    <h2 style={{ margin: 0, color: '#4f46e5' }}>🛡️ Panel Super-Admin</h2>
                    <p className="text-muted" style={{ margin: 0, fontSize: '0.9rem' }}>Gestión global de empresas</p>
                </div>
                <div className="btn-stack" style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => document.getElementById('restore-input').click()}
                        style={{ fontSize: '0.875rem' }}
                    >
                        📥 Restaurar
                    </button>
                    <input
                        id="restore-input"
                        type="file"
                        accept=".json"
                        style={{ display: 'none' }}
                        onChange={handleRestoreTenant}
                    />
                    <button
                        className="btn btn-primary"
                        onClick={() => setShowNewTenantModal(true)}
                        style={{ backgroundColor: '#4f46e5', fontSize: '0.875rem' }}
                    >
                        🏢 Nueva Empresa
                    </button>
                </div>
            </div>

            {/* Tab Navigation */}
            <div className="tabs-scroll" style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem', borderBottom: '1px solid #e5e7eb' }}>
                <button
                    onClick={() => setActiveTab('companies')}
                    style={{
                        padding: '0.75rem 1rem', border: 'none', background: 'none', cursor: 'pointer',
                        borderBottom: activeTab === 'companies' ? '3px solid #6366f1' : '3px solid transparent',
                        fontWeight: activeTab === 'companies' ? 'bold' : 'normal',
                        color: activeTab === 'companies' ? '#6366f1' : '#666',
                        fontSize: '0.875rem'
                    }}
                >
                    🏢 Empresas
                </button>
                <button
                    onClick={() => setActiveTab('users')}
                    style={{
                        padding: '0.75rem 1rem', border: 'none', background: 'none', cursor: 'pointer',
                        borderBottom: activeTab === 'users' ? '3px solid #6366f1' : '3px solid transparent',
                        fontWeight: activeTab === 'users' ? 'bold' : 'normal',
                        color: activeTab === 'users' ? '#6366f1' : '#666',
                        fontSize: '0.875rem'
                    }}
                >
                    👥 Usuarios
                </button>
                <button
                    onClick={() => setActiveTab('monetization')}
                    style={{
                        padding: '0.75rem 1rem', border: 'none', background: 'none', cursor: 'pointer',
                        borderBottom: activeTab === 'monetization' ? '3px solid #6366f1' : '3px solid transparent',
                        fontWeight: activeTab === 'monetization' ? 'bold' : 'normal',
                        color: activeTab === 'monetization' ? '#6366f1' : '#666',
                        fontSize: '0.875rem'
                    }}
                >
                    💰 Monetización
                </button>
                <button
                    onClick={() => setActiveTab('system')}
                    style={{
                        padding: '0.75rem 1rem', border: 'none', background: 'none', cursor: 'pointer',
                        borderBottom: activeTab === 'system' ? '3px solid #6366f1' : '3px solid transparent',
                        fontWeight: activeTab === 'system' ? 'bold' : 'normal',
                        color: activeTab === 'system' ? '#6366f1' : '#666',
                        fontSize: '0.875rem'
                    }}
                >
                    🛡️ Estado
                </button>
            </div>

            {/* Global Stats (Always visible in System tab or header) */}
            {activeTab === 'system' && (
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                    gap: '1rem',
                    marginTop: '1.5rem',
                    marginBottom: '2rem'
                }}>
                    <div style={{ padding: '1rem', backgroundColor: '#f5f3ff', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#6d28d9' }}>{stats.companies}</div>
                        <div style={{ fontSize: '0.875rem', color: '#7c3aed' }}>Empresas</div>
                    </div>
                    <div style={{ padding: '1rem', backgroundColor: '#f0fdf4', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#15803d' }}>{stats.employees}</div>
                        <div style={{ fontSize: '0.875rem', color: '#16a34a' }}>Usuarios Totales</div>
                    </div>
                    <div style={{ padding: '1rem', backgroundColor: '#fff7ed', borderRadius: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#c2410c' }}>{stats.timeEntries}</div>
                        <div style={{ fontSize: '0.875rem', color: '#ea580c' }}>Fichajes</div>
                    </div>
                </div>
            )}

            {/* TAB: COMPANIES */}
            {activeTab === 'companies' && (
                <div style={{ marginTop: '1.5rem' }}>
                    <div className="admin-actions" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="🔍 Buscar empresa..."
                            className="input full-width-on-mobile"
                            style={{ flex: 1 }}
                            value={tenantSearch}
                            onChange={(e) => setTenantSearch(e.target.value)}
                        />
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                                    <th style={{ padding: '0.75rem' }}>Nombre</th>
                                    <th className="hide-on-mobile" style={{ padding: '0.75rem' }}>Razón Social</th>
                                    <th className="hide-on-mobile" style={{ padding: '0.75rem' }}>Empleados</th>
                                    <th className="hide-on-mobile" style={{ padding: '0.75rem' }}>Fecha Registro</th>
                                    <th style={{ padding: '0.75rem' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredTenants.length === 0 && (
                                    <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No se encontraron empresas.</td></tr>
                                )}
                                {filteredTenants.map(t => (
                                    <tr key={t.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '0.75rem' }}><strong>{t.name}</strong></td>
                                        <td className="hide-on-mobile" style={{ padding: '0.75rem' }}>{t.legal_name || '-'}</td>
                                        <td className="hide-on-mobile" style={{ padding: '0.75rem' }}>
                                            <span style={{
                                                padding: '0.25rem 0.5rem',
                                                backgroundColor: '#e0f2fe', color: '#0369a1',
                                                borderRadius: '4px', fontSize: '0.875rem'
                                            }}>
                                                {t.profiles?.[0]?.count || 0}
                                            </span>
                                        </td>
                                        <td className="hide-on-mobile" style={{ padding: '0.75rem', fontSize: '0.875rem', color: '#6b7280' }}>
                                            {format(new Date(t.created_at), 'dd MMM yyyy', { locale: es })}
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                                                    onClick={() => setSelectedTenant(t)}
                                                    title="Gestionar Empresa"
                                                >
                                                    ⚙️
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                                                    onClick={() => { setEditingTenant({ ...t }); setShowEditTenantModal(true); }}
                                                    title="Editar Información"
                                                >
                                                    ✏️
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', backgroundColor: '#f0f9ff', borderColor: '#7dd3fc' }}
                                                    onClick={() => handleResendAdminInvite(t.id)}
                                                    title="Reenviar Invitación Admin"
                                                >
                                                    📧
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem' }}
                                                    onClick={() => handleExportTenant(t)}
                                                    title="Exportar JSON"
                                                >
                                                    💾
                                                </button>
                                                <button
                                                    className="btn btn-secondary"
                                                    style={{ padding: '0.25rem 0.5rem', fontSize: '0.875rem', color: '#b91c1c' }}
                                                    onClick={() => handleDeleteTenant(t)}
                                                    title="Eliminar Empresa"
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
                </div>
            )}

            {/* TAB: USERS (Global Search) */}
            {activeTab === 'users' && (
                <div style={{ marginTop: '1.5rem' }}>
                    <div className="admin-actions" style={{ marginBottom: '1.5rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="🔍 Buscar usuario en todo el sistema..."
                            className="input full-width-on-mobile"
                            style={{ flex: 1 }}
                            value={userSearch}
                            onChange={(e) => {
                                setUserSearch(e.target.value);
                                fetchGlobalUsers(e.target.value);
                            }}
                        />
                        {userSearch && (
                            <button
                                className="btn btn-secondary full-width-on-mobile"
                                onClick={() => { setUserSearch(''); fetchGlobalUsers(''); }}
                            >
                                Limpiar
                            </button>
                        )}
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '600px' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', borderBottom: '2px solid #e5e7eb' }}>
                                    <th style={{ padding: '0.75rem' }}>Usuario</th>
                                    <th className="hide-on-mobile" style={{ padding: '0.75rem' }}>Email</th>
                                    <th style={{ padding: '0.75rem' }}>Empresa</th>
                                    <th className="hide-on-mobile" style={{ padding: '0.75rem' }}>Rol</th>
                                    <th style={{ padding: '0.75rem' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {globalUsers.length === 0 && (
                                    <tr><td colSpan="5" style={{ padding: '2rem', textAlign: 'center', color: '#666' }}>No se encontraron usuarios.</td></tr>
                                )}
                                {globalUsers.map(u => (
                                    <tr key={u.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                        <td style={{ padding: '0.75rem' }}><strong>{u.full_name || 'Sin nombre'}</strong></td>
                                        <td className="hide-on-mobile" style={{ padding: '0.75rem' }}>{u.email}</td>
                                        <td style={{ padding: '0.75rem' }}>
                                            {u.tenants?.name ? (
                                                <span style={{ color: '#4f46e5', fontWeight: '500' }}>🏢 {u.tenants.name}</span>
                                            ) : (
                                                <span style={{ color: '#ef4444' }}>⚠️ Sin empresa</span>
                                            )}
                                        </td>
                                        <td className="hide-on-mobile" style={{ padding: '0.75rem' }}>
                                            <span style={{
                                                padding: '0.25rem 0.5rem',
                                                borderRadius: '4px', fontSize: '0.875rem',
                                                backgroundColor: u.role === 'admin' ? '#fee2e2' : u.role === 'super_admin' ? '#ede9fe' : '#f0f9ff',
                                                color: u.role === 'admin' ? '#991b1b' : u.role === 'super_admin' ? '#5b21b6' : '#0369a1'
                                            }}>
                                                {u.role === 'admin' ? 'Admin' : u.role === 'super_admin' ? 'SuperAdmin' : 'Empleado'}
                                            </span>
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            <button
                                                className="btn btn-secondary"
                                                style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem' }}
                                                onClick={() => {
                                                    const t = tenants.find(ten => ten.id === u.tenant_id);
                                                    if (t) setSelectedTenant(t);
                                                    else alert('Este usuario no tiene empresa vinculada o no tienes acceso.');
                                                }}
                                            >
                                                Ver Empresa
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* TAB: SYSTEM HEALTH */}
            {activeTab === 'system' && (
                <div style={{ marginTop: '1.5rem' }}>
                    {orphanedProfiles.length > 0 ? (
                        <div style={{ padding: '1.5rem', backgroundColor: '#fff7ed', borderRadius: '12px', border: '2px solid #fdba74', marginBottom: '2rem' }}>
                            <h3 style={{ margin: 0, color: '#9a3412' }}>⚠️ Usuarios sin Empresa (Perfiles Incompletos)</h3>
                            <p style={{ color: '#c2410c', fontSize: '0.875rem' }}>Usuarios que han entrado pero no tienen un tenant_id asignado.</p>

                            <div style={{ marginTop: '1rem' }}>
                                {orphanedProfiles.map(u => (
                                    <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem', borderBottom: '1px solid #fed7aa', alignItems: 'center' }}>
                                        <div>
                                            <strong>{u.full_name || 'Sin nombre'}</strong> ({u.email})
                                            <div style={{ fontSize: '0.7rem', color: '#9a3412' }}>ID: {u.id}</div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                            <select
                                                onChange={(e) => handleAssignTenant(u.id, e.target.value)}
                                                style={{ padding: '0.25rem', borderRadius: '4px', fontSize: '0.875rem' }}
                                            >
                                                <option value="">Asignar a...</option>
                                                {tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                            </select>
                                            <button onClick={() => handleDeleteProfile(u.id, u.full_name)} className="btn btn-secondary" style={{ backgroundColor: '#fee2e2', color: '#991b1b', fontSize: '0.75rem' }}>🗑️</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f0fdf4', borderRadius: '12px', border: '2px solid #bbf7d0', color: '#166534' }}>
                            ✅ El sistema no tiene usuarios huérfanos. Todo en orden.
                        </div>
                    )}

                    <div style={{ marginTop: '2rem', padding: '1.5rem', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
                        <h3 style={{ margin: 0 }}>ℹ️ Información del Sistema</h3>
                        <p className="text-muted">Total de datos gestionados en la base de datos global.</p>
                        <ul style={{ paddingLeft: '1.5rem', fontSize: '0.9rem' }}>
                            <li>Empresas activas: {stats.companies}</li>
                            <li>Usuarios registrados: {stats.employees}</li>
                            <li>Registros de jornada: {stats.timeEntries}</li>
                        </ul>
                    </div>
                </div>
            )}

            {/* TAB: MONETIZATION */}
            {activeTab === 'monetization' && (
                <MonetizationPanel />
            )}

            {/* Modals: Same as before but with Edit Modal added */}
            {showNewTenantModal && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 1000,
                    padding: '1rem'
                }}>
                    <div className="card super-admin-modal-card" style={{
                        width: '100%',
                        maxWidth: '500px',
                        padding: '0',
                        borderRadius: '24px',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        animation: 'modalIn 0.3s ease-out'
                    }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                            padding: '1.5rem 2rem',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem'
                        }}>
                            <span style={{ fontSize: '1.5rem' }}>🏢</span>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>Registrar Nueva Empresa</h3>
                        </div>

                        <form onSubmit={handleCreateTenant} style={{ padding: '2rem' }}>
                            <div style={{ display: 'grid', gap: '1.5rem' }}>
                                <section>
                                    <h4 style={{ margin: '0 0 1rem 0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Información de Empresa</h4>
                                    <div style={{ display: 'grid', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem', color: '#1e293b' }}>Nombre Comercial</label>
                                            <input
                                                className="input super-admin-input"
                                                type="text"
                                                required
                                                style={{ width: '100%', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '0.75rem' }}
                                                placeholder="Ej: Mi Empresa S.L."
                                                value={newTenantData.name}
                                                onChange={e => setNewTenantData({ ...newTenantData, name: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem', color: '#1e293b' }}>Razón Social (Opcional)</label>
                                            <input
                                                className="input super-admin-input"
                                                type="text"
                                                style={{ width: '100%', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '0.75rem' }}
                                                placeholder="Ej: Empresa de Servicios S.A."
                                                value={newTenantData.legal_name}
                                                onChange={e => setNewTenantData({ ...newTenantData, legal_name: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </section>

                                <section>
                                    <h4 style={{ margin: '0 0 1rem 0', color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Administrador Inicial</h4>
                                    <div style={{ display: 'grid', gap: '1rem' }}>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem', color: '#1e293b' }}>Nombre del Administrador</label>
                                            <input
                                                className="input super-admin-input"
                                                type="text"
                                                required
                                                style={{ width: '100%', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '0.75rem' }}
                                                placeholder="Nombre completo"
                                                value={newTenantData.admin_name}
                                                onChange={e => setNewTenantData({ ...newTenantData, admin_name: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.25rem', color: '#1e293b' }}>Email de Invitación</label>
                                            <input
                                                className="input super-admin-input"
                                                type="email"
                                                required
                                                style={{ width: '100%', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '0.75rem' }}
                                                placeholder="admin@empresa.com"
                                                value={newTenantData.admin_email}
                                                onChange={e => setNewTenantData({ ...newTenantData, admin_email: e.target.value })}
                                            />
                                        </div>
                                    </div>
                                </section>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
                                <button type="submit" className="btn btn-primary" style={{
                                    flex: 1,
                                    borderRadius: '12px',
                                    padding: '0.75rem',
                                    fontWeight: '600',
                                    background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)',
                                    boxShadow: '0 4px 6px -1px rgba(79, 70, 229, 0.4)'
                                }}>Crear Empresa</button>
                                <button type="button" onClick={() => setShowNewTenantModal(false)} className="btn btn-secondary" style={{
                                    flex: 1,
                                    borderRadius: '12px',
                                    padding: '0.75rem',
                                    fontWeight: '600',
                                    backgroundColor: '#f1f5f9',
                                    color: '#475569',
                                    border: '1px solid #e2e8f0'
                                }}>Cancelar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {showEditTenantModal && editingTenant && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(8px)',
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    zIndex: 1000,
                    padding: '1rem'
                }}>
                    <div className="card super-admin-modal-card" style={{
                        width: '100%',
                        maxWidth: '500px',
                        padding: '0',
                        borderRadius: '24px',
                        overflow: 'hidden',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        border: '1px solid rgba(255, 255, 255, 0.1)',
                        animation: 'modalIn 0.3s ease-out'
                    }}>
                        <div style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            padding: '1.5rem 2rem',
                            color: 'white',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem'
                        }}>
                            <span style={{ fontSize: '1.5rem' }}>✏️</span>
                            <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: '700' }}>Editar Información de Empresa</h3>
                        </div>

                        <form onSubmit={handleUpdateTenant} style={{ padding: '2rem' }}>
                            <div style={{ display: 'grid', gap: '1.5rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.4rem', color: '#1e293b' }}>Nombre Comercial</label>
                                    <input
                                        className="input"
                                        type="text"
                                        required
                                        style={{ width: '100%', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '0.75rem' }}
                                        value={editingTenant.name}
                                        onChange={e => setEditingTenant({ ...editingTenant, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.4rem', color: '#1e293b' }}>Razón Social</label>
                                    <input
                                        className="input"
                                        type="text"
                                        style={{ width: '100%', borderRadius: '12px', border: '1px solid #e2e8f0', padding: '0.75rem' }}
                                        value={editingTenant.legal_name || ''}
                                        onChange={e => setEditingTenant({ ...editingTenant, legal_name: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '1rem', marginTop: '2.5rem' }}>
                                <button type="submit" className="btn btn-primary" style={{
                                    flex: 1,
                                    borderRadius: '12px',
                                    padding: '0.75rem',
                                    fontWeight: '600',
                                    background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                                    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.4)'
                                }} disabled={loading}>{loading ? 'Guardando...' : 'Guardar Cambios'}</button>
                                <button type="button" onClick={() => setShowEditTenantModal(false)} className="btn btn-secondary" style={{
                                    flex: 1,
                                    borderRadius: '12px',
                                    padding: '0.75rem',
                                    fontWeight: '600',
                                    backgroundColor: '#f1f5f9',
                                    color: '#475569',
                                    border: '1px solid #e2e8f0'
                                }}>Cancelar</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    )
}
