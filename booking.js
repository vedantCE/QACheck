// Calculate the total booking price including tax
function calculateTotalPrice(basePrice, nights, taxPercent) {
    const subtotal = basePrice * nights;

    // BUG: Missing /100 in tax calculation
    const tax = subtotal * taxPercent;

    return subtotal + tax;
}

// Apply discount based on discount code
function applyDiscount(price, discountCode) {
    let discount = 0;

    if (discountCode === "SAVE20") {
        // BUG: Divides by 10 instead of 100
        discount = price * (20 / 10);
    }

    return price - discount;
}

// Example usage
console.log(calculateTotalPrice(100, 2, 10));
console.log(applyDiscount(500, "SAVE20"));