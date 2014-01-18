var mysql = require('mysql');

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

//connection.connect();

exports.index = function(request, response) {
	response.render('index', {
		test: 'Value',
	});
};

exports.game = function(request, response) {
	response.render('game', {
		key: 'hello',
	});
}