/**
 * The page inside the Hey Clovie overlay window. The native side drives it:
 *   setState('listening' | 'processing' | 'done' | 'error' | 'idle')
 *   setLevel(0..1)        mic level, ~30 Hz
 *   setTranscript(text)   what the owner said
 *   setMessage(text)      the outcome ("Checked in Sipho")
 *   setAction(label|null) a button; a tap calls ClovieOverlayBridge.onAction()
 * The visual design is a placeholder and is meant to be replaced.
 */
const LABELS = {
  listening: 'Listening',
  processing: 'Working on it',
  done: 'Done',
  error: 'Something went wrong',
};
const $ = (id) => document.getElementById(id);
const glow = $('glow');
const label = $('label');
const text = $('text');
const action = $('action');
let transcript = '';
let message = '';

function renderText() {
  text.textContent = message || transcript;
}

window.setState = (state) => {
  document.body.dataset.state = state;
  label.textContent = LABELS[state] || '';
};
window.setLevel = (level) => {
  const v = Math.max(0, Math.min(1, Number(level) || 0));
  glow.style.transform = 'scaleY(' + (0.25 + v * 0.75).toFixed(3) + ')';
};
window.setTranscript = (value) => {
  transcript = String(value || '');
  renderText();
};
window.setMessage = (value) => {
  message = String(value || '');
  renderText();
};
window.setAction = (value) => {
  action.style.display = value ? 'inline-block' : 'none';
  action.textContent = value || '';
};
action.addEventListener('click', () => {
  if (window.ClovieOverlayBridge) window.ClovieOverlayBridge.onAction();
});
window.setState('idle');
