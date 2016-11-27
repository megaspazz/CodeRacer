"use strict";

let MongoClient = require("mongodb").MongoClient;
let url = "mongodb://localhost:27017/coderacerdb";

addUser("eric", "megaspazz", "erik@somewhere.com", "weird");
updateUserDisplayName("eric", "erik");
updateUserEmail("erik", "updated@gmail.com");
updateUserPassword("erik", "newPass");
addRaceToHistory(["Guest", "Guest", "eric"],
	[3, 2, 1],
	[20, 30, 300],
	[15, 20, 100],
	"de_dust2");

// PROBLEM: can't use genericCallback because it can't reference db to close it

function genericCallback(err, result) {
	if (err) {
		console.log("something went wrong: ", err);
	} else {
		console.log("something went right: ", "<result can go here if you want>");
	}
}

// TODO: for all functions, first verify validity of args
	// when updating user, verify user exists? current implementation is
	// it will just do nothing
	// i think

// registers a completely new user
// make sure uname is actually unique
function addUser(uname, dispName, userEmail, pass) {
	MongoClient.connect(url, null, (err, db) => {
		if (err) {
			console.log("addUser: unable to connect: ", err);
		} else {
			console.log("addUser: connection established: ", url);
			let collection = db.collection("users");
			let today = new Date();
			let newStats = { wpm: 0, wpm10: 0, numRaces: 0 };
			let hist = [];
			let user = {
				username: uname,
				displayName: dispName,
				email: userEmail,
				password: pass,
				joinDate: today,
				stats: newStats,
				history: hist
			};
			collection.insertOne(user, null, genericCallback);
		}
	});
}

// update an existing user's name
function updateUserDisplayName(uname, dispName) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			console.log("updateUserDisplayName: unable to connect: ", err);
		} else {
			console.log("updateUserDisplayName: connection established: ", url);
			let collection = db.collection("users");
			collection.updateOne({ username: uname },
				{ $set: { displayName: dispName } },
				genericCallback);
		}
	});
}

// update an existing user's email
function updateUserEmail(uname, userEmail) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			console.log("updateUserEmail: unable to connect: ", err);
		} else {
			console.log("updateUserEmail: connection established: ", url);
			let collection = db.collection("users");
			collection.updateOne({ username: uname },
				{ $set: { email: userEmail } },
				genericCallback);
		}
	});
}

// update an existing user's password
function updateUserPassword(uname, pass) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			console.log("updateUserPassword: unable to connect: ", err);
		} else {
			console.log("updateUserPassword: connection established: ", url);
			let collection = db.collection("users");
			collection.updateOne({ username: uname },
				{ $set: { password: pass } },
				genericCallback);
		}
	});
}

function addRaceToHistory(racers, rankings, wpms, accuracies, textTitle) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			console.log("addRaceToHistory: unable to connect: ", err);
			return;
		}
		console.log("addRaceToHistory: connection established: ", url);
		let collection = db.collection("users");
		// TODO: add race to global list
		for (let i = 0; i < racers.length; i++) {
			if (racers[i] === "Guest") {
				continue;
			}
			// collection.findOne({ username: "eric" }, null, genericCallback);
		}
		db.close();
	});
}

/*
function addRaceToHistory(racers, rankings, wpms, accuracies, textTitle) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			console.log("addRaceToHistory: unable to connect: ", err);
			return;
		}
		console.log("addRaceToHistory: connection established: ", url);
		let collection = db.collection("users");
		// TODO: add race to global list
		for (let i = 0; i < racers.length; i++) {
			if (racers[i] === "Guest") {
				continue;
			}
			collection.findOne({ username: racers[i] },
				null,
				(err, doc) => {
					if (err) {
						console.log("addRaceToHistory: findError: ", err);
						return;
					}
					let today = new Date();
					let num = doc.history.length;
					historyEntry = {
						participants: racers,
						rank: rankings[2],
						wpm: wpms[2],
						accuracy: accuracies[2],
						title: textTitle,
						raceNumber: num,
						date: today
					};
					collection.updateOne({ username: racers[2] },
						{ $push: { history: historyEntry } },
						(err, result) => {
							if (err) {
								console.log("rip");
								return;
							}
							let sum = 0;
							let sum10 = 0;
							let num = doc.stats.numRaces;
							let num10 = 0;
							let len = docs.history.length;
							for (let j = len - 1; j >= 0; j--) {
								if (j >= len - 10) {
									sum10 += docs.history[j].wpm;
									num10++;
								}
								sum += docs.history[j].wpm;
							}
							let lifetimeWpm = sum / num;
							let pastTenWpm = sum10 / num10;
							let newStats = {
								wpm: lifetimeWpm,
								wpm10: pastTenWpm,
								numRaces: num
							};
							collection.updateOne({ username: racers[i] },
								{ $set: { stats: newStats } },
								genericCallback);
						});
				});
		}
	});
}
*/

// add entry to user history
// NOTE currently does not update stats
/*
function addRaceToHistory(racers, rankings, wpms, accuracies) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			console.log("addRaceToHistory: unable to connect: ", err);
		} else {
			console.log("addRaceToHistory: connection established: ", url);
			let collection = db.collection("users");
			for (let i = 0; i < racers.length; i++) {
				if (racers[i] === "Guest") {
					continue;
				}
				collection.findOne({ username: racers[i] },
					null,
					(err, doc) => {
						if (err) {
							console.log("rip");
							return;
						}
						let today = new Date();
						let num = doc.history.length;
						historyEntry = {
							participants: racers,
							rank: rankings[i],
							wpm: wpms[i],
							accuracy: accuracies[i],
							date: today,
							raceNumber: num
						};
						collection.updateOne({ username: racers[i] },
							{ $push: { history: historyEntry } },
							(err, result) => {
								if (err) {
									console.log("something went wrong");
								} else {
									let sum = 0;
									let sum10 = 0;
									let num = doc.stats.numRaces;
									let num10 = 0;
									let len = docs.history.length;
									for (let j = len - 1; j >= 0; j--) {
										if (j >= len - 10) {
											sum10 += docs.history[j].wpm;
											num10++;
										}
										sum += docs.history[j].wpm;
									}
									let lifetimeWpm = sum / num;
									let pastTenWpm = sum10 / num10;
									let newStats = {
										wpm: lifetimeWpm,
										wpm10: pastTenWpm,
										numRaces: num
									};
									collection.updateOne({ username: racers[i] },
										{ $set: { stats: newStats } },
										genericCallback);
								}
							});
					});
			}
		}
		db.close();
	})
}
*/