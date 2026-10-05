const db = require('../db');

/**
 * Checks whether a booking for the given room overlaps with an existing one.
 * Overlap is defined as any existing booking where the date ranges intersect.
 */
function hasOverlap(roomId, startDate, endDate) {
    const stmt = db.prepare(`
        SELECT 1 FROM bookings
        WHERE room_id = ?
          AND NOT (end_date <= ? OR start_date >= ?)
        LIMIT 1
    `);
    const row = stmt.get(roomId, startDate, endDate);
    return !!row;
}

/**
 * Creates a booking inside a transaction.
 * If an overlapping booking is found, the transaction is rolled back and a
 * conflict error (code 'CONFLICT') is thrown so the route can return 409.
 */
function createBooking({ roomId, startDate, endDate }) {
    const tx = db.transaction(() => {
        if (hasOverlap(roomId, startDate, endDate)) {
            const err = new Error('Room not available for the selected dates');
            err.code = 'CONFLICT';
            throw err;
        }
        const insert = db.prepare(`
            INSERT INTO bookings (room_id, start_date, end_date)
            VALUES (?, ?, ?)
        `);
        const info = insert.run(roomId, startDate, endDate);
        return { id: info.lastInsertRowid, roomId, startDate, endDate };
    });

    return tx();
}

module.exports = { createBooking };
