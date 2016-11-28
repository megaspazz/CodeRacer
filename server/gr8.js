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

// TODO: for all functions, first verify validity of args
	// when updating user, verify user exists? current implementation is
	// it will just do nothing
	// i think

// registers a completely new user
// make sure uname is actually unique
function addUser(uname, dispName, userEmail, pass) {
	MongoClient.connect(url, null, (err, db) => {
		if (err) {
			console.log("ERROR: addUser: connect: ", err);
			return;
		}
		console.log("SUCCESS: addUser: connect: ", url);
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
		collection.insertOne(user, null, (err, result) => {
			if (err) {
				console.log("ERROR: addUser: insertOne: ", err);
				db.close();
				return;
			}
			console.log("SUCCESS: addUser: insertOne: ", "<opt. result text>");
			db.close();
		});
	});
}

// update an existing user's name
function updateUserDisplayName(uname, dispName) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			console.log("ERROR: updateUserDisplayName: connect: ", err);
			return;
		} 
		console.log("SUCCESS: updateUserDisplayName: connect: ", url);
		let collection = db.collection("users");
		collection.updateOne({ username: uname },
			{ $set: { displayName: dispName } },
			(err, result) => {
				if (err) {
					console.log("ERROR: updateUserDisplayName: updateOne: ", err);
					db.close();
					return;
				}
				console.log("SUCCESS: updateUserDisplayName: updateOne: ", "<opt. result text>");
				db.close();
			});
	});
}

// update an existing user's email
function updateUserEmail(uname, userEmail) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			console.log("ERROR: updateUserEmail: connect: ", err);
			return;
		} 
		console.log("SUCCESS: updateUserEmail: connect: ", url);
		let collection = db.collection("users");
		collection.updateOne({ username: uname },
			{ $set: { email: userEmail } },
			(err, result) => {
				if (err) {
					console.log("ERROR: updateUserEmail: updateOne: ", err);
					db.close();
					return;
				}
				console.log("SUCCESS: updateUserEmail: updateOne: ", "<opt. result text>");
				db.close();
			});
	});
}

// update an existing user's password
function updateUserPassword(uname, pass) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			console.log("ERROR: updateUserPassword: connect: ", err);
			return;
		}
		console.log("SUCCESS: updateUserPassword: connect: ", url);
		let collection = db.collection("users");
		collection.updateOne({ username: uname },
			{ $set: { password: pass } },
			(err, result) => {
				if (err) {
					console.log("ERROR: updateUserPassword: updateOne: ", err);
					db.close();
					return;
				}
				console.log("SUCCESS: updateUserPassword: updateOne: ", "<opt. result text>");
				db.close();
			});
	});
}

function addRaceToHistory(racers, rankings, wpms, accuracies, textTitle) {
	MongoClient.connect(url, (err, db) => {
		if (err) {
			console.log("ERROR: addRaceToHistory: connect: ", err);
			return;
		}
		console.log("SUCCESS: addRaceToHistory: connect: ", url);
		let collection = db.collection("users");
		let today = new Date();
		for (let i = 0; i < racers.length; i++) {
			if (racers[i] === "Guest") {
				continue;
			}
			collection.findOne({ username: racers[i] },
				(err, doc) => {
					if (err) {
						console.log("ERROR: addRaceToHistory: findOne: ", err);
						db.close();
						return;
					} 
					console.log("SUCCESS: addRaceToHistory: findOne: ", "<opt. result text>");
					let num = doc.history.length;
					let historyEntry = {
						participants: racers,
						rank: rankings[i],
						wpm: wpms[i],
						accuracy: accuracies[i],
						title: textTitle,
						raceNumber: num + 1,
						date: today
					};
					collection.updateOne( {username: racers[i] },
						{ $push: { history: historyEntry } },
						(err, result) => {
							if (err) {
								console.log("ERROR: addRaceToHistory: updateOne: history: ", err);
								db.close();
								return;
							}
							console.log("SUCCESS: addRaceToHistory: updateOne: history: ", "<opt. result text>");
							let sum = 0;
							let sum10 = 0;
							let num10 = 0;
							// PROBLEM: modifying wrong doc; need to get handle of new doc
							for (let j = num; j >= 0; j--) {
								if (j >= num - 10) {
									sum10 += (doc.history)[j].wpm;
									num10++;
								}
								sum += (doc.history[j]).wpm;
							}
							let lifetimeWpm = sum / num;
							let pastTenWpm = sum10 / num10;
							let newStats = {
								wpm: lifetimeWpm,
								wpm10: pastTenWpm,
								numRaces: num
							};
							collection.updateOne( { username: racers[i] },
								{ $set: {stats: newStats } },
								(err, result) => {
									if (err) {
										console.log("ERROR: addRaceToHistory: updateOne: stats: ", err);
										db.close();
										return;
									}
									console.log("SUCCESS: addRaceToHistory: updateOne: stats: ", "<opt. result text>");
									if (i == racers.length - 1) {
										// PROBLEM: won't be reached if last is guest
										db.close();
									}
								})
						});
				});
		}
	});
}