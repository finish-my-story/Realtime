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