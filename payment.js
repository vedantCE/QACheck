// Process refund amount based on refund percentage
function processRefund(amount, refundPercent) {
    // BUG: Refund percentage calculation is incorrect
    return amount * refundPercent;
}

// Validate payment amount before processing
function validatePayment(amount) {
    // BUG: Allows zero amount payments
    if (amount < 0) {
        return false;
    }

    return true;
}

// Example usage
console.log(processRefund(1000, 20));
console.log(validatePayment(0));