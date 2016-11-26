
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
	setTimeout(reportProgress, 1000);
}

// always check for progress
reportProgress();

function showCountdown() {
	var currTime = new Date();
	var remainingMS = currentRaceStartTimeMS - currTime.getTime();
	if (remainingMS <= 0) {
		$("#countdown").text("");
		currentState = States.IN_RACE;
	} else {
		$("#countdown").text(remainingMS);
		setTimeout(showCountdown, 100);
	}
}

socket.on("found_race", function(raceID, raceText) {
	console.log("got request to start race from server");
	currentState = States.WAITING_FOR_RACE;
	currentRaceText = raceText;
	currentRaceID = raceID;
});

socket.on("start_race_timer", function(startTime) {
	console.log("starting race timer");
	currentRaceStartTimeMS = Date.parse(startTime);
	showCountdown();
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