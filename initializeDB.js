const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database(
    './db/sketch.db',
    sqlite3.OPEN_READWRITE,
    (err) => {
        if (err) console.log(err.message);
        else console.log('Connected to sketch db!');
    }
);

dbrun();


function dbrun() {
    db.run(`DROP TABLE user`, (error) => {
        if (error) console.log(error.message);
        else console.log('tabella eliminata');
    });
    db.run(
        `CREATE TABLE IF NOT EXISTS user(
    pid INTEGER PRIMARY KEY AUTOINCREMENT,
    nickname TEXT UNIQUE,
    email TEXT UNIQUE,
    hash text)`,
        (error) => {
            if (error) console.log(error.message);
            else console.log('tabella creata');
        }
    );
}
