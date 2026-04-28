-- Migration 019: Track sync state of planned workouts pushed to Intervals.icu calendar.
-- intervals_icu_event_id: the event ID returned by Intervals.icu after a push (used to
-- update or delete the calendar event later, and as the "synced" sentinel).
-- synced_to_intervals_at: timestamp of the most recent successful push (drives the
-- "Synced to Garmin" badge in the UI).
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS intervals_icu_event_id TEXT;
ALTER TABLE workouts ADD COLUMN IF NOT EXISTS synced_to_intervals_at TIMESTAMPTZ;
