import { useEffect, useRef, useState } from 'react';
import { IconButton, Tooltip } from '@mui/material';
import { Mic, Stop } from '@mui/icons-material';
import { isNativeApp } from '../../native/platform';

// Minimal typing for the browser Web Speech API (not in the TS DOM lib).
interface WebRecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface WebRecognitionEvent {
  resultIndex: number;
  results: ArrayLike<WebRecognitionResult>;
}
interface WebRecognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: WebRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type WebRecognitionCtor = new () => WebRecognition;

function webRecognition(): WebRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: WebRecognitionCtor; webkitSpeechRecognition?: WebRecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const join = (base: string, add: string) => (base.trim() ? `${base.trimEnd()} ${add.trim()}` : add.trim());

/**
 * Mic button that dictates into a text field: native speech recognition in the phone app,
 * the Web Speech API in browsers. Renders nothing when neither is available.
 */
export default function VoiceButton({
  value,
  onChange,
  onError,
}: {
  value: string;
  onChange: (text: string) => void;
  onError?: (message: string) => void;
}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const baseRef = useRef('');
  const webRef = useRef<WebRecognition | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    let alive = true;
    if (isNativeApp()) {
      import('@capacitor-community/speech-recognition')
        .then(({ SpeechRecognition }) => SpeechRecognition.available())
        .then((r) => alive && setSupported(!!r.available))
        .catch(() => alive && setSupported(false));
    } else {
      setSupported(!!webRecognition());
    }
    return () => {
      alive = false;
      cleanupRef.current?.();
    };
  }, []);

  const stop = async () => {
    setListening(false);
    if (webRef.current) {
      webRef.current.stop();
      webRef.current = null;
    }
    if (isNativeApp()) {
      try {
        const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
        await SpeechRecognition.stop();
      } catch {
        /* already stopped */
      }
    }
    cleanupRef.current?.();
    cleanupRef.current = null;
  };

  const startNative = async () => {
    const { SpeechRecognition } = await import('@capacitor-community/speech-recognition');
    const perm = await SpeechRecognition.requestPermissions();
    if (perm.speechRecognition !== 'granted') {
      onError?.('Microphone / speech permission was denied. Allow it in Settings to dictate.');
      return;
    }
    await SpeechRecognition.removeAllListeners();
    const partial = await SpeechRecognition.addListener('partialResults', (d) => {
      const t = d.matches?.[0];
      if (t) onChangeRef.current(join(baseRef.current, t));
    });
    const state = await SpeechRecognition.addListener('listeningState', (d) => {
      if (d.status === 'stopped') setListening(false);
    });
    cleanupRef.current = () => {
      partial.remove();
      state.remove();
    };
    setListening(true);
    const res = await SpeechRecognition.start({
      language: navigator.language || 'en-US',
      partialResults: true,
      popup: false,
      maxResults: 1,
    });
    // Some platforms return the final text here instead of via partialResults.
    const final = res?.matches?.[0];
    if (final) onChangeRef.current(join(baseRef.current, final));
  };

  const startWeb = () => {
    const Ctor = webRecognition();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    let finalText = '';
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText = join(finalText, r[0].transcript);
        else interim = join(interim, r[0].transcript);
      }
      onChangeRef.current(join(baseRef.current, join(finalText, interim)));
    };
    rec.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') onError?.('Microphone permission was denied.');
      else if (e.error && e.error !== 'no-speech' && e.error !== 'aborted') onError?.(`Dictation stopped (${e.error}).`);
    };
    rec.onend = () => {
      setListening(false);
      webRef.current = null;
    };
    webRef.current = rec;
    rec.start();
    setListening(true);
  };

  const toggle = async () => {
    if (listening) {
      await stop();
      return;
    }
    baseRef.current = value;
    try {
      if (isNativeApp()) await startNative();
      else startWeb();
    } catch (e) {
      setListening(false);
      onError?.(e instanceof Error ? e.message : 'Dictation is not available.');
    }
  };

  if (!supported) return null;
  return (
    <Tooltip title={listening ? 'Stop dictation' : 'Dictate'}>
      <IconButton
        onClick={toggle}
        color={listening ? 'error' : 'primary'}
        aria-label={listening ? 'Stop dictation' : 'Dictate'}
        sx={listening ? { animation: 'mpPulse 1.2s ease-in-out infinite', '@keyframes mpPulse': { '50%': { opacity: 0.45 } } } : undefined}
      >
        {listening ? <Stop /> : <Mic />}
      </IconButton>
    </Tooltip>
  );
}
