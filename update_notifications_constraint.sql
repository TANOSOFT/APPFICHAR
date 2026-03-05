-- =====================================================
-- FIX: Update notifications table constraint
-- =====================================================

-- 1. Drop existing constraint
ALTER TABLE notifications 
    DROP CONSTRAINT IF EXISTS notifications_type_check;

-- 2. Add updated constraint with all required types
ALTER TABLE notifications 
    ADD CONSTRAINT notifications_type_check 
    CHECK (type IN (
        -- Correction requests
        'correction_request_created', 
        'correction_approved', 
        'correction_rejected',
        -- Absence requests
        'absence_request_created',
        'absence_approved',
        'absence_rejected',
        -- Overtime notifications (from trigger)
        'overtime_warning_90', 
        'overtime_reached_100', 
        'overtime_exceeded', 
        'overtime_admin_alert',
        -- System notifications
        'system_auto_close'
    ));

-- 3. Verify the change
SELECT 
    conname, 
    pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'notifications'::regclass 
AND contype = 'c';
