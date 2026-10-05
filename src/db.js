const Database = require('better-sqlite3');
const path = require('path');

// Initialise a SQLite database stored in the data folder.
// The file is created automatically if it does not exist.
const db = new Database(path.resolve(__dirname, '../data/bookings.db'));

// Ensure the bookings table exists.
db.exec(`
CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL
);
`);

module.exports = db;
