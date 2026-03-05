-- Enable realtime for time_entries table
-- This allows the frontend to subscribe to changes in real-time

ALTER PUBLICATION supabase_realtime ADD TABLE time_entries;
