
document.addEventListener('DOMContentLoaded', function () {
    flatpickr(".date-input", {
        dateFormat: "Y-m-d",
        maxDate: "today",  // Optional: Prevent selecting future dates
        altInput: true,
        altFormat: "F j, Y",
    });
});
