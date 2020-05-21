const express = require('express');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');
const multer = require('multer'); //Gestione multiform
const cors = require('cors'); //Bypass di sicurezza
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

        //TODO registrazione nomi con maiuscole, niente spazi o caratteri speciali
        const user = {
            nickname: req.body.name.toLowerCase(),
            email: req.body.email.toLowerCase(),
            password: req.body.password,
        };

        const token = jwt.sign({ user }, 'the_secret_key');

        dbInstertUser(user.nickname, user.email, user.password)
            .then(() =>
                res.json({
                    token,
                    email: user.email,
                    nickname: user.nickname,
                })
            )
            .catch((err) => res.status(401).json(err));
    } else res.status(400); //TODO errore
});

app.post('/login', function (req, res) {
    if (req.body) {
        db.get(
            `SELECT nickname, email, password FROM user WHERE email = ? AND password = ?`,
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
                    } else
                        res.status(401).json({
                            err: 'Email o Password errati!',
                        });
                }
            }
        );
    } else res.status(400).json({ err: 'Bad Request' });
});

app.post('/draw', verifyToken, function (req, res) {
    jwt.verify(req.token, 'the_secret_key', (err, decoded) => {
        if (err) {
            console.log('UHAA');
            res.status(401).json({ err });
        } else {
            let title = req.body.title;
            if (!title) title = 'unnamed';
            insertImage(title, decoded.user.nickname, req.files.file[0]);
            res.json('Salvato correttamente');
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
                    res.json(rows);
                }
            }
        );
    }
});

app.post('/profile/:user/gallery/option', verifyToken, (req, res) => {
    jwt.verify(req.token, 'the_secret_key', (err, decoded) => {
        if (err) {
            res.status(401).json({ err });
        } else if (
            req.params.user.toLowerCase != decoded.user.nickname.toLowerCase
        ) {
            res.status(401).json({ err });
        } else {
            console.log('## Istruzioni ricevute:\n', req.body, '\n##\n\n');
            switch (req.body.mode) {
                case 'RENAME':
                    renameImage(
                        req.body.oldTitle,
                        req.body.newTitle,
                        decoded.user.nickname
                    )
                        .then(() => {
                            //#### DEBUG ####//
                            console.log(
                                '-- Immagine rinominata -- $',
                                decoded.user.nickname,
                                '\nNome precedente: ',
                                req.body.oldTitle,
                                '\nNome nuovo: ',
                                req.body.newTitle,
                                '\n--------------'
                            );
                            //#############//
                            res.json('Immagine rinominata');
                        })
                        .catch((err) => {
                            console.log(err);
                            res.status(400).json(
                                'Errore nella rinominazione: '
                            );
                        });
                    break;
                case 'DELETE':
                    deleteImage(req.body.title, req.body.author)
                        .then(() => {
                            console.log('Immagine eliminata');
                            res.json('Immagine eliminata');
                        })
                        .catch(() => {
                            console.log(err);
                            res.status(400).json('Errore nella rimozione: ');
                        });
                    break;
                case 'SET_AVATAR':
                    setAvatar(decoded.user.nickname, req.body.title, req.body.author).then(() => {
                        console.log('Avatar Impostato');
                        res.json('Avatar impostato')
                    })
                    break;
                default:
                    res.status(400).json('Richiesta non riconosciuta');
            }
        }
    });
});

app.get('/profile/:user', function (req, res) {
    if (req.body) {
        db.get(
            `SELECT nickname, av_path, COUNT(*) as drawings FROM user, image WHERE author = nickname AND nickname = ?`,
            [req.params.user],
            (err, row) => {
                if (err) {
                    console.log(err);
                } else {
                    if (row) {
                        console.log(row);
                        res.json({
                            avatar: row.av_path,
                            nickname: row.nickname,
                            drawings: row.drawings,
                        });
                    } else {
                        console.log('not found');
                        res.status(404).json({ err: 'Utente non trovato!' });
                    }
                }
            }
        );
    } else res.status(400).json({ err: 'Bad request' });
});

app.listen(3000, function () {
    console.log('Example app listening on port 3000!');
});

function dbInstertUser(nick, mail, password) {
    return new Promise((resolve, reject) =>
        db.run(
            `INSERT INTO user(nickname,email,password) VALUES (?,?,?)`,
            [nick, mail, password],
            function (err) {
                if (err) {
                    reject(err);
                } else resolve();
            }
        )
    );
}

//AUX function

function insertImage(name, author, file) {
    let uri = `./images/${author}-${name}.png`;
    return fs.access(uri, (err) => {
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
            } else console.log('immagine aggiunta al db');
        }
    );
}

function renameImage(oldTitle, newTitle, author) {
    return new Promise((resolve, reject) => {
        let newUrl = `./images/${author}-${newTitle}.png`;
        let oldUrl = `./images/${author}-${oldTitle}.png`;
        db.run(
            `UPDATE image SET name = ?, path = ? WHERE author = ? AND name = ?`,
            [newTitle, newUrl, author, oldTitle],
            (err) => {
                if (err) {
                    console.log(err);
                    reject('Errore nella query: renameImage');
                } else {
                    fs.rename(oldUrl, newUrl, (err) => {
                        if (err) reject(err);
                        else resolve('immagine rinominata');
                    });
                }
            }
        );
    });
}
function deleteImage(name, author) {
    return new Promise((resolve, reject) => {
        let url = `./images/${author}-${name}.png`;
        db.run(
            `DELETE FROM image WHERE name = ? AND author = ?`,
            [name, author],
            (err) => {
                if (err) {
                    console.log('Problema nella query: deleteImage');
                    reject(err);
                } else {
                    fs.unlink(url, (err) => {
                        if (err) reject(err);
                        else {
                            resolve();
                        }
                    });
                }
            }
        ); 
    });
}

function setAvatar(nickname, title, author) {
    return new Promise((resolve, reject) => {
        let url = `./images/${author}-${title}.png`;
        fs.access(url, (err) => {
            if (err) {
                reject(err);
            } else {
                db.run(
                    `UPDATE user SET av_path = ? WHERE nickname = ?`,
                    [url, nickname],
                    (err) => {
                        if (err) {
                            reject(err);
                        } else resolve();
                    }
                );
            }
        });
    });
}
