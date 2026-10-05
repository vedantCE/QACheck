const express = require('express');
const bodyParser = require('body-parser');
const bookingRouter = require('./routes/booking');

const app = express();

app.use(bodyParser.json());

// Mount the booking API under /bookings
app.use('/bookings', bookingRouter);

// Export the app for testing purposes
module.exports = app;

// Start the server when this file is executed directly
if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server listening on port ${PORT}`);
    });
}
