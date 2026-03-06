import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

export function MonetizationPanel() {
    const [view, setView] = useState('clients'); // 'clients' | 'plans' | 'mrr'
    const [tenants, setTenants] = useState([]);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [selectedTenant, setSelectedTenant] = useState(null);
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);
    const [mrrData, setMrrData] = useState({ total: 0, arr: 0, pending: 0 });

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const { data: plansData } = await supabase.from('subscription_plans').select('*');
            setPlans(plansData || []);

            const { data: tenantsData } = await supabase
                .from('tenants')
                .select('*, subscription_plans(name, price_monthly)');
            setTenants(tenantsData || []);

            // Calculate MRR
            const total = (tenantsData || [])
                .filter(t => t.subscription_status === 'active')
                .reduce((acc, curr) => acc + (curr.total_mrr || 0), 0);

            setMrrData({
                total,
                arr: total * 12,
                pending: (tenantsData || []).filter(t => t.subscription_status === 'expired').length * 45 // Dummy estimation
            });

        } catch (error) {
            console.error('Error fetching monetization data:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateStatus = async (tenantId, newStatus) => {
        const { error } = await supabase
            .from('tenants')
            .update({ subscription_status: newStatus })
            .eq('id', tenantId);

        if (!error) {
            // NOTIFICAR SI SE SUSPENDE
            if (newStatus === 'suspended') {
                const { data: admins } = await supabase
                    .from('profiles')
                    .select('id, email, full_name')
                    .eq('tenant_id', tenantId)
                    .eq('role', 'admin');

                if (admins && admins.length > 0) {
                    const notices = admins.map(admin => ({
                        user_id: admin.id,
                        tenant_id: tenantId,
                        type: 'license_suspended',
                        title: '🚫 LICENCIA SUSPENDIDA',
                        message: 'El acceso a AppFichar de su empresa ha sido suspendido. Por favor, contacte con soporte o revise sus facturas pendientes.'
                    }));
                    await supabase.from('notifications').insert(notices);

                    // ENVIAR EMAIL RESEND
                    const { error: funcError } = await supabase.functions.invoke('send-monetization-email', {
                        body: {
                            type: 'license_suspended',
                            subject: '⚠️ IMPORTANTE: Acceso a AppFichar Suspendido',
                            to: admins.map(a => a.email),
                        }
                    });
                    if (funcError) console.error('Error enviando email suspension:', funcError);
                }
            }

            fetchData();
            if (selectedTenant?.id === tenantId) {
                setSelectedTenant({ ...selectedTenant, subscription_status: newStatus });
            }
        }
    };

    const handleSendPaymentNotice = async (tenant) => {
        setLoading(true);
        try {
            const { data: admins, error: adminsError } = await supabase
                .from('profiles')
                .select('id, full_name, email')
                .eq('tenant_id', tenant.id)
                .in('role', ['admin', 'manager']); // Ampliamos a managers también

            if (adminsError) {
                console.error('Error buscando admins:', adminsError);
                alert('Error al buscar administradores: ' + adminsError.message);
                return;
            }

            if (!admins || admins.length === 0) {
                alert('No se encontraron administradores o managers para esta empresa.');
                return;
            }

            const activeAdmins = admins.filter(a => a.email);
            if (activeAdmins.length === 0) {
                alert('Los administradores encontrados no tienen un email configurado.');
                return;
            }

            const notices = activeAdmins.map(admin => ({
                user_id: admin.id,
                tenant_id: tenant.id,
                type: 'billing_notice',
                title: '📧 AVISO DE PAGO PENDIENTE',
                message: `Estimado/a ${admin.full_name}, le recordamos que tiene un recibo pendiente por su suscripción a AppFichar. Por favor, regularice su situación para evitar cortes de servicio.`
            }));

            const { error: insertError } = await supabase.from('notifications').insert(notices);
            if (insertError) {
                console.error('Error insertando notificaciones:', insertError);
                alert('Error al crear notificación en la app: ' + insertError.message + '\n¿Has ejecutado el script SQL de tipos de notificación?');
                return;
            }

            // ENVIAR EMAIL RESEND
            const { data: funcData, error: funcError } = await supabase.functions.invoke('send-monetization-email', {
                body: {
                    type: 'billing_notice',
                    subject: '🧾 Aviso de Pago Pendiente - AppFichar',
                    to: activeAdmins.map(a => a.email),
                }
            });

            if (funcError) {
                console.error('Error completo en Edge Function:', funcError);

                let detailedError = funcError.message;

                // Intentar extraer el mensaje de error del cuerpo de la respuesta
                if (funcError.context && funcError.context.res) {
                    try {
                        const resClone = funcError.context.res.clone();
                        const contentType = resClone.headers.get('content-type');

                        if (contentType && contentType.includes('application/json')) {
                            const errorData = await resClone.json();
                            detailedError = errorData.error || errorData.message || JSON.stringify(errorData);
                        } else {
                            detailedError = await resClone.text() || detailedError;
                        }
                    } catch (e) {
                        console.error('Error al intentar leer el cuerpo del error:', e);
                    }
                }

                alert(`⚠️ FALLO EN ENVÍO DE EMAIL (Status: ${funcError.status || '???'})\n\nMotivo: ${detailedError}\n\nRevisa los 'Logs' en el Dashboard de Supabase para ver el error completo.`);
            } else {
                alert(`✅ Aviso enviado con éxito!\n\nSe ha creado la notificación en la App y se ha enviado el email a ${activeAdmins.length} destinatario(s).`);
            }
        } catch (error) {
            console.error('Error enviando aviso:', error);
            alert('Error al enviar el aviso: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePlanChange = async (tenantId, planId) => {
        setLoading(true);
        try {
            const { error } = await supabase
                .from('tenants')
                .update({ plan_id: planId })
                .eq('id', tenantId);

            if (error) throw error;

            // Notify about plan change
            const { data: admins } = await supabase
                .from('profiles')
                .select('id, email, full_name')
                .eq('tenant_id', tenantId)
                .in('role', ['admin', 'manager']);

            if (admins && admins.length > 0) {
                const planName = plans.find(p => p.id === planId)?.name || 'Nuevo Plan';
                const notices = admins.map(admin => ({
                    user_id: admin.id,
                    tenant_id: tenantId,
                    type: 'plan_change',
                    title: '✨ PLAN ACTUALIZADO',
                    message: `Su empresa ha sido actualizada al plan ${planName}. Ya puede disfrutar de las nuevas ventajas.`
                }));
                await supabase.from('notifications').insert(notices);

                const activeAdmins = admins.filter(a => a.email);
                if (activeAdmins.length > 0) {
                    await supabase.functions.invoke('send-monetization-email', {
                        body: {
                            type: 'plan_change',
                            subject: `✨ AppFichar: Su plan ha sido actualizado a ${planName}`,
                            to: activeAdmins.map(a => a.email),
                        }
                    });
                }
            }

            fetchData();
            alert('✅ Plan actualizado y notificaciones enviadas.');
        } catch (error) {
            console.error('Error cambiando plan:', error);
            alert('Error al cambiar plan: ' + error.message);
        } finally {
            setLoading(false);
        }
    };

    const generateInvoicePDF = (tenant) => {
        const doc = new jsPDF();
        const date = new Date();
        const invoiceNum = `INV-${date.getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

        // Header
        doc.setFontSize(20);
        doc.setTextColor(79, 70, 229);
        doc.text('FACTURA', 105, 20, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.text(`Nº Factura: ${invoiceNum}`, 140, 40);
        doc.text(`Fecha: ${format(date, 'dd/MM/yyyy')}`, 140, 45);

        // Company Details
        doc.setFontSize(12);
        doc.text('Emisor:', 20, 40);
        doc.setFontSize(10);
        doc.text('AppFichar SaaS S.L.', 20, 45);
        doc.text('CIF: B12345678', 20, 50);
        doc.text('Calle Innovación 42, Madrid', 20, 55);

        // Client Details
        doc.setFontSize(12);
        doc.text('Cliente:', 20, 70);
        doc.setFontSize(10);
        doc.text(tenant.legal_name || tenant.name, 20, 75);
        doc.text(`CIF: ${tenant.cif || '---'}`, 20, 80);
        doc.text(tenant.address || '---', 20, 85);

        // Table
        const price = tenant.subscription_plans?.price_monthly || 0;
        const iva = price * 0.21;
        const total = price + iva;

        doc.autoTable({
            startY: 100,
            head: [['Concepto', 'Base Imponible', 'IVA (21%)', 'Total']],
            body: [
                [`Suscripción Mensual - Plan ${tenant.subscription_plans?.name || 'Starter'}`, `${price.toFixed(2)}€`, `${iva.toFixed(2)}€`, `${total.toFixed(2)}€`]
            ],
            theme: 'striped',
            headStyles: { fillColor: [79, 70, 229] }
        });

        const finalY = doc.lastAutoTable.finalY + 10;
        doc.setFontSize(14);
        doc.text(`TOTAL A PAGAR: ${total.toFixed(2)}€`, 140, finalY + 10);

        doc.save(`${invoiceNum}_${tenant.name}.pdf`);
    };

    const StatusBadge = ({ status }) => {
        const colors = {
            active: { bg: '#dcfce7', text: '#166534', label: 'Activo' },
            expired: { bg: '#fee2e2', text: '#991b1b', label: 'Vencido' },
            trial: { bg: '#fef9c3', text: '#854d0e', label: 'Prueba' },
            suspended: { bg: '#f1f5f9', text: '#475569', label: 'Suspendido' }
        };
        const config = colors[status] || colors.suspended;
        return (
            <span style={{
                backgroundColor: config.bg,
                color: config.text,
                padding: '2px 8px',
                borderRadius: '999px',
                fontSize: '0.75rem',
                fontWeight: '600',
                textTransform: 'uppercase'
            }}>{config.label}</span>
        );
    };

    if (loading) return <div>Cargando panel de monetización...</div>;

    return (
        <div style={{ padding: '1rem', animation: 'fadeIn 0.3s ease-out' }}>
            {/* Headers / Tabs */}
            <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid #e2e8f0', marginBottom: '2rem' }}>
                <button onClick={() => setView('clients')} style={{ padding: '0.75rem 1.5rem', border: 'none', background: 'none', cursor: 'pointer', borderBottom: view === 'clients' ? '3px solid #6366f1' : '3px solid transparent', fontWeight: view === 'clients' ? '700' : '500', color: view === 'clients' ? '#4f46e5' : '#64748b' }}>👥 Clientes</button>
                <button onClick={() => setView('plans')} style={{ padding: '0.75rem 1.5rem', border: 'none', background: 'none', cursor: 'pointer', borderBottom: view === 'plans' ? '3px solid #6366f1' : '3px solid transparent', fontWeight: view === 'plans' ? '700' : '500', color: view === 'plans' ? '#4f46e5' : '#64748b' }}>💎 Planes</button>
                <button onClick={() => setView('mrr')} style={{ padding: '0.75rem 1.5rem', border: 'none', background: 'none', cursor: 'pointer', borderBottom: view === 'mrr' ? '3px solid #6366f1' : '3px solid transparent', fontWeight: view === 'mrr' ? '700' : '500', color: view === 'mrr' ? '#4f46e5' : '#64748b' }}>📊 Resumen MRR</button>
            </div>

            {/* View: CLIENTS */}
            {view === 'clients' && (
                <div>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                        <input
                            type="text"
                            placeholder="Buscar por nombre o CIF..."
                            className="input"
                            style={{ flex: '1 1 300px' }}
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                        />
                        <select className="input" style={{ flex: '1 1 200px' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                            <option value="all">Todos los estados</option>
                            <option value="active">Activos</option>
                            <option value="trial">En Prueba</option>
                            <option value="expired">Vencidos</option>
                            <option value="suspended">Suspendidos</option>
                        </select>
                    </div>

                    <div className="card" style={{ padding: 0, overflowX: 'auto', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                <tr>
                                    <th style={{ padding: '1rem', textAlign: 'left' }}>Cliente</th>
                                    <th className="hide-mobile" style={{ padding: '1rem', textAlign: 'left' }}>Plan</th>
                                    <th style={{ padding: '1rem', textAlign: 'left' }}>Estado</th>
                                    <th className="hide-mobile" style={{ padding: '1rem', textAlign: 'left' }}>Vto. Cobro</th>
                                    <th style={{ padding: '1rem', textAlign: 'left' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {tenants
                                    .filter(t => (statusFilter === 'all' || t.subscription_status === statusFilter))
                                    .filter(t => t.name.toLowerCase().includes(search.toLowerCase()) || (t.cif && t.cif.includes(search)))
                                    .map(t => (
                                        <tr key={t.id} onClick={() => setSelectedTenant(t)} style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer', transition: 'background 0.2s' }}>
                                            <td style={{ padding: '1rem' }}>
                                                <div style={{ fontWeight: '600', color: '#1e293b' }}>{t.name}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{t.cif || 'Sin CIF'}</div>
                                            </td>
                                            <td className="hide-mobile" style={{ padding: '1rem' }}>{t.subscription_plans?.name || 'Starter'}</td>
                                            <td style={{ padding: '1rem' }}><StatusBadge status={t.subscription_status} /></td>
                                            <td className="hide-mobile" style={{ padding: '1rem' }}>{t.next_billing_date ? format(new Date(t.next_billing_date), 'dd MMM yyyy', { locale: es }) : '---'}</td>
                                            <td style={{ padding: '1rem' }}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); generateInvoicePDF(t); }}
                                                    className="btn btn-secondary"
                                                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.8rem', whiteSpace: 'nowrap' }}
                                                >🧾 Facturar</button>
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* View: PLANS */}
            {view === 'plans' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
                    {plans.map(plan => (
                        <div key={plan.id} className="card" style={{ border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column' }}>
                            <h3 style={{ margin: 0, color: '#1e293b' }}>{plan.name}</h3>
                            <div style={{ fontSize: '2rem', fontWeight: '800', margin: '1rem 0', color: '#4f46e5' }}>{plan.price_monthly}€<span style={{ fontSize: '0.875rem', color: '#64748b' }}>/mes</span></div>
                            <div style={{ flex: 1 }}>
                                <ul style={{ paddingLeft: '1.25rem', color: '#475569', fontSize: '0.875rem' }}>
                                    <li>Hasta {plan.max_employees || '∞'} empleados</li>
                                    {Object.entries(plan.features || {}).map(([key, val]) => (
                                        <li key={key}>{key}: {val.toString()}</li>
                                    ))}
                                </ul>
                            </div>
                            <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '8px' }}>
                                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#94a3b8' }}>Métricas del Plan</div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                                    <span>Clientes:</span>
                                    <strong>{tenants.filter(t => t.plan_id === plan.id).length}</strong>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>MRR Plan:</span>
                                    <strong>{tenants.filter(t => t.plan_id === plan.id).reduce((acc, curr) => acc + (curr.total_mrr || 0), 0)}€</strong>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* View: MRR */}
            {view === 'mrr' && (
                <div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
                        <div className="card" style={{ background: 'linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)', color: 'white' }}>
                            <div style={{ fontSize: '0.875rem', opacity: 0.8 }}>MRR (Cifra Mensual)</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '800' }}>{mrrData.total.toLocaleString()}€</div>
                        </div>
                        <div className="card">
                            <div style={{ fontSize: '0.875rem', color: '#64748b' }}>ARR (Anual Proyectado)</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#334155' }}>{mrrData.arr.toLocaleString()}€</div>
                        </div>
                        <div className="card">
                            <div style={{ fontSize: '0.875rem', color: '#e11d48' }}>Pendiente de Cobro</div>
                            <div style={{ fontSize: '2.5rem', fontWeight: '800', color: '#e11d48' }}>{mrrData.pending.toLocaleString()}€</div>
                        </div>
                    </div>

                    <div className="card">
                        <h3>Distribución de Ingresos</h3>
                        <div style={{ height: '10px', width: '100%', backgroundColor: '#f1f5f9', borderRadius: '5px', overflow: 'hidden', display: 'flex', margin: '1rem 0' }}>
                            {plans.map((p, i) => {
                                const total = tenants.filter(t => t.plan_id === p.id).reduce((acc, curr) => acc + (curr.total_mrr || 0), 0);
                                const pct = mrrData.total > 0 ? (total / mrrData.total) * 100 : 0;
                                const colors = ['#6366f1', '#10b981', '#f59e0b'];
                                return <div key={p.id} style={{ width: `${pct}%`, backgroundColor: colors[i % colors.length] }} title={`${p.name}: ${pct.toFixed(1)}%`}></div>
                            })}
                        </div>
                        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                            {plans.map((p, i) => {
                                const total = tenants.filter(t => t.plan_id === p.id).reduce((acc, curr) => acc + (curr.total_mrr || 0), 0);
                                const colors = ['#6366f1', '#10b981', '#f59e0b'];
                                return (
                                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: colors[i % colors.length] }}></div>
                                        <span style={{ fontSize: '0.875rem' }}>{p.name}: <strong>{total}€</strong></span>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* DETAILS MODAL (Responsive) */}
            {selectedTenant && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(4px)',
                    zIndex: 2000, display: 'flex', justifyContent: 'flex-end',
                    animation: 'fadeIn 0.2s ease-out'
                }} onClick={() => setSelectedTenant(null)}>
                    <div style={{
                        width: '100%', maxWidth: '450px', backgroundColor: 'white',
                        height: '100%', display: 'flex', flexDirection: 'column',
                        boxShadow: '-10px 0 25px rgba(0,0,0,0.1)',
                        animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
                    }} onClick={e => e.stopPropagation()}>
                        <div style={{ padding: '2rem', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#0f172a' }}>Detalle del Cliente</h2>
                            <button onClick={() => setSelectedTenant(null)} className="btn btn-secondary" style={{ borderRadius: '50%', width: '36px', height: '36px', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '2rem' }}>
                            <section style={{ marginBottom: '2.5rem' }}>
                                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Información Corporativa</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.25rem' }}>{selectedTenant.name}</div>
                                <div style={{ color: '#64748b', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                    <span>CIF: {selectedTenant.cif || '---'}</span>
                                    <span style={{ color: '#cbd5e1' }}>|</span>
                                    <span>{selectedTenant.legal_name || 'Sin nombre legal'}</span>
                                </div>
                                <div style={{ color: '#64748b', marginTop: '0.5rem', fontSize: '0.875rem' }}>📍 {selectedTenant.address || 'Sin dirección registrada'}</div>
                            </section>

                            <section style={{ marginBottom: '2.5rem', padding: '1.5rem', backgroundColor: '#f8fafc', borderRadius: '16px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '1.25rem' }}>Estado de Suscripción</div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                    <span style={{ color: '#475569' }}>Estado Actual:</span>
                                    <StatusBadge status={selectedTenant.subscription_status} />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                                    <span style={{ color: '#475569' }}>Plan Contratado:</span>
                                    <select
                                        className="input"
                                        style={{ width: 'auto', padding: '4px 12px', fontSize: '0.875rem', borderRadius: '8px' }}
                                        value={selectedTenant.plan_id}
                                        onChange={(e) => handlePlanChange(selectedTenant.id, e.target.value)}
                                    >
                                        {plans.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                                    </select>
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ color: '#475569' }}>Próxima Factura:</span>
                                    <strong style={{ color: '#1e293b' }}>{selectedTenant.next_billing_date ? format(new Date(selectedTenant.next_billing_date), 'dd/MM/yyyy') : '---'}</strong>
                                </div>
                            </section>

                            <section>
                                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: '#64748b', fontWeight: '700', letterSpacing: '0.05em', marginBottom: '1.25rem' }}>Acciones Administrativas</div>
                                <div style={{ display: 'grid', gap: '1rem' }}>
                                    {selectedTenant.subscription_status === 'suspended' ? (
                                        <button onClick={() => handleUpdateStatus(selectedTenant.id, 'active')} className="btn btn-primary" style={{ backgroundColor: '#10b981', padding: '0.75rem' }}>✅ Reactivar Licencia</button>
                                    ) : (
                                        <button onClick={() => handleUpdateStatus(selectedTenant.id, 'suspended')} className="btn btn-secondary" style={{ backgroundColor: '#fff1f2', color: '#e11d48', borderColor: '#fecdd3', padding: '0.75rem' }}>🚫 Suspender Acceso</button>
                                    )}

                                    <button
                                        onClick={() => handleSendPaymentNotice(selectedTenant)}
                                        className="btn btn-primary"
                                        style={{ backgroundColor: '#4f46e5', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                        disabled={loading}
                                    >
                                        {loading ? 'Enviando...' : (
                                            <><span>📧</span> Enviar Aviso de Pago</>
                                        )}
                                    </button>

                                    <button
                                        onClick={() => generateInvoicePDF(selectedTenant)}
                                        className="btn btn-secondary"
                                        style={{ padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                                    >
                                        <span>🧾</span> Generar Factura PDF
                                    </button>
                                </div>
                            </section>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                @keyframes slideInRight {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @media (max-width: 768px) {
                    .hide-mobile { display: none; }
                    .modal-content { max-width: 100% !important; border-radius: 20px 20px 0 0 !important; }
                    h1 { font-size: 1.5rem; }
                }
            `}</style>
        </div>
    );
}
