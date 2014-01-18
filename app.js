var express = require('express')
	, app = express()
	, server = require('http').createServer(app)
	, io = require('socket.io').listen(server)
	, routes = require('./routes')
	, config = require('./config')
	, mysql = require('mysql');

var credentials;

if(process.env.VCAP_SERVICES) {
	var services = JSON.parse(process.env.VCAP_SERVICES);
	var mysql = env['mysql-5.1'][0]['credentials'];

	credentials = {
		host     : credentials.host,
		port     : credentials.port,
		user     : credentials.user,
		password : credentials.password,
		database : credentials.name,
	}
}
else {
	credentials = {
		host     : '127.0.0.1',
		port     : '3306',
		user     : 'root',
		password : 'root',
		database : 'FMS',
	}
}

var connection = mysql.createConnection(credentials);

connection.connect();

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
var storiesCount = 0;

function closeOldestActiveStory() {
	var smallestId;
	var oldestStory = null;

	for(var key in stories) {
		if(oldestStory == null || stories[key].id < smallestId) {
			oldestStory = stories[key];
			smallestId = oldestStory.id;
		}
	}

	storiesCount--;
	oldestStory.closed = true;
	io.sockets.to(oldestStory.room).emit('time over');

	where = {id: smallestId};
	set = {
		text: oldestStory.words,
		active: 0,
	};

	connection.query('UPDATE stories SET ? WHERE ?', [set, where]);
}

function joinStory(callback) {
	// If there isn't an available room for the user to join, create a new one.
	if (queuedStory == null) {
		queuedStory = {
			users: 1,
			words: 'Start of story',
			currentUserId: 1,
			closed: false,
		};

		connection.query('INSERT INTO stories SET ?', {
			active: 1,
			up_votes: 0,
			down_votes: 0,
		}, function(error, result) {
			queuedStory.id = result.insertId;
			queuedStory.room = 'story-' + result.insertId;

			callback(queuedStory, 1);
		});
	}
	else {
		// There is a room waiting for more users to join. Let's increment
		// the number of users in this queued room.
		queuedStory.users++;

		callback(queuedStory, queuedStory.users);

		// Is the room full now that the user has joined?
		if(queuedStory.users == config.maxUsersPerStory) {
			// Start the game and move the story from the queued story
			// to the active stories array.
			io.sockets.to(queuedStory.room).emit('game start');

			stories[queuedStory.room] = queuedStory;
			queuedStory = null;
			storiesCount++;

			// Set a timer to close the room.
			setTimeout(closeOldestActiveStory, config.storyLifetime);
		}
	}
}

io.sockets.on('connection', function(socket) {
	joinStory(function(story, userId) {
		socket.join(story.room);

		socket.set('room', story.room);
		socket.set('userId', userId);

		socket.emit('setup', {
			userId: userId,
			words: story.words,
			maxWordsPerTurn: story.maxWordsPerTurn,
			maxUsers: config.maxUsersPerStory,
			storyLifetime: config.storyLifetime,
		});

		socket.broadcast.to(story.room).emit('user joined');
	});

	// Register the handler for when the user writes some words.
	socket.on('write', function(data) {
		// Get the user's room.
		socket.get('room', function(error, room) {
			var story = stories[room];

			// Make sure the story is still active.
			if(story != undefined && story.closed == false) {
				socket.get('userId', function(error, userId) {
					// Make sure the user is allowed to post words.
					if(story.currentUserId == userId) {
						var input = data.words.trim();

						if(input.split(" ").length <= config.maxWordsPerTurn) {
							story.words += ' ' + input;

							story.currentUserId++;

							if(story.currentUserId > config.maxUsersPerStory) {
								story.currentUserId = 1;
							}

							socket.broadcast.to(room).emit('wrote', {
								words: input,
								nextUserId: story.currentUserId,
							});

							var query = connection.query('INSERT INTO words SET ?', {
								story_id: 0,
								player_id: 0,
								value: input,
							});
						}
					}
				});
			}
		});
	})
});
