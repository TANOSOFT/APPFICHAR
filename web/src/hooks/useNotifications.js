import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { LocalNotifications } from '@capacitor/local-notifications'
import { App as CapApp } from '@capacitor/app'

export function useNotifications(userId) {
    const [notifications, setNotifications] = useState([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [loading, setLoading] = useState(true)

    const showLocalNotification = async (payload) => {
        try {
            const { platform } = await CapApp.getInfo()
            if (platform === 'web') return

            const { new: newNotification } = payload
            if (!newNotification || newNotification.read) return

            // Map notification type to a friendly title
            const typeLabels = {
                'correction_request_created': 'Nueva Solicitud de Corrección',
                'correction_approved': 'Solicitud de Corrección Aprobada',
                'correction_rejected': 'Solicitud de Corrección Rechazada',
                'absence_request_created': 'Nueva Solicitud de Ausencia',
                'absence_approved': 'Solicitud de Ausencia Aprobada',
                'absence_rejected': 'Solicitud de Ausencia Rechazada',
                'overtime_warning_90': '⚠️ Aviso de Horas Extras (90%)',
                'overtime_reached_100': '🚨 Jornada Completa Alcanzada',
                'overtime_exceeded': '🔴 Horas Extras Excedidas',
                'overtime_admin_alert': '⚠️ Alerta de Horas Extras (Admin)',
                'system_auto_close': '🕒 Cierre de Jornada Automático',
                'billing_notice': '📧 AVISO DE PAGO PENDIENTE',
                'license_suspended': '🚫 LICENCIA SUSPENDIDA'
            }

            await LocalNotifications.schedule({
                notifications: [
                    {
                        title: typeLabels[newNotification.type] || 'Nueva Notificación',
                        body: newNotification.message || 'Tienes un nuevo mensaje en Fichar App',
                        id: Math.floor(Math.random() * 100000),
                        schedule: { at: new Date(Date.now() + 1000) },
                        sound: 'default',
                        channelId: 'fichar-alerts',
                        attachments: [],
                        actionTypeId: '',
                        extra: null
                    }
                ]
            })
        } catch (err) {
            console.error('Error showing local notification:', err)
        }
    }

    const fetchNotifications = async () => {
        try {
            console.log('📥 Fetching notifications for user:', userId)
            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .eq('user_id', userId)
                .order('created_at', { ascending: false })
                .limit(50)

            if (error) throw error

            setNotifications(data || [])
            const unread = data?.filter(n => !n.read).length || 0
            setUnreadCount(unread)
        } catch (err) {
            console.error('❌ Error fetching notifications:', err)
        } finally {
            setLoading(false)
        }
    }

    const markAsRead = async (notificationId) => {
        try {
            const { error } = await supabase
                .from('notifications')
                .update({ read: true })
                .eq('id', notificationId)

            if (error) throw error

            // Update local state
            setNotifications(prev =>
                prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
            )
            setUnreadCount(prev => Math.max(0, prev - 1))
        } catch (err) {
            console.error('Error marking notification as read:', err)
        }
    }

    const markAllAsRead = async () => {
        try {
            const unreadIds = notifications.filter(n => !n.read).map(n => n.id)

            if (unreadIds.length === 0) return

            const { error } = await supabase
                .from('notifications')
                .update({ read: true })
                .in('id', unreadIds)

            if (error) throw error

            // Update local state
            setNotifications(prev => prev.map(n => ({ ...n, read: true })))
            setUnreadCount(0)
        } catch (err) {
            console.error('Error marking all as read:', err)
        }
    }

    const deleteNotification = async (notificationId) => {
        try {
            const { error } = await supabase
                .from('notifications')
                .delete()
                .eq('id', notificationId)

            if (error) throw error

            // Update local state
            const notification = notifications.find(n => n.id === notificationId)
            setNotifications(prev => prev.filter(n => n.id !== notificationId))
            if (notification && !notification.read) {
                setUnreadCount(prev => Math.max(0, prev - 1))
            }
        } catch (err) {
            console.error('Error deleting notification:', err)
        }
    }

    useEffect(() => {
        if (!userId) return

        fetchNotifications()

        // Subscribe to realtime changes
        const channel = supabase
            .channel(`notifications_${userId}`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'notifications',
                    filter: `user_id=eq.${userId}`
                },
                (payload) => {
                    console.log('🔔 New Notification:', payload)
                    showLocalNotification(payload)
                    fetchNotifications()
                }
            )
            .subscribe()

        // Polling fallback: check for new notifications every 30 seconds
        const pollInterval = setInterval(() => {
            fetchNotifications()
        }, 30000)

        return () => {
            supabase.removeChannel(channel)
            clearInterval(pollInterval)
        }
    }, [userId])

    return {
        notifications,
        unreadCount,
        loading,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        refresh: fetchNotifications
    }
}
