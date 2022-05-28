const	DATABASE_URL = "postgresql://sql:WoW0eh5qWUanCjAHr8E9yw@free-tier4.aws-us-west-2.cockroachlabs.cloud:26257/defaultdb?sslmode=verify-full&options=--cluster%3Dchic-sphinx-3020";

const PORT = 8080;

const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const path = require("path");
const url = require('url')

// CockroachDB
const { Client } = require("pg");
const client = new Client(DATABASE_URL);

client.connect();

// setting stuff up
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, "/public/html/index.html"));
});

app.get("/login", (req, res) => {
	res.sendFile(path.join(__dirname, "/public/html/login.html"));
});

app.get("/register", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/html/register.html"));
});

app.get("/about", (req, res) => {
    res.sendFile(path.join(__dirname, "/public/html/about.html"));
})

app.get("/chat", (req, res) => {
	res.sendFile(path.join(__dirname, "/public/html/chat.html"));
});

app.get("*", (req, res) => {
	res.status(404).sendFile(path.join(__dirname, "/public/html/404.html"));
});

/* ------------------------------ API ------------------------------ */
app.post("/api/register", async (req, res) => {
	console.log(req.body);
	if ((await client.query(`SELECT username FROM users WHERE username='${req.body['username']}';`)).rowCount) {
		res.redirect("/register?err");
	} else {
		client.query(`INSERT INTO users (username, password) VALUES ('${req.body['username']}', '${req.body['password']}');`);
		res.cookie = ""
		res.redirect("/chat");
	}
});

app.post("/api/login", (req, res) => {
	console.log(req.body);
	res.redirect("/chat");
});

app.post("/api/logout", (req, res) => {
	console.log(req.body);
	res.redirect("/");
});

app.listen(PORT);
