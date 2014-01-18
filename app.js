var express = require('express')
	, http = require('http')
	, app = express()
	, server = http.createServer(app)
	, io = require('socket.io').listen(server)
	, routes = require('./routes')
	, mustacheExpress = require('mustache-express')
	, path = require('path');

app.configure(function () {
	app.set('port', process.env.VMC_APP_PORT || 1337);
	app.use(app.router);

	app.engine('mustache', mustacheExpress());
	app.set('views', __dirname + '/views');
	app.set('view engine', 'mustache');
	app.use(express.static(path.join(__dirname, 'public')));
});

app.get('/', routes.index);
app.get('/game', routes.game);

server.listen(app.get('port'), function() {
  console.log("Express server listening on port " + app.get('port'));
});


var MAX_USERS_PER_STORY = 10;
var STORY_LIFETIME = 1000*60*10;
var queuedStory = null;
var stories = [];

function closeStory() {
	if(stories.length > 0) {
		var story = stories.shift();

		sockets.broadcast.to(story.room).emit("done");

		story.closed = true;
	}
}

io.sockets.on('connection', function(socket) {
	// If there are no empty rooms, create one.
	if (queuedStory == null) {
		queuedStory = {
			id: stories.length,
			room: 'story-' + stories.length,
			users: 1,
			currentUserId: 1,
			closed: false,
		};
	}
	else {
		// There is a room waiting for users before beginning
		// the story. Let's increment the number of users in this queued
		// room.
		queuedStory.users++;
	}

	// Make the current user join the room and assign an id to
	// the suer.
	socket.join(queuedStory.room);
	socket.set('room', queuedStory.room);
	socket.set('userId', queuedStory.users);

	// Is the room filled?
	if(queuedStory.users == MAX_USERS_PER_STORY) {
		// Start the game and move the story from the queued story
		// to the activyt stories array.
		socket.broadcast.to(queuedStory.room).emit('game start');

		stories[queuedStory.room] = queuedStory;
		queuedStory = null;

		// Set a timer to close the room.
		setTimeout(closeStory, STORY_LIFETIME);
	}

	// Notify the user of the game's current configuration.
	socket.emit('setup', {
		userId: queuedStory.users,
		maxUsers: MAX_USERS_PER_STORY,
		storyLifetime: STORY_LIFETIME,
	});

	// Register the handler for when the user writes some words.
	socket.on('write', function(data) {
		// Get the user's room.
		socket.get('room', function(error, room) {
			var story = stories[room];

			// Make sure the story is still active.
			if(story.closed == false) {
				socket.get('userId', function(error, userId) {
					// Make sure the user is allowed to post words.
					if(story.currentUserId == userId) {
						story.currentUserId++;

						if(story.currentUserId == MAX_USERS_PER_STORY) {
							story.currentUserId = 0;
						}

						socket.broadcast.to(room).emit('wrote', {
							words: data.words,
							nextUserId: story.currentUserId,
						});
					}
				});
			}
		});
	})
});
