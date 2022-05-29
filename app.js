const PORT = 8080;
require("dotenv").config();
const DATABASE_URL = process.env.DATABASE_URL;
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const path = require("path");
const ws = require("ws");

// CockroachDB
const { Client } = require("pg");
const client = new Client(DATABASE_URL);

client.connect();

// Websocket
var sockets = [];

var queue = null;

var wss = new ws.Server({ port: 8081 });

wss.on("connection", (s) => {
	s.on("message", async (data) => {
		// when new client connected
		if (data[0] == 0) {
			// Initial handshake
			console.log("client connected");
			s.token = data.subarray(1); // handshake
			if (queue) { // test if somebody is in queue
				s.peer = queue;
				queue.peer = s;
				s.send("\x00" + (await client.query(`SELECT username FROM tokens WHERE token='${queue.token}'`)).rows[0]['username']);
				queue.send("\x00" + (await client.query(`SELECT username FROM tokens WHERE token='${s.token}'`)).rows[0]['username']);
				queue = null;
			} else {
				queue = s;
			}
		// when client sends heartbeat response
		} else if (data[0] == 1) {
			s.isAlive = true;
		// when client sends message
		} else {
			s.peer.send(data);
		}
	});
	s.on("close", () => {
		if (s.peer) {
			try {
				s.peer.peer = null;
				s.peer.terminate();
			} catch {}
		}
	});
	s.heartbeat = setInterval(() => {
		if (s.isAlive == false) {
			try {
				s.peer.peer = null;
				s.peer.terminate();
			} catch {}
			clearInterval(s.heartbeat);
			return s.terminate();
		}
		s.isAlive = false;
		s.send("\x01");
	}, 5000);
});

function generateToken() {
	const tokenChars = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
	let token = "";
	for (let i = 0; i < 16; i++) {
		token += tokenChars[Math.floor(Math.random() * tokenChars.length)];
	}
	return token;
}

// setting stuff up
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(cookieParser());

app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "/public/html/index.html"));
});

app.get("/login", (req, res) => {
	res.sendFile(path.join(__dirname, "/public/html/login.html"));
});

app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/html/register.html"));
});

app.get("/logout", (req, res) => {
	client.query(`DELETE FROM tokens WHERE token='${req.cookies['token']}'`);
	res.clearCookie("token");
	res.redirect("/");
});

app.get("/about", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/html/about.html"));
})

app.get("/chat", async (req, res) => {
	if ((await client.query(`SELECT * FROM tokens WHERE token='${req.cookies['token']}'`)).rowCount) {
		res.sendFile(path.join(__dirname, "/public/html/chat.html"));
	} else {
		res.redirect("/login?err=1")
	}
	// res.sendFile(path.join(__dirname, "/public/html/chat.html"));
});

app.get("*", (req, res) => {
	res.status(404).sendFile(path.join(__dirname, "/public/html/404.html"));
});

/* ------------------------------ API ------------------------------ */
app.post("/api/register", async (req, res) => {
	if ((await client.query(`SELECT username FROM users WHERE username='${req.body['username']}';`)).rowCount) {
		res.redirect("/register?err=0");
	} else {
		client.query(`INSERT INTO users (username, password) VALUES ('${req.body['username']}', '${req.body['password']}');`);
		let token;
		do {
			token = generateToken();
		} while ((await client.query(`SELECT * FROM tokens WHERE 	token='${token}'`)).rowCount)
		client.query(`INSERT INTO tokens (token, username) VALUES ('${token}', '${req.body['username']}')`);
		res.cookie("token", token, { maxAge: 86400000 });
		res.redirect("/chat");
	}
});

app.post("/api/login", async (req, res) => {
	if (((await client.query(`SELECT username FROM users WHERE username='${req.body['username']}';`)).rowCount)) {
		if ((await client.query(`SELECT * FROM users WHERE (username='${req.body['username']}' AND password='${req.body['password']}')`)).rowCount) {
			await client.query(`DELETE FROM tokens WHERE username='${req.body['username']}'`);
			let token;
			do {
				token = generateToken();
			} while ((await client.query(`SELECT * FROM tokens WHERE token='${token}'`)).rowCount)
			client.query(`INSERT INTO tokens (token, username) VALUES ('${token}', '${req.body['username']}')`);
			res.cookie("token", token, { maxAge: 86400000 });
			res.redirect("/chat");
		} else {
			res.redirect(`/login?username=${req.body['username']}&err=0`);
		}
	} else {
		res.redirect("/register?err=1");
	}
});

app.listen(PORT);