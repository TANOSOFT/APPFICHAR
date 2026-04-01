-- Add schedule columns to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS scheduled_start_time TIME NULL;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS scheduled_end_time TIME NULL;
