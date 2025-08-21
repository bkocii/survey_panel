// modal_manager.js
window.ModalManager = (function () {
  let modal, titleEl, messageEl, confirmBtn, cancelBtn;
  let prevActive = null;

  function ensureEls() {
    if (modal) return;
    modal = document.getElementById('confirm-switch-modal');
    if (!modal) return;
    titleEl   = modal.querySelector('[data-modal-title]')   || modal.querySelector('h2');
    messageEl = modal.querySelector('[data-modal-message]') || modal.querySelector('p');
    confirmBtn = document.getElementById('confirm-switch-type');
    cancelBtn  = document.getElementById('cancel-switch-type');
  }

  function init() {
    ensureEls();
  }

  function trapFocus(e) {
    if (e.key !== 'Tab') return;
    const focusables = modal.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusables.length) return;
    const first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function open({ title, message, confirmText = 'Yes, Switch', cancelText = 'Cancel' }) {
    ensureEls();
    return new Promise((resolve) => {
      if (!modal) return resolve(false);

      if (titleEl)   titleEl.textContent = title || 'Confirm';
      if (messageEl) messageEl.textContent = message || 'Are you sure?';
      if (confirmBtn) confirmBtn.textContent = confirmText;
      if (cancelBtn)  cancelBtn.textContent  = cancelText;

      const onConfirm = () => cleanup(true);
      const onCancel  = () => cleanup(false);
      const onKey     = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); cleanup(false); }
        if (e.key === 'Enter')  { e.preventDefault(); cleanup(true); }
      };

      function cleanup(result) {
        modal.classList.add('hidden');
        modal.removeAttribute('aria-modal');
        modal.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', onKey);
        document.removeEventListener('keydown', trapFocus);
        confirmBtn && confirmBtn.removeEventListener('click', onConfirm);
        cancelBtn  && cancelBtn.removeEventListener('click', onCancel);
        if (prevActive) { prevActive.focus?.(); prevActive = null; }
        resolve(result);
      }

      prevActive = document.activeElement;
      modal.classList.remove('hidden');
      modal.setAttribute('aria-modal', 'true');
      modal.setAttribute('aria-hidden', 'false');
      confirmBtn?.focus();

      confirmBtn && confirmBtn.addEventListener('click', onConfirm);
      cancelBtn  && cancelBtn.addEventListener('click', onCancel);
      document.addEventListener('keydown', onKey);
      document.addEventListener('keydown', trapFocus);
    });
  }

  function getCount(prefix) {
    const el = document.getElementById(`id_${prefix}-TOTAL_FORMS`);
    return el ? parseInt(el.value || '0', 10) : 0;
  }
  function hasAnyInlines() {
    return getCount('choices') > 0 || getCount('matrix_rows') > 0 || getCount('matrix_cols') > 0;
  }
  function hasMatrixInlines() {
    return getCount('matrix_rows') > 0 || getCount('matrix_cols') > 0;
  }

  async function handleQuestionTypeSwitch(prevType, newType, onConfirm) {
    if (prevType === newType) return;
    if (!hasAnyInlines()) { onConfirm(newType); return; }
    const ok = await open({
      title: 'Switch Question Type?',
      message: 'Changing the question type will remove all added choices, rows, or columns. Continue?',
      confirmText: 'Yes, Switch',
      cancelText: 'Cancel'
    });
    if (ok) onConfirm(newType);
    else {
      const sel = document.getElementById('id_question_type');
      if (sel) sel.value = prevType || '';
    }
  }

  async function handleMatrixModeSwitch(prevMode, newMode, onConfirm) {
    if (prevMode === newMode) return;
    if (!hasMatrixInlines()) { onConfirm(newMode); return; }
    const ok = await open({
      title: 'Switch Matrix Mode?',
      message: 'Switching matrix mode will clear current rows & columns to avoid incompatible state. Continue?',
      confirmText: 'Yes, Switch',
      cancelText: 'Cancel'
    });
    if (ok) onConfirm(newMode);
    else {
      const sel = document.getElementById('id_matrix_mode');
      if (sel) sel.value = prevMode || '';
    }
  }

  return { init, confirm: open, handleQuestionTypeSwitch, handleMatrixModeSwitch };
})();
