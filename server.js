const express = require('express');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const multer = require('multer');           //Gestione multiform
const cors = require('cors');
const sqlite3 = require('sqlite3');
const fs = require('fs');

const app = express();
let upload = multer();
app.use(cors());
app.use(bodyParser.json());
app.use(
    upload.fields([
        { name: 'title', maxCount: 1 },
        { name: 'file', maxCount: 1 },
    ])
);
app.use('/images', express.static(__dirname + '/images'));

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
            nickname: req.body.name.toLowerCase(),
            email: req.body.email.toLowerCase(),
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
                if (err) {
                    res.status(400);
                } else {
                    if (row) {
                        let user = row;
                        const token = jwt.sign({ user }, 'the_secret_key');
                        res.json({
                            token,
                            email: row.email,
                            nickname: row.nickname,
                        });
                    } else console.log('mail e/o password errati');
                }
            }
        );
    } else res.status(400);
});

app.post('/draw', verifyToken, function (req, res) {
    console.log(req)
    jwt.verify(req.token, 'the_secret_key', (err, decoded) => {
        if (err) {
            console.log('ciao')
            res.status(401).json({ err });
        } else {
            let title = req.body.title;
            if (!title)
                title = 'unnamed';
            insertImage(
                title,
                decoded.user.nickname,
                req.files.file[0]
            );
            res.json('Salvato correttamente');
            dbShow();
        }
    });
});

app.get('/profile/:user/gallery', function (req, res) {
    if (req.body) {
        db.all(
            `SELECT path, name FROM image WHERE author = ?`,
            [req.params.user],
            (err, rows) => {
                if (err) {
                    console.log('errore nella query: ' + err);
                } else {
                    console.log(rows)
                    res.json(rows);
                }
            }
        );
    }
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
                        console.log('not found');
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
    db.all(`SELECT * FROM image`, [], (err, rows) => {
        if (err) {
            throw err;
        }
        rows.forEach((row) => {
            console.log(row);
        });
    });
}

function insertImage(name, author, file) {
    let uri = `./images/${author}-${name}.png`;
    fs.access(uri, (err) => {
        if (err) {
            console.log('Creazione file e inserimento path nel db');
            fs.createWriteStream(uri).write(file.buffer, (err) => {
                if (err) {
                    console.log('errore creazione immagine');
                } else dbInsterImage(name, author, uri);
            });
        } else {
            fs.createWriteStream(uri).write(file.buffer, (err) => {
                if (err) {
                    console.log('errore sovrascrittura immagine');
                } else {
                }
            });
        }
    });
}

//Middleware
function verifyToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if (typeof bearerHeader !== 'undefined') {
        const bearer = bearerHeader.split(' ');
        const bearerToken = bearer[1];
        req.token = bearerToken;
        next();
    } else {
        res.sendStatus(401);
    }
}

function dbInsterImage(name, author, path) {
    db.run(
        `INSERT INTO image(name,author,path) VALUES (?,?,?)`,
        [name, author, path],
        (err) => {
            if (err) {
                console.log('errore inserimento immagine');
                throw err;
            } else console.log('immagine aggiunta al db');
        }
    );
}
