import { useState } from 'react'
import { useNotifications } from '../hooks/useNotifications'
import { NotificationDropdown } from './NotificationDropdown'

export function NotificationBell({ userId }) {
    const [isOpen, setIsOpen] = useState(false)
    const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications(userId)

    return (
        <div style={{ position: 'relative' }}>
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                title="Notificaciones"
                style={{
                    position: 'fixed',
                    top: '1rem',
                    right: '1rem',
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '1.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
                    transition: 'all 0.2s',
                    zIndex: 1000
                }}
                onMouseEnter={(e) => {
                    e.target.style.backgroundColor = '#2563eb'
                    e.target.style.transform = 'scale(1.05)'
                }}
                onMouseLeave={(e) => {
                    e.target.style.backgroundColor = '#3b82f6'
                    e.target.style.transform = 'scale(1)'
                }}
            >
                🔔
                {/* Unread Badge */}
                {unreadCount > 0 && (
                    <span
                        style={{
                            position: 'absolute',
                            top: '-5px',
                            right: '-5px',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.75rem',
                            fontWeight: 'bold',
                            border: '2px solid white',
                            animation: unreadCount > 0 ? 'pulse 2s infinite' : 'none'
                        }}
                    >
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            <style>
                {`
                    @keyframes pulse {
                        0%, 100% { transform: scale(1); }
                        50% { transform: scale(1.1); }
                    }
                `}
            </style>

            {/* Dropdown */}
            {isOpen && (
                <NotificationDropdown
                    notifications={notifications}
                    unreadCount={unreadCount}
                    onClose={() => setIsOpen(false)}
                    onMarkAsRead={markAsRead}
                    onMarkAllAsRead={markAllAsRead}
                    onDelete={deleteNotification}
                />
            )}
        </div>
    )
}
