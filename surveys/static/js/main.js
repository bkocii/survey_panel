
document.addEventListener('DOMContentLoaded', function () {
    flatpickr(".date-input", {
        dateFormat: "Y-m-d",
        // maxDate: "today",  // Optional: Prevent selecting future dates
        altInput: true,
        altFormat: "F j, Y",
    });
});

function highlightSelected(input) {
    const container = input.closest('.image-choice-container');

    if (input.type === 'radio') {
        // Remove selected class from all
        container.querySelectorAll('.img-select').forEach(img => img.classList.remove('selected'));

        // Add selected class to clicked one
        const img = input.closest('label').querySelector('img');
        img.classList.add('selected');
    } else if (input.type === 'checkbox') {
        // Toggle selected class
        const img = input.closest('label').querySelector('img');
        img.classList.toggle('selected', input.checked);
    }
}

// document.addEventListener("DOMContentLoaded", function () {
//     document.querySelector("form").addEventListener("submit", function (e) {
//       const dateInput = document.querySelector(".date-input");
//       if (dateInput && !dateInput.value.trim()) {
//         alert("Please select a date.");
//         e.preventDefault();
//       }
//     });
// });

function markSliderMoved() {
    document.getElementById('slider_moved').value = "true";
}

// === OTHER choice normalizer ==============================================
// Works for SINGLE_CHOICE (radio), MULTI_CHOICE (checkbox), DROPDOWN (select)
// Convention: mark "Other" items with data-other="1" on the <input> or <option>

(function () {
  function findZone(el) {
    // look for a sibling .other-zone closest to the control group
    // (we put .other-zone right under the choices/select in the template)
    const group = el.closest('.choice-group') || el.closest('.dropdown-group') || el.closest('.q-card__content') || document;
    return group.querySelector('.other-zone');
  }

  function isOtherActiveFromGroup(group) {
    // radios/checkboxes inside labels
    const otherInputs = group.querySelectorAll('input[data-other="1"]');
    for (const inp of otherInputs) {
      if (inp.checked) return true;
    }
    // select
    const sel = group.querySelector('select');
    if (sel) {
      const opt = sel.options[sel.selectedIndex];
      if (opt && opt.dataset.other === '1') return true;
    }
    return false;
  }

  function updateOtherZoneFrom(el) {
    const zone = findZone(el);
    if (!zone) return;
    const group = el.closest('.choice-group, .dropdown-group') || zone.parentElement;
    const active = isOtherActiveFromGroup(group);
    zone.style.display = active ? '' : 'none';
    if (!active) {
      const input = zone.querySelector('input[type="text"]');
      if (input) input.value = '';
    }
  }

  function wire(root) {
    // Change events for radios/checkboxes/selects within survey/preview cards
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (!t) return;
      if (t.matches('input[type="radio"], input[type="checkbox"], select')) {
        updateOtherZoneFrom(t);
      }
    });

    // Initial pass (e.g. when returning with validation errors)
    root.querySelectorAll('.choice-group input, .dropdown-group select').forEach(updateOtherZoneFrom);
  }

  document.addEventListener('DOMContentLoaded', () => wire(document));
})();



