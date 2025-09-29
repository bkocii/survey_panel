// surveys/static/admin/js/wizard/bus.js
(function (w) {
  const listeners = new Map();
  const on = (ev, fn) => {
    if (!listeners.has(ev)) listeners.set(ev, new Set());
    listeners.get(ev).add(fn);
  };
  const off = (ev, fn) => listeners.get(ev)?.delete(fn);
  const emit = (ev, payload) => listeners.get(ev)?.forEach(fn => fn(payload));
  w.SurveyWizard = w.SurveyWizard || {};
  w.SurveyWizard.bus = { on, off, emit };
})(window);
