const express = require('express');
const router = express.Router();
const { createBooking } = require('../models/booking');

/**
 * POST /bookings
 * Expected JSON body: { roomId: number, startDate: string, endDate: string }
 * Returns 201 with the created booking or 409 if the room is already booked.
 */
router.post('/', async (req, res) => {
    const { roomId, startDate, endDate } = req.body;

    // Basic payload validation
    if (!roomId || !startDate || !endDate) {
        return res.status(400).json({ error: 'roomId, startDate and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (isNaN(start) || isNaN(end) || start >= end) {
        return res.status(400).json({ error: 'Invalid date range' });
    }

    try {
        const booking = createBooking({
            roomId,
            startDate: start.toISOString(),
            endDate: end.toISOString()
        });
        res.status(201).json(booking);
    } catch (err) {
        if (err.code === 'CONFLICT') {
            return res.status(409).json({ error: err.message });
        }
        console.error(err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
