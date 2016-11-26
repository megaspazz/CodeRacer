var path = require("path");

var express = require("express");
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);

// filesystem
var fs = require("fs");

const PORT = 1997;

const CLIENT_PATH = path.resolve(__dirname + "/../client");

const RACE_TEXTS_PATH = __dirname + "/race_texts";

var activeRaces = { };

app.use("/css",  express.static(CLIENT_PATH + "/css"));
app.use("/js",  express.static(CLIENT_PATH + "/js"));
app.use("/assets",  express.static(CLIENT_PATH + "/assets"));

app.get('/', function(req, res) {
	res.sendFile(CLIENT_PATH + "/index.html");
});

http.listen(PORT, function() {
	console.log("starting server on *:" + PORT);
});





io.on("connection", function(socket) {
	console.log("+ CONNECTION");

	socket.on("race_request", function(userID) {
		console.log("got race request");

		let raceID = 1997;



		//let raceText = "lorem ipsum\nherp derp";
		// let raceText = fs.readFileSync(__dirname + "/race_texts/sum.js", "utf8");

		if (!activeRaces[raceID]) {
			// actually get a random race text
			let fileNames = fs.readdirSync(RACE_TEXTS_PATH);
			let fileNum = ~~(Math.random() * fileNames.length);
			let fullFilePath = path.join(RACE_TEXTS_PATH, fileNames[fileNum]);
			let codeText = fs.readFileSync(fullFilePath, "utf8");

			console.log(fileNames);
			console.log(fileNames[fileNum]);
			console.log(codeText);

			activeRaces[raceID] = {
				users: { },
				startTime: null,
				codeFile: fileNames[fileNum],
				raceText: codeText
			};
		}

		socket.emit("found_race", raceID, activeRaces[raceID].raceText);
		activeRaces[raceID].users[userID] = {
			name: userID,    // make this the actual display name
			connection: socket,
			progress: null,
			finishTime: NaN
		}
		console.log(Object.keys(activeRaces[raceID].users).length);
		if (Object.keys(activeRaces[raceID].users).length >= 2) {
			if (!activeRaces[raceID].startTime) {
				let time = new Date();
				time.setSeconds(time.getSeconds() + 5);
				activeRaces[raceID].startTime = time;
			}
			
			let usersInRace = [];
			for (let userID in activeRaces[raceID].users) {
				let user = activeRaces[raceID].users[userID];
				usersInRace.push(user.name);
			}
			let usersInRaceJSON = JSON.stringify(usersInRace);
			
			let actualStartTime = activeRaces[raceID].startTime;
			for (let userID in activeRaces[raceID].users) {
				let user = activeRaces[raceID].users[userID];
				user.connection.emit("start_race_timer", actualStartTime, usersInRaceJSON);
			}
		}
	});
	
	socket.on("progress_report", function(raceID, userID, progress) {
		console.log("got progress report from " + userID);
		if (!activeRaces[raceID]) {
			console.log("warning: report for dead race.");
			return;
		}

		activeRaces[raceID].users[userID].progress = progress;
		let userProgresses = { };
		for (let userID in activeRaces[raceID].users) {
			userProgresses[userID] = activeRaces[raceID].users[userID].progress;
		}
		let userProgressesJSON = JSON.stringify(userProgresses);
		socket.emit("race_state", raceID, userProgressesJSON);
	});

	socket.on("disconnect", function() {
		console.log("- DISCONNECTION");
	});
	
	socket.on("race_finished", function(raceID, userID) {
		console.log("race finished");
		let now = new Date();
		let duration = now.getTime() - activeRaces[raceID].startTime.getTime();
		activeRaces[raceID].users[userID].finishTime = duration;
		activeRaces[raceID].users[userID].progress.currentLine = activeRaces[raceID].users[userID].progress.totalLines;
		console.log("!!! " + userID + " FINISHED !!!");
		// robon does individual user statistics
		//
		//
		let done = true;
		for (let id in activeRaces[raceID].users) {
			if (!activeRaces[raceID].users[id].finishTime) {
				done = false;
				break;
			}
		}
		if (done) {
			// robon saves match into history table
			console.log("*** " + raceID + " ALL DONE ***");
			for (let id in activeRaces[raceID].users) {
				let user = activeRaces[raceID].users[id];
				user.connection.emit("race_all_done", raceID);
			}
			delete activeRaces[raceID];
		}
	});
	
	
	
	
	socket.on("test request", function() {
		console.log("  * GOT REQUEST!");
		socket.emit("test receive", "lorem ipsum herp derp");
	});
});
