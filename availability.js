// Check if room booking dates are valid and available
function checkRoomAvailability(rooms, checkIn, checkOut) {
    // BUG: Allows same day booking
    if (checkIn > checkOut) {
        return false;
    }

    return rooms > 0;
}

// Calculate number of nights between dates
function calculateNights(checkIn, checkOut) {
    // BUG: Can return negative values
    return (checkOut - checkIn) / (1000 * 60 * 60 * 24);
}

// Example usage
const checkIn = new Date("2026-06-10");
const checkOut = new Date("2026-06-10");

console.log(checkRoomAvailability(5, checkIn, checkOut));
console.log(calculateNights(checkIn, checkOut));