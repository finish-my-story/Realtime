var mustacheExpress = require('mustache-express')
	, path = require('path');

exports.port = process.env.VMC_APP_PORT || 1337;
exports.engine = mustacheExpress();
exports.views =  __dirname + '/views';
exports.publicPath = path.join(__dirname, 'public');

exports.maxUsersPerStory = 2;
exports.storyLifetime = 10000;