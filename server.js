const express = require('express');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const cors = require('cors');
const sqlite3 = require('sqlite3');

const app = express();
app.use(cors());
app.use(bodyParser.json());

const db = new sqlite3.Database(
    './db/sketch.db',
    sqlite3.OPEN_READWRITE,
    (err) => {
        if (err) console.log(err.message);
        else console.log('Connected to sketch db!');
    }
);

app.post('/register', function (req, res) {
    if (req.body) {
        console.log('richiesta in corso...');
        const user = {
            nickname: req.body.name,
            email: req.body.email,
            password: req.body.password,
        };
        const token = jwt.sign({ user }, 'the_secret_key');

        dbInstertUser(user.nickname, user.email, user.password);
        res.json({
            token,
            email: user.email,
            nickname: user.nickname,
        });
    } else console.log('nope');
});

app.post('/login', function (req, res) {
    if (req.body) {
        db.get(
            `SELECT nickname, email, hash FROM user WHERE email = ? AND hash = ?`,
            [req.body.email, req.body.password],
            (err, row) => {
                if (err || !row) {
                    res.status(400);
                } else {
                    //SUCCESS
                    const token = jwt.sign({ row }, 'the_secret_key');
                    res.json({
                        token,
                        email: row.email,
                        nickname: row.nickname,
                    });
                }
            }
        );
    } else res.status(400);
});

app.get('/profile/:user', function (req, res) {
    if (req.body) {
        db.get(
            `SELECT nickname FROM user WHERE nickname = ?`,
            [req.params.user],
            (err, row) => {
                if (err) {
                    throw err;
                } else {
                    if (row) {
                        res.json({
                            nickname: row.nickname,
                        });
                    } else {
                        console.log('not found')
                        res.status(404);
                    }
                }
            }
        );
    }
});

app.listen(3000, function () {
    console.log('Example app listening on port 3000!');
});

function dbInstertUser(nick, mail, hash) {
    db.run(
        `INSERT INTO user(nickname,email,hash) VALUES (?,?,?)`,
        [nick, mail, hash],
        function (err) {
            if (err) return console.log(err.message);

            console.log('inserted ' + this.lastID);
        }
    );
    dbShow();
}

function dbShow() {
    db.all(`SELECT * FROM user`, [], (err, rows) => {
        if (err) {
            throw err;
        }
        rows.forEach((row) => {
            console.log(row);
        });
    });
}
