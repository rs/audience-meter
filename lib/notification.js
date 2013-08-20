var http = require('http'),
    url = require('url'),
    merge = require('./utils').merge;

exports.NotificationServer = NotificationServer;

function NotificationServer(options)
{
    if (!(this instanceof NotificationServer)) return new NotificationServer(options);

    options = merge
    ({
        audience: null,
        port: 8080
    }, options);

    var server = http.Server();
    server.listen(options.port);
    server.on('request', function(req, res)
    {
        var pathname = url.parse(req.url, true).pathname;
        var path2ns = /^\/([^\/]+)(?:\/([^\/]+))(?:\/([^\/]*))$/;
        if ((pathInfo = pathname.match(path2ns)))
        {
            var namespace = pathInfo[1],
                serviceName = pathInfo[2],
                msg = pathInfo[3];
            options.audience.sendMessage(namespace, serviceName + '=' + msg);
        }
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end();
    });
}
