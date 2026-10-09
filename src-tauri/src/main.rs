// Keep release builds from opening a second console window on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    #[cfg(target_os = "linux")]
    {
        // Avoid GDK Wayland Protocol Error 71 with WebKitGTK on Linux
        // SAFETY: Called at the start of main before any other threads are spawned.
        unsafe {
            if std::env::var("GDK_BACKEND").is_err() {
                std::env::set_var("GDK_BACKEND", "x11");
            }
            if std::env::var("WEBKIT_DISABLE_DMABUF_RENDERER").is_err() {
                std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
            }
        }
    }

    mttl_control_lib::run();
}
