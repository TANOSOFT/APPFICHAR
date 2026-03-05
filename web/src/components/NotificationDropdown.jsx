import { format } from 'date-fns'
import { es } from 'date-fns/locale'

export function NotificationDropdown({
    notifications,
    unreadCount,
    onClose,
    onMarkAsRead,
    onMarkAllAsRead,
    onDelete
}) {
    const getNotificationIcon = (type) => {
        switch (type) {
            case 'correction_request_created':
                return '🔔'
            case 'correction_approved':
                return '✅'
            case 'correction_rejected':
                return '❌'
            case 'absence_request_created':
                return '📅'
            case 'absence_approved':
                return '🏖️'
            case 'absence_rejected':
                return '🚫'
            default:
                return '📢'
        }
    }

    const handleNotificationClick = (notification) => {
        console.log('🔔 Notification clicked:', notification)

        // Mark as read if unread
        if (!notification.read) {
            onMarkAsRead(notification.id)
        }

        // Navigate based on notification type
        if (notification.type === 'correction_request_created') {
            console.log('🚀 Dispatching navigation event for request:', notification.correction_request_id)
            // For admins: navigate to correction review section
            window.dispatchEvent(new CustomEvent('navigateToCorrectionsReview', {
                detail: { requestId: notification.correction_request_id }
            }))
            onClose() // Close dropdown
        } else if (notification.type === 'absence_request_created') {
            console.log('🚀 Dispatching navigation event for absence request:', notification.absence_request_id)
            // For admins: navigate to absences review section
            window.dispatchEvent(new CustomEvent('navigateToAbsenceReview', {
                detail: { requestId: notification.absence_request_id }
            }))
            onClose()
        } else if (notification.type === 'correction_approved' || notification.type === 'correction_rejected' ||
            notification.type === 'absence_approved' || notification.type === 'absence_rejected') {
            // For employees: just mark as read (already done above)
            onClose()
        }
    }

    return (
        <>
            {/* Overlay to close dropdown */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 999
                }}
            />

            {/* Dropdown Panel */}
            <div
                style={{
                    position: 'fixed',
                    top: '5rem',
                    right: '1rem',
                    width: '380px',
                    maxWidth: 'calc(100vw - 2rem)',
                    maxHeight: 'calc(100vh - 7rem)',
                    backgroundColor: 'white',
                    borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                    overflow: 'hidden',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '1rem',
                    borderBottom: '1px solid var(--border-color)',
                    backgroundColor: '#f8f9fa',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h4 style={{ margin: 0, fontSize: '1rem' }}>
                        Notificaciones {unreadCount > 0 && `(${unreadCount})`}
                    </h4>
                    {unreadCount > 0 && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation()
                                onMarkAllAsRead()
                            }}
                            style={{
                                padding: '0.25rem 0.75rem',
                                backgroundColor: 'transparent',
                                border: '1px solid #3b82f6',
                                color: '#3b82f6',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                fontWeight: 'bold',
                                transition: 'all 0.2s'
                            }}
                            onMouseEnter={(e) => {
                                e.target.style.backgroundColor = '#3b82f6'
                                e.target.style.color = 'white'
                            }}
                            onMouseLeave={(e) => {
                                e.target.style.backgroundColor = 'transparent'
                                e.target.style.color = '#3b82f6'
                            }}
                        >
                            Marcar todas leídas
                        </button>
                    )}
                </div>

                {/* Notification List */}
                <div style={{
                    overflowY: 'auto',
                    flex: 1
                }}>
                    {notifications.length === 0 ? (
                        <div style={{
                            padding: '2rem',
                            textAlign: 'center',
                            color: '#666'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🔕</div>
                            <p>No tienes notificaciones</p>
                        </div>
                    ) : (
                        notifications.map((notification) => (
                            <div
                                key={notification.id}
                                onClick={() => handleNotificationClick(notification)}
                                style={{
                                    padding: '1rem',
                                    borderBottom: '1px solid var(--border-color)',
                                    cursor: 'pointer',
                                    backgroundColor: notification.read ? 'white' : '#eff6ff',
                                    transition: 'background-color 0.2s',
                                    position: 'relative'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor = notification.read ? '#f9fafb' : '#dbeafe'
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor = notification.read ? 'white' : '#eff6ff'
                                }}
                                title={notification.type === 'correction_request_created' ? 'Click para ir a revisar' : 'Click para marcar como leída'}
                            >
                                {/* Delete Button */}
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation()
                                        onDelete(notification.id)
                                    }}
                                    title="Eliminar notificación"
                                    style={{
                                        position: 'absolute',
                                        top: '0.5rem',
                                        right: '0.5rem',
                                        backgroundColor: 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        fontSize: '1rem',
                                        padding: '0.25rem',
                                        opacity: 0.5,
                                        transition: 'opacity 0.2s'
                                    }}
                                    onMouseEnter={(e) => e.target.style.opacity = 1}
                                    onMouseLeave={(e) => e.target.style.opacity = 0.5}
                                >
                                    ❌
                                </button>

                                <div style={{ display: 'flex', gap: '0.75rem', paddingRight: '1.5rem' }}>
                                    {/* Icon */}
                                    <div style={{ fontSize: '1.5rem', flexShrink: 0 }}>
                                        {getNotificationIcon(notification.type)}
                                    </div>

                                    {/* Content */}
                                    <div style={{ flex: 1 }}>
                                        <div style={{
                                            fontWeight: notification.read ? 'normal' : 'bold',
                                            fontSize: '0.875rem',
                                            marginBottom: '0.25rem',
                                            color: '#1f2937'
                                        }}>
                                            {notification.title}
                                        </div>
                                        <div style={{
                                            fontSize: '0.8rem',
                                            color: '#6b7280',
                                            marginBottom: '0.5rem'
                                        }}>
                                            {notification.message}
                                        </div>
                                        {(notification.type === 'correction_request_created' || notification.type === 'absence_request_created') && (
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: '#3b82f6',
                                                fontWeight: '500',
                                                marginBottom: '0.5rem'
                                            }}>
                                                👉 Click para revisar
                                            </div>
                                        )}
                                        <div style={{
                                            fontSize: '0.7rem',
                                            color: '#9ca3af'
                                        }}>
                                            {format(new Date(notification.created_at), "dd MMM yyyy, HH:mm", { locale: es })}
                                        </div>
                                    </div>
                                </div>

                                {/* Unread Indicator */}
                                {!notification.read && (
                                    <div style={{
                                        position: 'absolute',
                                        left: '0.5rem',
                                        top: '50%',
                                        transform: 'translateY(-50%)',
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        backgroundColor: '#3b82f6'
                                    }} />
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </>
    )
}
