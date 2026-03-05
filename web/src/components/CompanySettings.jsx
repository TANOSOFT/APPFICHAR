import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fetchSpanishHolidays } from '../lib/holidayService'

export function CompanySettings({ profile, onComplete }) {
    const [loading, setLoading] = useState(false)
    const [saving, setSaving] = useState(false)
    const [tenant, setTenant] = useState(null)
    const [branding, setBranding] = useState(null)

    // Form state
    const [legalName, setLegalName] = useState('')
    const [cif, setCif] = useState('')
    const [address, setAddress] = useState('')
    const [city, setCity] = useState('')
    const [province, setProvince] = useState('')
    const [postalCode, setPostalCode] = useState('')
    const [primaryColor, setPrimaryColor] = useState('#3b82f6')
    const [secondaryColor, setSecondaryColor] = useState('#10b981')
    const [logo, setLogo] = useState(null)
    const [logoPreview, setLogoPreview] = useState(null)
    const [holidays, setHolidays] = useState([])
    const [newHolidayDate, setNewHolidayDate] = useState('')
    const [newHolidayName, setNewHolidayName] = useState('')

    useEffect(() => {
        if (profile?.tenant_id) {
            fetchTenantData()
            fetchHolidays()
        }
    }, [profile])

    const fetchHolidays = async () => {
        try {
            const { data, error } = await supabase
                .from('company_holidays')
                .select('*')
                .eq('tenant_id', profile.tenant_id)
                .order('date', { ascending: true })

            if (error) throw error
            setHolidays(data || [])
        } catch (err) {
            console.error('Error fetching holidays:', err)
        }
    }

    const fetchTenantData = async () => {
        try {
            setLoading(true)

            // Fetch tenant info
            const { data: tenantData, error: tenantError } = await supabase
                .from('tenants')
                .select('*')
                .eq('id', profile.tenant_id)
                .single()

            if (tenantError) throw tenantError

            setTenant(tenantData)
            setLegalName(tenantData.legal_name || '')
            setCif(tenantData.cif || '')
            setAddress(tenantData.address || '')
            setCity(tenantData.city || '')
            setProvince(tenantData.province || '')
            setPostalCode(tenantData.postal_code || '')

            // Fetch branding info
            const { data: brandingData, error: brandingError } = await supabase
                .from('tenant_branding')
                .select('*')
                .eq('tenant_id', profile.tenant_id)
                .maybeSingle()

            if (brandingError && brandingError.code !== 'PGRST116') {
                throw brandingError
            }

            if (brandingData) {
                setBranding(brandingData)
                setPrimaryColor(brandingData.primary_color || '#3b82f6')
                setSecondaryColor(brandingData.secondary_color || '#10b981')
                setLogoPreview(brandingData.logo_path)
            }

        } catch (err) {
            console.error('Error fetching tenant data:', err)
            alert('Error al cargar datos de la empresa: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleLogoChange = (e) => {
        const file = e.target.files[0]
        if (file) {
            if (file.size > 2 * 1024 * 1024) { // 2MB limit
                alert('El logo debe ser menor a 2MB')
                return
            }
            setLogo(file)
            setLogoPreview(URL.createObjectURL(file))
        }
    }

    const uploadLogo = async () => {
        if (!logo) return null

        const fileExt = logo.name.split('.').pop()
        const fileName = `${profile.tenant_id}-${Date.now()}.${fileExt}`
        const filePath = `logos/${fileName}`

        const { error: uploadError } = await supabase.storage
            .from('company-assets')
            .upload(filePath, logo)

        if (uploadError) throw uploadError

        // Get public URL
        const { data } = supabase.storage
            .from('company-assets')
            .getPublicUrl(filePath)

        return data.publicUrl
    }

    const handleAddHoliday = async () => {
        if (!newHolidayDate || !newHolidayName) {
            alert('Por favor, indica la fecha y el nombre del festivo')
            return
        }

        try {
            const { error } = await supabase
                .from('company_holidays')
                .insert([{
                    tenant_id: profile.tenant_id,
                    date: newHolidayDate,
                    name: newHolidayName
                }])

            if (error) {
                if (error.code === '23505') alert('Ya existe un festivo en esa fecha')
                else throw error
            }

            setNewHolidayDate('')
            setNewHolidayName('')
            fetchHolidays()
        } catch (err) {
            console.error('Error adding holiday:', err)
            alert('Error al añadir festivo: ' + err.message)
        }
    }

    const handleAutoLoadHolidays = async () => {
        try {
            if (!province) {
                alert('Por favor, indica primero la provincia de la empresa en el campo superior.')
                return
            }

            const year = new Date().getFullYear()
            const confirmYear = prompt(`Se cargarán los festivos para ${province} en el año ${year}. ¿Es correcto? (Indica otro año si prefieres):`, year)
            if (!confirmYear) return

            setLoading(true)
            const fetched = await fetchSpanishHolidays(confirmYear, province)

            if (fetched.length === 0) {
                alert('No se encontraron festivos para esa provincia/año.')
                return
            }

            const existingDates = new Set(holidays.map(h => h.date))
            const newHolidays = fetched.filter(f => !existingDates.has(f.date))

            if (newHolidays.length === 0) {
                alert('Los festivos oficiales ya están en la lista.')
                return
            }

            const payload = newHolidays.map(h => ({
                tenant_id: profile.tenant_id,
                date: h.date,
                name: h.name
            }))

            const { error: iError } = await supabase
                .from('company_holidays')
                .insert(payload)

            if (iError) throw iError

            alert(`✅ Se han cargado ${newHolidays.length} festivos oficiales (Nacionales y de ${province}).`)
            fetchHolidays()
        } catch (err) {
            console.error('Error auto-loading holidays:', err)
            alert('Error: ' + err.message)
        } finally {
            setLoading(false)
        }
    }

    const handleDeleteHoliday = async (id) => {
        if (!confirm('¿Estás seguro de eliminar este festivo?')) return

        try {
            const { error } = await supabase
                .from('company_holidays')
                .delete()
                .eq('id', id)

            if (error) throw error
            fetchHolidays()
        } catch (err) {
            console.error('Error deleting holiday:', err)
            alert('Error al eliminar festivo: ' + err.message)
        }
    }

    const handleSave = async () => {
        try {
            setSaving(true)

            // Upload logo if changed
            let logoUrl = logoPreview
            if (logo) {
                logoUrl = await uploadLogo()
            }

            // Update tenant info
            const { error: tenantError } = await supabase
                .from('tenants')
                .update({
                    legal_name: legalName,
                    cif: cif,
                    address: address,
                    city: city,
                    province: province,
                    postal_code: postalCode
                })
                .eq('id', profile.tenant_id)

            if (tenantError) throw tenantError

            // Upsert branding
            const { error: brandingError } = await supabase
                .from('tenant_branding')
                .upsert({
                    tenant_id: profile.tenant_id,
                    logo_path: logoUrl,
                    primary_color: primaryColor,
                    secondary_color: secondaryColor,
                    updated_at: new Date().toISOString()
                })

            if (brandingError) throw brandingError

            alert('✅ Configuración guardada correctamente')
            if (onComplete) onComplete()
            fetchTenantData() // Refresh data

        } catch (err) {
            console.error('Error saving:', err)
            alert('Error al guardar: ' + err.message)
        } finally {
            setSaving(false)
        }
    }

    if (loading) {
        return <div className="card">Cargando configuración...</div>
    }

    return (
        <div style={{ marginTop: '2rem' }}>
            <h3>⚙️ Configuración de Empresa</h3>
            <p className="text-muted">Personaliza la información y branding de tu empresa</p>

            {/* Logo Upload */}
            <div style={{ marginTop: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    Logo de la Empresa
                </label>
                {logoPreview && (
                    <div style={{ marginBottom: '1rem' }}>
                        <img
                            src={logoPreview}
                            alt="Logo"
                            style={{ maxWidth: '200px', maxHeight: '100px', objectFit: 'contain' }}
                        />
                    </div>
                )}
                <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoChange}
                    style={{
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        width: '100%'
                    }}
                />
                <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                    Formatos: JPG, PNG, SVG. Tamaño máximo: 2MB
                </p>
            </div>

            {/* Legal Information */}
            <div style={{ marginTop: '1.5rem' }}>
                <h4>Información Legal</h4>

                <label style={{ display: 'block', marginTop: '1rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    Razón Social
                </label>
                <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="Ej: EMPRESA SL"
                    style={{
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        width: '100%',
                        fontSize: '1rem'
                    }}
                />

                <label style={{ display: 'block', marginTop: '1rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    NIF/CIF
                </label>
                <input
                    type="text"
                    value={cif}
                    onChange={(e) => setCif(e.target.value)}
                    placeholder="Ej: B12345678"
                    style={{
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        width: '100%',
                        fontSize: '1rem'
                    }}
                />

                <label style={{ display: 'block', marginTop: '1rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    Dirección
                </label>
                <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ej: Calle Mayor 123"
                    style={{
                        padding: '0.5rem',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        width: '100%',
                        fontSize: '1rem'
                    }}
                />

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Ciudad
                        </label>
                        <input
                            type="text"
                            value={city}
                            onChange={(e) => setCity(e.target.value)}
                            placeholder="Madrid"
                            style={{
                                padding: '0.5rem',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                width: '100%',
                                fontSize: '1rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Provincia
                        </label>
                        <input
                            type="text"
                            value={province}
                            onChange={(e) => setProvince(e.target.value)}
                            placeholder="Madrid"
                            style={{
                                padding: '0.5rem',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                width: '100%',
                                fontSize: '1rem'
                            }}
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Código Postal
                        </label>
                        <input
                            type="text"
                            value={postalCode}
                            onChange={(e) => setPostalCode(e.target.value)}
                            placeholder="28001"
                            style={{
                                padding: '0.5rem',
                                borderRadius: '4px',
                                border: '1px solid var(--border-color)',
                                width: '100%',
                                fontSize: '1rem'
                            }}
                        />
                    </div>
                </div>
            </div>

            {/* Festive Days Management */}
            <div style={{ marginTop: '2rem', padding: '1rem', border: '1px solid var(--border-color)', borderRadius: '8px', backgroundColor: '#f9fafb' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                    <h4>📅 Gestión de Festivos</h4>
                    <button
                        onClick={handleAutoLoadHolidays}
                        className="btn btn-secondary"
                        style={{ backgroundColor: '#4f46e5', color: 'white', fontSize: '0.8rem', padding: '0.4rem 0.8rem' }}
                    >
                        ⚡ Cargar Festivos Oficiales
                    </button>
                </div>
                <p className="text-muted" style={{ marginTop: '0.5rem' }}>Añade los días que serán marcados como fiesta en el calendario laboral.</p>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                    <input
                        type="date"
                        value={newHolidayDate}
                        onChange={(e) => setNewHolidayDate(e.target.value)}
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', flex: 1 }}
                    />
                    <input
                        type="text"
                        value={newHolidayName}
                        onChange={(e) => setNewHolidayName(e.target.value)}
                        placeholder="Nombre (ej: Navidad)"
                        style={{ padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border-color)', flex: 2 }}
                    />
                    <button
                        onClick={handleAddHoliday}
                        className="btn btn-secondary"
                        style={{ whiteSpace: 'nowrap' }}
                    >
                        ➕ Añadir
                    </button>
                </div>

                <div style={{ marginTop: '1rem', maxHeight: '200px', overflowY: 'auto' }}>
                    {holidays.length === 0 ? (
                        <p style={{ textAlign: 'center', color: '#666', fontSize: '0.875rem' }}>No hay festivos configurados.</p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid #ccc' }}>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Fecha</th>
                                    <th style={{ textAlign: 'left', padding: '0.5rem' }}>Nombre</th>
                                    <th style={{ width: '50px' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {holidays.map(h => (
                                    <tr key={h.id} style={{ borderBottom: '1px solid #eee' }}>
                                        <td style={{ padding: '0.5rem' }}>{new Date(h.date).toLocaleDateString()}</td>
                                        <td style={{ padding: '0.5rem' }}>{h.name}</td>
                                        <td style={{ padding: '0.5rem', textAlign: 'center' }}>
                                            <button
                                                onClick={() => handleDeleteHoliday(h.id)}
                                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}
                                                title="Eliminar"
                                            >
                                                🗑️
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Colors */}
            <div style={{ marginTop: '1.5rem' }}>
                <h4>Colores Corporativos</h4>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Color Primario
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                                type="color"
                                value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                style={{ width: '60px', height: '40px', border: 'none', borderRadius: '4px' }}
                            />
                            <input
                                type="text"
                                value={primaryColor}
                                onChange={(e) => setPrimaryColor(e.target.value)}
                                style={{
                                    padding: '0.5rem',
                                    borderRadius: '4px',
                                    border: '1px solid var(--border-color)',
                                    flex: 1,
                                    fontSize: '1rem'
                                }}
                            />
                        </div>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                            Color Secundario
                        </label>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                                type="color"
                                value={secondaryColor}
                                onChange={(e) => setSecondaryColor(e.target.value)}
                                style={{ width: '60px', height: '40px', border: 'none', borderRadius: '4px' }}
                            />
                            <input
                                type="text"
                                value={secondaryColor}
                                onChange={(e) => setSecondaryColor(e.target.value)}
                                style={{
                                    padding: '0.5rem',
                                    borderRadius: '4px',
                                    border: '1px solid var(--border-color)',
                                    flex: 1,
                                    fontSize: '1rem'
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <button
                onClick={handleSave}
                disabled={saving}
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '2rem' }}
            >
                {saving ? 'Guardando...' : '💾 Guardar Configuración'}
            </button>
        </div>
    )
}
