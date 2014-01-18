var express = require('express')
	, app = express()
	, server = require('http').createServer(app)
	, io = require('socket.io').listen(server)
	, routes = require('./routes')
	, config = require('./config');

app.configure(function () {
	app.set('port', config.port);
	app.use(app.router);

	app.engine('mustache', config.engine);
	app.set('views', config.views);
	app.set('view engine', 'mustache');
	app.use(express.static(config.publicPath));
});

app.get('/', routes.index);
app.get('/game', routes.game);

server.listen(app.get('port'), function() {
  console.log("Express server listening on port " + app.get('port'));
});

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
	if(queuedStory.users == config.maxUsersPerStory) {
		// Start the game and move the story from the queued story
		// to the activyt stories array.
		socket.broadcast.to(queuedStory.room).emit('game start');

		stories[queuedStory.room] = queuedStory;
		queuedStory = null;

		// Set a timer to close the room.
		setTimeout(closeStory, config.storyLifetime);
	}

	// Notify the user of the game's current configuration.
	socket.emit('setup', {
		userId: queuedStory.users,
		maxUsers: config.maxUsersPerStory,
		storyLifetime: config.storyLifetime,
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

						if(story.currentUserId == config.maxUsersPerStory) {
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
