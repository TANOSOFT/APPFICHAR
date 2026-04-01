import { useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { LocalNotifications } from '@capacitor/local-notifications';
import { App as CapApp } from '@capacitor/app';

export function useScheduleReminder(profile) {
    useEffect(() => {
        if (!profile || !profile.id) return;

        const checkSchedule = async () => {
            if (!profile.scheduled_start_time && !profile.scheduled_end_time) return;

            const now = new Date();
            const todayStr = now.toISOString().split('T')[0];
            const currentHourMin = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

            // Check if notified today
            const lastStartNotif = localStorage.getItem(`notified_start_${todayStr}`);
            const lastEndNotif = localStorage.getItem(`notified_end_${todayStr}`);

            try {
                // Check if they need a start reminder
                if (profile.scheduled_start_time && !lastStartNotif) {
                    const scheduledStart = profile.scheduled_start_time.slice(0, 5); // HH:mm
                    
                    if (currentHourMin >= scheduledStart) {
                        // verify they haven't clocked in today
                        const { data: entries } = await supabase
                            .from('time_entries')
                            .select('id')
                            .eq('user_id', profile.id)
                            .gte('start_at', `${todayStr}T00:00:00.000Z`)
                            .lt('start_at', `${todayStr}T23:59:59.999Z`);
                        
                        if (!entries || entries.length === 0) {
                            // Remind them!
                            showReminder('Recuerda fichar tu entrada', 'Ya es la hora de tu jornada laboral.');
                            localStorage.setItem(`notified_start_${todayStr}`, 'true');
                        } else {
                            // they already clocked in, don't remind
                            localStorage.setItem(`notified_start_${todayStr}`, 'true');
                        }
                    }
                }

                // Check if they need an end reminder
                if (profile.scheduled_end_time && !lastEndNotif) {
                    const scheduledEnd = profile.scheduled_end_time.slice(0, 5);
                    
                    if (currentHourMin >= scheduledEnd) {
                        // verify they have an OPEN entry today
                        const { data: openEntries } = await supabase
                            .from('time_entries')
                            .select('id')
                            .eq('user_id', profile.id)
                            .eq('status', 'open');
                        
                        if (openEntries && openEntries.length > 0) {
                            showReminder('Recuerda fichar tu salida', 'Ha finalizado tu turno laboral programado.');
                            localStorage.setItem(`notified_end_${todayStr}`, 'true');
                        } else {
                            // no open entry, don't bother
                            localStorage.setItem(`notified_end_${todayStr}`, 'true');
                        }
                    }
                }

            } catch (err) {
                console.error('Error checking schedule reminders', err);
            }
        };

        const showReminder = async (title, body) => {
            toast(title + ': ' + body, { icon: '⏰', duration: 8000 });
            
            const { platform } = await CapApp.getInfo();
            if (platform === 'web') return;

            await LocalNotifications.schedule({
                notifications: [{
                    title: title,
                    body: body,
                    id: Math.floor(Math.random() * 100000),
                    schedule: { at: new Date(Date.now() + 1000) },
                    channelId: 'fichar-alerts',
                    sound: 'default'
                }]
            });
        };

        // Check immediately and then every 2 minutes
        checkSchedule();
        const interval = setInterval(checkSchedule, 2 * 60 * 1000);

        return () => clearInterval(interval);
    }, [profile]);
}
