var path = require("path");

var express = require("express");
var app = express();
var http = require("http").Server(app);
var io = require("socket.io")(http);

// filesystem
var fs = require("fs");

const UserStates = {
	NONE: 0,
	STARTING: 1,
	STARTED: 2,
	FINISHED: 3,
	QUIT: 4
}

const PRE_RACE_TIME = 10000;

const PORT = 1997;

const CLIENT_PATH = path.resolve(__dirname + "/../client");

const RACE_TEXTS_PATH = __dirname + "/race_texts";

var activeRaces = { };
var activeUsers = { };    // NYI

app.use("/css",  express.static(CLIENT_PATH + "/css"));
app.use("/js",  express.static(CLIENT_PATH + "/js"));
app.use("/assets",  express.static(CLIENT_PATH + "/assets"));

app.get('/', function(req, res) {
	res.sendFile(CLIENT_PATH + "/index.html");
});

http.listen(PORT, function() {
	console.log("starting server on *:" + PORT);
});




function getUserProgresses(raceID) {
	let userProgresses = { };
	for (let userID in activeRaces[raceID].users) {
		userProgresses[userID] = activeRaces[raceID].users[userID].progress;
	}
	return userProgresses;
}

function getRaceStateFunction(raceID, userID) {
	return function() {
		let user = activeRaces[raceID].users[userID];
		
	}
}

function getStartRaceFunction(raceID, userID) {
	return function() {
		if (activeRaces[raceID]) {
			let user = activeRaces[raceID].users[userID];
			if (user && user.state === UserStates.STARTING) {
				user.state = UserStates.STARTED;
				user.connection.emit("start_race", raceID, activeRaces[raceID].raceText);
			}
		}
	}
}

function checkRaceCompleted(raceID) {
	let done = true;
	for (let id in activeRaces[raceID].users) {
		let userState = activeRaces[raceID].users[id].state;
		// is might be better to say that it's not FINISHED or QUIT
		if (userState === UserStates.NONE || userState === UserStates.STARTING || userState === UserStates.STARTED) {
			done = false;
			break;
		}
	}
	if (done) {
		// robon saves match into history table
		console.log("*** " + raceID + " ALL DONE ***");
		for (let id in activeRaces[raceID].users) {
			let user = activeRaces[raceID].users[id];
			let userProgresses = getUserProgresses(raceID);
			user.connection.emit("race_all_done", raceID, userProgresses);
		}
		delete activeRaces[raceID];
	}
	return done;
}

function checkRaceStarted(raceID) {
	let currTime = Date.now();
	return activeRaces[raceID] && activeRaces[raceID].startTime && currTime > activeRaces[raceID].startTime;
}

function getUsersInRace(raceID) {
	let usersInRace = [];
	for (let userID in activeRaces[raceID].users) {
		let user = activeRaces[raceID].users[userID];
		usersInRace.push(user.name);
	}
	return usersInRace;
}



io.on("connection", function(socket) {
	console.log("+ CONNECTION");

	socket.on("race_request", function(raceID, userID) {
		console.log("got race request");

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
				finishedRacers: 0,
				codeFile: fileNames[fileNum],
				raceText: codeText
			};
		}
		
		if (activeRaces[raceID].users[userID]) {
			var userState = activeRaces[raceID].users[userID].state;
			switch (userState) {
				case UserStates.QUIT:
					socket.emit("error_message", "Cannot rejoin after quitting in the middle of a race.");
					break;
				case UserStates.FINISHED:
					socket.emit("error_message", "Already finished the requested race.");
					break;
				default:
					socket.emit("error_message", "Already participant in requested race.");
					break;
			}
			return;
		}
		
		if (checkRaceStarted(raceID)) {
			socket.emit("error_message", "Cannot join a race that has already started.");
			return;
		}

		socket.emit("found_race", raceID);
		activeRaces[raceID].users[userID] = {
			name: userID,    // make this the actual display name
			connection: socket,
			progress: null,
			state: UserStates.NONE,
			finishTime: NaN
		}
		console.log(Object.keys(activeRaces[raceID].users).length);
		if (Object.keys(activeRaces[raceID].users).length >= 2) {
			if (!activeRaces[raceID].startTime) {
				let now = Date.now();
				var time = now + PRE_RACE_TIME;
				activeRaces[raceID].startTime = time;
			}
			
			let usersInRace = getUsersInRace(raceID);
			
			for (let userID in activeRaces[raceID].users) {
				let user = activeRaces[raceID].users[userID];
				if (user.state === UserStates.NONE) {
					user.state = UserStates.STARTING;
					let now = Date.now();
					let remainingTime = Math.max(0, activeRaces[raceID].startTime - now);
					let startRaceFn = getStartRaceFunction(raceID, userID);
					setTimeout(startRaceFn, remainingTime);
					console.log("remaining time = " + remainingTime);
					user.connection.emit("start_race_timer", raceID, remainingTime, usersInRace);
				} else if (user.state === UserStates.STARTING) {
					user.connection.emit("update_users_in_race", raceID, usersInRace);
				}
			}
		}
	});
	
	socket.on("progress_report", function(raceID, userID, progress) {
		console.log("got progress report from " + userID);
		if (!activeRaces[raceID] || !activeRaces[raceID].users[userID]) {
			console.log("warning: report for dead race.");
			socket.emit("force_refresh", "Tried to play a nonexistent race... try refreshing the webpage.");
			return;
		}

		activeRaces[raceID].users[userID].progress = progress;
		let userProgresses = getUserProgresses(raceID);
		socket.emit("race_state", raceID, userProgresses);
	});

	socket.on("disconnect", function() {
		console.log("- DISCONNECTION");
	});
	
	socket.on("quit_race", function(raceID, userID) {
		console.log("user " + userID + " quitting race " + raceID);
		
		// let the user know that they quit the race, even if it was non-existent or if they didn't belong to the race
		socket.emit("after_quit_race", raceID);
		
		if (activeRaces[raceID]) {
			if (checkRaceStarted(raceID)) {
				// if the race has already started, then we will mark the user as quitting the race
				let user = activeRaces[raceID].users[userID];
				
				// sometimes the server had to restart, so people might quit nonexistent races
				// in this case we will just let them know that they quit
				if (!user) {
					console.log("warning: unregistered user " + userID  + " tried to quit race " + raceID);
				}
				
				// if the user didn't finish the race we should record it in the stats
				if (user && !user.finishTime) {
					user.state = UserStates.QUIT;
					checkRaceCompleted(raceID);
				}
			} else {
				// if the race didn't start yet, we will just delete them from the list of racers
				if (activeRaces[raceID].users[userID]) {
					delete activeRaces[raceID].users[userID];
					let done = checkRaceCompleted(raceID);
					if (!done) {
						// if the race isn't over, update the list of racers for those still in the race
						let usersInRace = getUsersInRace(raceID);
						for (let userID in activeRaces[raceID].users) {
							let user = activeRaces[raceID].users[userID];
							user.connection.emit("update_users_in_race", raceID, usersInRace);
						}
					}
				}
			}
		} else {
			console.log("warning: tried to quit a nonexistent race!");
		}
	});
	
	socket.on("race_finished", function(raceID, userID, progress) {
		console.log("race finished");
		// sometimes the server had to restart, so people might be on zombie races
		if (!activeRaces[raceID] || !activeRaces[raceID].users[userID]) {
			socket.emit("force_refresh", "Tried to finish a nonexistent race... try refreshing the webpage.");
			return;
		}
		
		// calculate how long it took to finish the race
		let now = Date.now();
		let duration = now - activeRaces[raceID].startTime;
		
		// update this user in the set of active races
		activeRaces[raceID].users[userID].finishTime = duration;
		activeRaces[raceID].users[userID].progress = progress;
		activeRaces[raceID].users[userID].state = UserStates.FINISHED;
		console.log("!!! " + userID +  " FINISHED !!!");
		
		// update the number of finished racers, which is also the user's placement in the race
		activeRaces[raceID].finishedRacers++;
		let placement = activeRaces[raceID].finishedRacers;
		
		// calculate the CPM
		let cpm = progress.numCorrectKeys / duration * 60000;
		
		// calculate the accuracy
		let accuracyRating = progress.numCorrectKeys / (progress.numCorrectKeys + progress.numWrongKeys);
		
		// robon does individual user statistics
		//
		//
		
		
		let stats = {
			time: duration,
			rank: placement,
			accuracy: accuracyRating,
			charsPerMin: cpm
		}
		socket.emit("race_done", stats);
		
		checkRaceCompleted(raceID);
	});
	
	
	
	
	socket.on("test request", function() {
		console.log("  * GOT REQUEST!");
		socket.emit("test receive", "lorem ipsum herp derp");
	});
});
