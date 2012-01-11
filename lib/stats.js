var net = require('net'),
    merge = require('./utils').merge;

exports.StatsServer = StatsServer;

function StatsServer(options)
{
    if (!(this instanceof StatsServer)) return new StatsServer(options);

    options = merge
    ({
        audience: null,
        port: 8080
    }, options);

    var server = net.Server();
    server.listen(options.port, 'localhost');
    server.on('connection', function(sock)
    {
        sock.write(JSON.stringify(options.audience.stats()));
        sock.end();
    });
}