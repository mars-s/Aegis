// On-device dictation for the Ask orb. Apple's Speech framework listens on the
// microphone and streams partial transcripts to the page. Nothing leaves the Mac.
use std::ptr::NonNull;
use std::sync::mpsc;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use block2::RcBlock;
use objc2::rc::Retained;
use objc2::AnyThread;
use objc2_avf_audio::{AVAudioEngine, AVAudioPCMBuffer, AVAudioTime};
use objc2_foundation::NSError;
use objc2_speech::{
    SFSpeechAudioBufferRecognitionRequest, SFSpeechRecognitionResult,
    SFSpeechRecognitionTask, SFSpeechRecognizer, SFSpeechRecognizerAuthorizationStatus,
};
use serde::Serialize;

#[derive(Clone, Default, Serialize)]
pub struct Transcript {
    pub seq: u64,
    pub text: String,
    pub done: bool,
    pub error: Option<String>,
}

#[derive(Default)]
pub struct Dictation {
    session: Mutex<Option<Session>>,
    latest: Arc<Mutex<Transcript>>,
}

struct Session {
    engine: Retained<AVAudioEngine>,
    request: Retained<SFSpeechAudioBufferRecognitionRequest>,
    // Kept alive so the task and tap outlive the calls that created them.
    _task: Retained<SFSpeechRecognitionTask>,
    _tap: RcBlock<dyn Fn(NonNull<AVAudioPCMBuffer>, NonNull<AVAudioTime>)>,
}

// Apple's audio objects are used from the thread that starts them and from their
// own audio thread. We only ever reach them through the mutex, so moving the
// handle between command threads is sound.
unsafe impl Send for Session {}

fn record(latest: &Mutex<Transcript>, text: String, done: bool, error: Option<String>) {
    let mut latest = latest.lock().unwrap();
    latest.seq += 1;
    latest.text = text;
    latest.done = done;
    latest.error = error;
}

fn authorize() -> Result<SFSpeechRecognizerAuthorizationStatus, String> {
    let (send, receive) = mpsc::channel();
    let handler = RcBlock::new(move |status: SFSpeechRecognizerAuthorizationStatus| {
        let _ = send.send(status);
    });
    unsafe { SFSpeechRecognizer::requestAuthorization(&handler) };
    receive.recv_timeout(Duration::from_secs(120)).map_err(|_| "Speech recognition permission did not answer.".to_string())
}

pub fn start(state: &Dictation) -> Result<(), String> {
    stop(state);
    *state.latest.lock().unwrap() = Transcript::default();

    let status = authorize()?;
    if status != SFSpeechRecognizerAuthorizationStatus::Authorized {
        return Err(if status == SFSpeechRecognizerAuthorizationStatus::Denied {
            "Speech recognition is off for Aegis. Turn it on in System Settings, Privacy and Security, Speech Recognition.".into()
        } else {
            "This Mac does not allow speech recognition for Aegis.".into()
        });
    }

    let recognizer = unsafe { SFSpeechRecognizer::init(SFSpeechRecognizer::alloc()) }.ok_or("No speech recogniser is available.")?;
    if unsafe { !recognizer.isAvailable() } {
        return Err("Speech recognition is busy or offline right now.".into());
    }

    let request = unsafe { SFSpeechAudioBufferRecognitionRequest::new() };
    unsafe {
        request.setShouldReportPartialResults(true);
        request.setRequiresOnDeviceRecognition(true);
        request.setAddsPunctuation(true);
    }

    let latest = Arc::clone(&state.latest);
    let result_handler = RcBlock::new(move |result: *mut SFSpeechRecognitionResult, error: *mut NSError| {
        if !error.is_null() {
            let message = unsafe { (*error).localizedDescription() }.to_string();
            record(&latest, String::new(), true, Some(message));
            return;
        }
        if result.is_null() {
            return;
        }
        let result = unsafe { &*result };
        let text = unsafe { result.bestTranscription().formattedString() }.to_string();
        record(&latest, text, unsafe { result.isFinal() }, None);
    });
    let task = unsafe { recognizer.recognitionTaskWithRequest_resultHandler(&request, &result_handler) };

    let engine = unsafe { AVAudioEngine::new() };
    let input = unsafe { engine.inputNode() };
    let format = unsafe { input.outputFormatForBus(0) };
    let audio_request = request.clone();
    let tap = RcBlock::new(move |buffer: NonNull<AVAudioPCMBuffer>, _when: NonNull<AVAudioTime>| {
        let buffer = unsafe { buffer.as_ref() };
        unsafe { audio_request.appendAudioPCMBuffer(buffer) };
    });
    unsafe {
        input.installTapOnBus_bufferSize_format_block(0, 1024, Some(&format), RcBlock::as_ptr(&tap) as *mut _);
        engine.prepare();
    }
    if let Err(error) = unsafe { engine.startAndReturnError() } {
        unsafe { input.removeTapOnBus(0) };
        unsafe { task.cancel() };
        return Err(format!("The microphone did not start: {}", error.localizedDescription()));
    }

    *state.session.lock().unwrap() = Some(Session { engine, request, _task: task, _tap: tap });
    Ok(())
}

pub fn stop(state: &Dictation) {
    let Some(session) = state.session.lock().unwrap().take() else { return };
    unsafe {
        session.engine.stop();
        session.engine.inputNode().removeTapOnBus(0);
        session.request.endAudio();
        session._task.finish();
    }
}

pub fn latest(state: &Dictation) -> Transcript {
    state.latest.lock().unwrap().clone()
}
