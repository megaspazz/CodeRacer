
var socket = io();

const States = {
	NONE: 0,
	WAITING_FOR_RACE: 1,
	IN_RACE: 2
};

var currentState = States.NONE;

var currentRaceID = null;
var currentRaceText = null;
var currentRaceStartTimeMS = null;
var currentUsersInRace = null;
var currentCountdownTimerID = null;

var currentUserID = ~~(Math.random() * 1000000);    // initialize as the current user's ID
console.log("user id = " + currentUserID);

var myProgress = {
	currentLine: null,
	totalLines: null
};

function reportProgress() {
	//console.log("reporting progress");
	if (currentState === States.IN_RACE) {
		console.log("    in race!");
		myProgress.currentLine++;    // set actual progress
		socket.emit("progress_report", currentRaceID, currentUserID, myProgress);
	}
	if (currentState !== States.WAITING_FOR_RACE) {
		setTimeout(reportProgress, 1000);
	}
}

function updateCountdown() {
	var currTime = new Date();
	var remainingMS = currentRaceStartTimeMS - currTime.getTime();
	if (remainingMS <= 0) {
		// TODO: do other stuff to start the race
		$("#countdown").text("");
		currentState = States.IN_RACE;
	} else {
		// TODO: do nothing (?)
		$("#countdown").text(remainingMS);
		setTimeout(updateCountdown, 100);
	}
}

socket.on("found_race", function(raceID, raceText) {
	console.log("got request to start race from server");
	currentState = States.WAITING_FOR_RACE;
	currentRaceText = raceText;
	currentRaceID = raceID;
	// TODO: process the race text
});

socket.on("start_race_timer", function(startTime, usersInRaceJSON) {
	console.log("starting race timer");
	
	// start the countdown for the race start
	currentRaceStartTimeMS = Date.parse(startTime);
	updateCountdown();
	reportProgress();    // only report progress when the race actually starts
	
	// reset the current users in the race
	currentUsersInRace = { };
	
	// create a new object for users in the race
	var usersInRace = JSON.parse(usersInRaceJSON);
	for (var i = 0; i < usersInRace.length; i++) {
		currentUsersInRace[usersInRace[i]] = { };
	}
});

socket.on("race_state", function(raceID, userProgressesJSON) {
	console.log("got race state");
	var userProgresses = JSON.parse(userProgressesJSON);
	for (var id in userProgresses) {
		var progress = userProgresses[id];
		if (progress) {
			// update UI with other racers' progress
			console.log(id + ": " + progress.currentLine + " / " + progress.totalLines);
		}
	}
});

$("#btnRequestRace").click(function() {
	socket.emit("race_request", currentUserID);
});




$("#btnTestServer").click(function() {
	socket.emit("test request");
});

socket.on("test_receive", function(txt) {
	console.log("got request from server");
	$("#txtCode").text(txt);
});





var lines;
var counter;

function l(text) {
	lines = text.split("\n");
}

function test() {
	$(document).ready
}

function check(input) {
	if(input.length > lines[counter])
	{
		
	}
}