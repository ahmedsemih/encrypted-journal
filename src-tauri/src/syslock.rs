//! Asks the frontend to lock the journal when the system sleeps or the screen
//! locks. The frontend flushes unsaved edits first, then locks the session.
//!
//! - Sleep (all platforms): threads do not run while the machine is
//!   suspended, so a large wall-clock jump between ticks means we just woke.
//! - Linux: screen-saver and logind D-Bus signals (lock + about-to-sleep).

use std::time::{Duration, SystemTime};

use tauri::{AppHandle, Emitter};

pub const EVENT: &str = "system-lock";

pub fn spawn(app: AppHandle) {
    spawn_sleep_watcher(app.clone());
    #[cfg(target_os = "linux")]
    linux::spawn(app);
}

fn spawn_sleep_watcher(app: AppHandle) {
    const TICK: Duration = Duration::from_secs(5);
    const SLACK: Duration = Duration::from_secs(30);
    std::thread::spawn(move || {
        let mut last = SystemTime::now();
        loop {
            std::thread::sleep(TICK);
            let now = SystemTime::now();
            if now.duration_since(last).is_ok_and(|d| d > TICK + SLACK) {
                eprintln!("lock requested after system resume");
                let _ = app.emit(EVENT, "resume");
            }
            last = now;
        }
    });
}

#[cfg(target_os = "linux")]
mod linux {
    use tauri::{AppHandle, Emitter};
    use zbus::{
        blocking::{Connection, MessageIterator},
        message::Type,
        MatchRule, Message,
    };

    #[derive(Clone, Copy)]
    enum Bus {
        Session,
        System,
    }

    fn signal_is_true(msg: &Message) -> bool {
        msg.body().deserialize::<bool>().unwrap_or(false)
    }

    pub fn spawn(app: AppHandle) {
        // KDE, GNOME and most desktops: ActiveChanged(true) when the screen locks.
        watch(app.clone(), Bus::Session, "org.freedesktop.ScreenSaver", "ActiveChanged", signal_is_true);
        watch(app.clone(), Bus::Session, "org.gnome.ScreenSaver", "ActiveChanged", signal_is_true);
        // logind: `loginctl lock-session` and similar.
        watch(app.clone(), Bus::System, "org.freedesktop.login1.Session", "Lock", |_| true);
        // logind: PrepareForSleep(true) right before suspend.
        watch(app, Bus::System, "org.freedesktop.login1.Manager", "PrepareForSleep", signal_is_true);
    }

    fn watch(app: AppHandle, bus: Bus, interface: &'static str, member: &'static str, should_lock: fn(&Message) -> bool) {
        std::thread::spawn(move || {
            if let Err(err) = listen(&app, bus, interface, member, should_lock) {
                // Not fatal: the bus or service may simply not exist on this desktop.
                eprintln!("system lock watcher {interface}.{member} unavailable: {err}");
            }
        });
    }

    fn listen(
        app: &AppHandle,
        bus: Bus,
        interface: &'static str,
        member: &'static str,
        should_lock: fn(&Message) -> bool,
    ) -> zbus::Result<()> {
        let conn = match bus {
            Bus::Session => Connection::session()?,
            Bus::System => Connection::system()?,
        };
        let rule = MatchRule::builder().msg_type(Type::Signal).interface(interface)?.member(member)?.build();
        for msg in MessageIterator::for_match_rule(rule, &conn, Some(16))? {
            if should_lock(&msg?) {
                eprintln!("lock requested by {interface}.{member}");
                let _ = app.emit(super::EVENT, member);
            }
        }
        Ok(())
    }
}
