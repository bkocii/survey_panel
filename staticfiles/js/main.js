
document.addEventListener('DOMContentLoaded', function () {
    flatpickr(".date-input", {
        dateFormat: "Y-m-d",
        maxDate: "today",  // Optional: Prevent selecting future dates
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

document.addEventListener("DOMContentLoaded", function () {
    document.querySelector("form").addEventListener("submit", function (e) {
      const dateInput = document.querySelector(".date-input");
      if (dateInput && !dateInput.value.trim()) {
        alert("Please select a date.");
        e.preventDefault();
      }
    });
});

function markSliderMoved() {
    document.getElementById('slider_moved').value = "true";
}


