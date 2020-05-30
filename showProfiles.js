const sqlite3 = require('sqlite3');

const db = new sqlite3.Database(
    './db/sketch.db',
    sqlite3.OPEN_READONLY,
    (err) => {
        if (err) console.log(err.message);
        else console.log('Connected to sketch db!');
    }
);

showProfiles();

function showProfiles() {
    db.get(`SELECT * FROM user`, [], (err, row) => {
        if (err)
            console.log(err)
        else if (row)
            console.log(row);
    })
}