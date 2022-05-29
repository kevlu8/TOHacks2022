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
var active = [];

var queue = null;

var wss = new ws.Server({ port: 8081 });

// All three of us were high when we commented this part
wss.on("connection", (s) => { // On a web socket connection, do the following with the passed object `s':
	s.on("message", async (data) => { // When a message is received, do the following:
		// Handshake + matchmaking message
		if (data[0] == 0) { // Check if the first element of data[] is equal to 0
			// Add the new client to the list of active clients
			active.push(s); // Push the object `s' into the array `active'
			// Print a log message indicating that a new client has connected
			console.log("Client Connected"); // Log the message for debugging purposes
			// Add the token of the user to the socket
			s.token = data.toString().substring(1); // Set the token of the socket to the token of the user
			// Nobody is in the queue
			if (queue === null) { // Check if the queue is empty
				// Put the newly connected client in the queue
				queue = s; // Set the queue to the socket of the newly connected client
			// There is someone in the queue
			} else { // Other cases (i.e. if the queue is not empty)
				// Match the new client and the one in the queue
				s.peer = queue; // Setting the queue client to the peer of the current client
				queue.peer = s; // Setting the current client to the peer of the queue client
				// Tell both clients that they have been matched
				// Inform them of the other's username which will be resolved by querying the database with the token
				s.send("\x00" + (await client.query(`SELECT username FROM tokens WHERE token='${queue.token}'`)).rows[0]['username']); // Send the null character as well as the username of the queue client
				queue.send("\x00" + (await client.query(`SELECT username FROM tokens WHERE token='${s.token}'`)).rows[0]['username']); // Send the null character as well as the username of the current client
				// Clear the queue so the next user will be put in it
				queue = null; // Sets the queue to null, so the next user can be put in it
			} // End of the if-else statement
		// Check for a ping response from the client
		} else if (data[0] == 1) { // If the first element of the array `data' is equal to 1
			// A recieved ping means the client is still connected
			s.isAlive = true; // Keeps the client alive so that it does not exit out of the ping loop
		// A message was recieved from the client
		} else { // If all above conditions have not been met, do the following:
			// Forwards the message to the peer
			// Note: data is cast to string because otherwise it's an [object Blob]
			s.peer.send(data.toString()) // Sends all of data to the other user since theres no state identifing character at the begining
		} // End of the if-else statement
	}); // End of the on message function
	s.on("close", () => { // When the client closes the connection, do the following:
		// If s is connected to another client, disassociate the two, inform the other of the closure and disconnect them
		if (s.peer) { // Check if `s.peer' exists - i.e. if the client is connected to another client 
			// Inform the peer of the disassociation
			s.peer.peer = null; // Set the peer of the peer of s to null
			// Politely tell the peer to leave
			s.peer.send("\x02"); // zero two daaaaaaaaarling reference
		} // End of the if statement
		// Terminate the socket
		s.terminate(); // Terminate the socket
		// Delete the socket from active sockets
		active.forEach((x, i) => { // For each element in the array `active'
			if (x == s) // Check if the current element is equal to `s'
				active.splice(i, 1); // Remove the element at index `i'
		}); // End of the forEach loop
		// Stop the heartbeat
		clearInterval(s.heartbeat);
	}); // End of the on close function
	s.heartbeat = setInterval(() => { // Set an interval to check if the client is still connected
		// Check to see if the client has been disconnected
		if (s.isAlive === false) { // If the client is not alive, do the following:
			// If s is connected to another client, disassociate the two, inform the other of the closure and disconnect them
			if (s.peer) { // Check if `s.peer' exists - i.e. if the client is connected to another client 
				// Inform the peer of the disassociation
				s.peer.peer = null; // Set the peer of the peer of s to null
				// Politely tell the peer to leave
				s.peer.send("\x02"); // zero two daaaaaaaaarling reference
			} // End of the if statement
			// Delete the socket from active sockets
			active.forEach((x, i) => { // For each element in the array `active'
				if (x == s) // Check if the current element is equal to `s'
				active.splice(i, 1); // Remove the element at index `i'
			}); // End of the forEach loop
			// Stop the heartbeat
			clearInterval(s.heartbeat); // Stop the heartbeat
			// Terminate the socket
			return s.terminate(); // Terminate the socket and return to stop progression to the rest of the function
		} // End of the if statement
		// Set the socket back to dead
		s.isAlive = false; // Set isAlive of socket to false
		// Send a heartbeat ping
		s.send("\x01"); // Send the SOH character to the client
	}, 10000); // Repeat every 10 seconds
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