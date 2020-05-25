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
        else
            db.exec('PRAGMA foreign_keys = ON;', function (error) {
                if (error) {
                    console.error("Pragma statement didn't work.");
                } else {
                    console.log('Foreign Key Enforcement is on.');
                }
            });
    }
);

app.post('/register', function (req, res) {
    console.log('\nPOST: /register');
    if (
        req.body &&
        !(
            req.body.name == '' ||
            req.body.email == '' ||
            req.body.password == ''
        )
    ) {
        //TODO registrazione nomi con maiuscole, niente spazi o caratteri speciali
        const user = {
            nickname: req.body.name,
            email: req.body.email,
            password: req.body.password,
        };

        const token = jwt.sign({ user }, 'the_secret_key');

        dbInsertUser(user.nickname, user.email, user.password)
            .then(() => {
                console.log(
                    'Utente registrato - {nickname: ' +
                        user.nickname +
                        'email: ' +
                        user.email +
                        '}'
                );
                res.json({
                    token,
                    email: user.email,
                    nickname: user.nickname,
                });
            })
            .catch((err) => {
                let error = '';
                if (err.toString().search('email') != -1)
                    error = 'Email già registrata!';
                else if (err.toString().search('nickname') != -1)
                    errors = 'Nome già registrato!';
                res.status(401).json(error);
            });
    } else res.status(400); //TODO errore
});

app.post('/login', function (req, res) {
    console.log('\nPOST: /login');
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
    console.log('\nPOST: /draw');
    jwt.verify(req.token, 'the_secret_key', (err, decoded) => {
        if (err) {
            res.status(401).json({ err });
        } else {
            console.log('Richiesta save ricevuta');
            let title = req.body.title;
            console.log(req.body.title);
            if (!title) title = 'unnamed';
            if (title.length < 30) {
                insertImage(title, decoded.user.nickname, req.files.file[0])
                    .then((response) => {
                        console.log(response);
                        if (response === 'SAVED')
                            res.json('Salvato correttamente');
                        else res.json('Immagine sovrascritta correttamente');
                    })
                    .catch((err) => {
                        console.log(err);
                        res.status(400).json(err);
                    });
            }
            else {
                res.status(400).json('Nome troppo lungo');
            }
        }
    });
});

app.get('/profile/:user/gallery', function (req, res) {
    console.log('\nGET: /profile/:user/gallery');
    if (req.body) {
        db.get(
            `SELECT nickname FROM user WHERE nickname = ?`,
            [req.params.user],
            (err, row) => {
                if (err) {
                    console.log('Errore nella ricerca della galleria');
                    res.status(400).json('Impossibile reperire la galleria');
                } else if (!row) {
                    console.log('Utente non presente');
                    res.status(404).json('Utente non trovato');
                } else {
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
            }
        );
    }
});

app.post('/profile/:user/gallery/option', verifyToken, (req, res) => {
    console.log('\nPOST: /profile/:user/gallery/option');
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
                    setAvatar(
                        decoded.user.nickname,
                        req.body.title,
                        req.body.author
                    ).then(() => {
                        console.log('Avatar Impostato');
                        res.json('Avatar impostato');
                    });
                    break;
                default:
                    res.status(400).json('Richiesta non riconosciuta');
            }
        }
    });
});

app.get('/profile/:user', function (req, res) {
    console.log('\nGET: /profile/:user');
    if (req.body) {
        db.get(
            `SELECT nickname, IFNULL(av_path, './images/default.png') as av_path FROM user WHERE nickname = ?`,
            [req.params.user],
            (err, row) => {
                if (err) {
                    console.log(err);
                } else {
                    if (row) {
                        console.log(row);
                        let avatar = row.av_path
                            ? row.av_path
                            : './images/default.png';
                        res.json({
                            avatar: avatar,
                            nickname: row.nickname,
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
    console.log('Server API _ Mouse-Sketch avviato, porta 3000!');
});

function dbInsertUser(nick, mail, password) {
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
    return new Promise((resolve, reject) => {
        fs.access(uri, fs.constants.W_OK, (err) => {
            if (err) {
                console.log(err.code);
                console.log('Creazione file e inserimento path nel db');
                fs.writeFile(uri, file.buffer, (err) => {
                    if (err) {
                        console.log(err);
                        console.log('Errore creazione');
                        reject();
                    } else
                        dbInsertImage(name, author, uri)
                            .then(() => resolve('SAVED'))
                            .catch((err) => reject(err));
                });
            } else {
                fs.writeFile(uri, file.buffer, (err) => {
                    if (err) {
                        reject();
                        console.log('errore sovrascrittura immagine');
                    } else {
                        resolve('REWRITED');
                    }
                });
            }
        });
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

function dbInsertImage(name, author, path) {
    return new Promise((resolve, reject) =>
        db.run(
            `INSERT INTO image(name,author,path) VALUES (?,?,?)`,
            [name, author, path],
            (err) => {
                if (err) {
                    console.log('errore inserimento immagine');
                    reject(err);
                } else {
                    console.log('immagine aggiunta al db');
                    resolve();
                }
            }
        )
    );
}

function renameImage(oldTitle, newTitle, author) {
    return new Promise((resolve, reject) => {
        if (newTitle.length > 30) {
            reject('Nome troppo lungo!');
            return;
        }
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
