/*
 * Voice recorder window for the Zoho People Web Tab.
 *
 * Opened by the chat only after the browser refused the microphone inside the
 * Web Tab frame (Zoho's page does not pass microphone access to the frame).
 * This page is a top-level window, where the browser can ask for the
 * microphone. It records one question (max 30 s) and hands the audio back to
 * the chat with postMessage, to this same origin only. It calls no API itself
 * and holds no credentials.
 */
(function () {
  'use strict';

  var MAX_MS = 30000;
  var MIN_MS = 700;
  var TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm', 'audio/mp4'];
  var UPLOAD_TYPES = ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/aac'];

  var micButton = document.getElementById('mic');
  var cancelButton = document.getElementById('cancel');
  var statusText = document.getElementById('status');
  var timerText = document.getElementById('timer');

  var recorder = null;
  var stream = null;
  var chunks = [];
  var startedAt = 0;
  var ticker = null;
  var limit = null;
  var sent = false;

  function send(message) {
    if (!window.opener || window.opener.closed) {
      setStatus('The chat was closed. Please start again from the chat.', true);
      return false;
    }
    window.opener.postMessage(Object.assign({ source: 'e360-voice' }, message), window.location.origin);
    return true;
  }

  function setStatus(text, isError) {
    statusText.textContent = text;
    statusText.className = isError ? 'is-error' : '';
  }

  function release() {
    if (ticker) clearInterval(ticker);
    if (limit) clearTimeout(limit);
    ticker = null;
    limit = null;
    if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
    stream = null;
  }

  function uploadType(mime) {
    var base = String(mime || '').split(';')[0].trim().toLowerCase();
    return UPLOAD_TYPES.indexOf(base) >= 0 ? base : null;
  }

  function createRecorder(media) {
    var preferred = null;
    for (var i = 0; i < TYPES.length && !preferred; i += 1) {
      try {
        if (MediaRecorder.isTypeSupported(TYPES[i])) preferred = TYPES[i];
      } catch (e) { /* try the next type */ }
    }
    var attempts = preferred ? [{ mimeType: preferred, audioBitsPerSecond: 32000 }, { mimeType: preferred }] : [{}];
    var lastError = null;
    for (var j = 0; j < attempts.length; j += 1) {
      try {
        var created = new MediaRecorder(media, attempts[j]);
        if (!preferred && !uploadType(created.mimeType)) {
          throw Object.assign(new Error('format'), { name: 'NotSupportedError' });
        }
        return created;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || Object.assign(new Error('format'), { name: 'NotSupportedError' });
  }

  function errorText(error) {
    var name = (error && error.name) || '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'Microphone access is blocked for this window. Click the icon at the left of the address bar, allow the microphone, then tap the button.';
    }
    if (name === 'NotFoundError') return 'No microphone was found on this device.';
    if (name === 'NotReadableError') return 'The microphone is in use by another app.';
    if (name === 'NotSupportedError') return "This browser can't record audio. Please type your question in the chat.";
    return "Couldn't start the microphone. Tap the button to try again.";
  }

  function start() {
    if (!window.MediaRecorder || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("This browser can't record audio. Please type your question in the chat.", true);
      micButton.disabled = true;
      return;
    }
    micButton.disabled = true;
    setStatus('Starting the microphone… allow it if your browser asks.');
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then(function (media) {
        stream = media;
        recorder = createRecorder(media);
        chunks = [];
        recorder.ondataavailable = function (event) {
          if (event.data && event.data.size > 0) chunks.push(event.data);
        };
        recorder.onstop = finish;
        recorder.start();
        startedAt = Date.now();
        micButton.disabled = false;
        micButton.classList.add('is-recording');
        micButton.setAttribute('aria-label', 'Stop and send');
        setStatus('Listening… tap the button again to send.');
        ticker = setInterval(function () {
          var seconds = Math.floor((Date.now() - startedAt) / 1000);
          timerText.textContent = '0:' + String(seconds).padStart(2, '0') + ' / 0:30';
        }, 250);
        limit = setTimeout(stop, MAX_MS);
      })
      .catch(function (error) {
        recorder = null;
        release();
        micButton.disabled = false;
        micButton.setAttribute('aria-label', 'Try the microphone again');
        setStatus(errorText(error), true);
      });
  }

  function stop() {
    if (recorder && recorder.state !== 'inactive') {
      micButton.disabled = true;
      setStatus('Sending…');
      recorder.stop();
    }
  }

  function finish() {
    var durationMs = Date.now() - startedAt;
    var mimeType = uploadType(recorder && recorder.mimeType) || 'audio/webm';
    var blob = new Blob(chunks, { type: mimeType });
    recorder = null;
    release();
    micButton.classList.remove('is-recording');
    if (durationMs < MIN_MS || blob.size === 0) {
      micButton.disabled = false;
      timerText.textContent = '';
      setStatus('That was too short. Tap the button and speak your question.', true);
      return;
    }
    if (send({ type: 'recording', blob: blob, mimeType: mimeType, durationMs: durationMs })) {
      sent = true;
      window.close();
    }
  }

  micButton.addEventListener('click', function () {
    if (recorder) stop();
    else start();
  });

  function cancel() {
    if (recorder) {
      recorder.onstop = null;
      try { recorder.stop(); } catch (e) { /* already stopped */ }
      recorder = null;
    }
    release();
    if (!sent) send({ type: 'cancel' });
    sent = true;
    window.close();
  }

  cancelButton.addEventListener('click', cancel);
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') cancel();
  });

  window.addEventListener('beforeunload', function () {
    release();
    if (!sent && window.opener && !window.opener.closed) {
      window.opener.postMessage({ source: 'e360-voice', type: 'cancel' }, window.location.origin);
    }
  });

  // Recording starts at once; the browser asks for the microphone the first time.
  start();
})();
