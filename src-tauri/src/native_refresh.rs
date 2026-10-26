//! Let WebKit choose the display rate without its separate near-60-fps preference.
//! Apply this before WKWebView creation, including before its first navigation.

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Sel};
use objc2::{msg_send, sel, ClassType, MainThreadMarker};
use objc2_foundation::{NSArray, NSString};
use objc2_web_kit::{WKPreferences, WKWebViewConfiguration};

const NEAR_60_FPS: &str = "PreferPageRenderingUpdatesNear60FPSEnabled";

pub fn configuration() -> Option<Retained<WKWebViewConfiguration>> {
    match try_configuration() {
        Ok(configuration) => Some(configuration),
        Err(missing) => {
            eprintln!("aegis: native refresh unavailable ({missing}); keeping WebKit defaults");
            None
        }
    }
}

fn responds_to(object: &AnyObject, selector: Sel) -> bool {
    // All receivers here are WebKit/Foundation NSObject subclasses or their class objects.
    unsafe { msg_send![object, respondsToSelector: selector] }
}

fn try_configuration() -> Result<Retained<WKWebViewConfiguration>, &'static str> {
    let main_thread = MainThreadMarker::new().ok_or("main thread")?;
    // The main-thread marker guarantees AppKit/WebKit initialisation stays on this thread.
    let configuration = unsafe { WKWebViewConfiguration::new(main_thread) };
    if !responds_to(&configuration, sel!(preferences)) {
        return Err("WKWebViewConfiguration.preferences");
    }
    let preferences = unsafe { configuration.preferences() };
    let class = WKPreferences::class();
    if !responds_to(class.as_ref(), sel!(_features)) {
        return Err("+[WKPreferences _features]");
    }
    if !responds_to(&preferences, sel!(_setEnabled:forFeature:)) {
        return Err("-[WKPreferences _setEnabled:forFeature:]");
    }
    // WebKit's SPI returns an autoreleased NSArray<_WKFeature *> and NSString keys.
    // Retained owns these results while inspecting them. Every SPI selector is checked
    // before messaging, and no preference changes until the named feature is found.
    let features: Option<Retained<NSArray<AnyObject>>> = unsafe { msg_send![class, _features] };
    let features = features.ok_or("WKPreferences feature list")?;
    for feature in features.iter() {
        if !responds_to(&feature, sel!(key)) {
            return Err("_WKFeature.key");
        }
        let key: Option<Retained<NSString>> = unsafe { msg_send![&feature, key] };
        let key = key.ok_or("_WKFeature.key value")?;
        if key.to_string() == NEAR_60_FPS {
            // This removes only the near-60 preference. Power, thermal, visibility and
            // display-rate throttling remain WebKit's responsibility. No display link.
            unsafe {
                let _: () = msg_send![&preferences, _setEnabled: false, forFeature: &*feature];
            }
            return Ok(configuration);
        }
    }
    Err(NEAR_60_FPS)
}
