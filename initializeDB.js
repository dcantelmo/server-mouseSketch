const fs = require('fs');
const path = require('path');
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
    db.run(`DROP TABLE IF EXISTS user`, (error) => {
        if (error) console.log(error.message);
        else {
            db.run(
                `CREATE TABLE IF NOT EXISTS user(
                pid INTEGER PRIMARY KEY AUTOINCREMENT,
                nickname TEXT UNIQUE,
                email TEXT UNIQUE,
                password text,
                av_path)`,
                (error) => {
                    if (error) console.log(error.message);
                    else console.log('tabella user creata');
                }
            );
        }
    });

    db.run(`DROP TABLE IF EXISTS image`, (error) => {
        if (error) console.log(error.message);
        else {
            db.run(
                `CREATE TABLE IF NOT EXISTS image(
                pid INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                author TEXT,
                path TEXT UNIQUE,
                CONSTRAINT AU_Image UNIQUE (author,name)
                FOREIGN KEY (author) REFERENCES user(nickname))`,
                (error) => {
                    if (error) console.log(error.message);
                    else console.log('tabella image creata');
                }
            );
        }
    });

    const directory = './images';

    fs.readdir(directory, (err, files) => {
        if (err) throw err;

        for (const file of files) {
            fs.unlink(path.join(directory, file), (err) => {
                if (err) throw err;
            });
        }
    });
}
