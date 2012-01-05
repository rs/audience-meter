var DEBUG = process.argv.indexOf('-d') > 0;

var sockjsOptions =
{
    sockjs_url: "http://cdn.sockjs.org/sockjs-0.1.min.js",
    jsessionid: false,
    // kinda disable heartbeat as the nature of the service already does hearteating
    heartbeat_delay: 9999999,
    log: function(severity, message)
    {
        if (severity == 'error')
        {
            console.error(message);
        }
        else if (DEBUG)
        {
            console.log(message);
        }
    }
};

var url = require('url'),
    fs = require('fs'),
    admin = require('net').createServer(),
    httpd = require('http').createServer(),
    sockjs = require('sockjs').createServer(sockjsOptions),
    audience = require('./audience').createInstance();

httpd.listen(80);
httpd.on('request', function(req, res)
{
    var location = url.parse(req.url, true),
        path = location.pathname;

    if (path.substr(path.length - 5, 5) === '.json')
    {
        res.writeHead(200, {'Content-Type': 'application/json'});
        var jsonp = location.query.callback ? location.query.callback : location.query.jsonp;
        if (jsonp) res.write(jsonp + '(');
        if (path === '/stats.json')
        {
            res.write(JSON.stringify(audience.stats()));
        }
        else
        {
            res.write(JSON.stringify(audience.info(path.substr(0, path.length - 5))));
        }
        if (jsonp) res.write(')');
        res.end();
    }
    else if (!path.match(/^\/audience/))
    {
        fs.readFile('./demo.html', function (err, data)
        {
            if (err)
            {
                res.writeHead(500, {'Content-Type': 'text/html'});
                res.end();
            }
            else
            {
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end(data.toString().replace(/\{hostname\}/g, req.headers.host).replace(/\{namespace\}/g, path.replace(/^\/|\/.*/g, '')));
            }
        });
    }
    else
    {
        return false;
    }
});

sockjs.installHandlers(httpd, {prefix: '[/]audience/.*'});
sockjs.on('connection', function(client)
{
    if (client.pathname != '/')
    {
        audience.join(client);
    }
    client.on('data', function(message)
    {
        // TODO handle listen
        conn.write(message);
    });
});

// Port 1442 used to gather stats on all live namespaces (format: <namespace>:<created>:<members>:<connections>\n)
admin.listen(1442, 'localhost');
admin.on('connection', function(sock)
{
    sock.write(JSON.stringify(audience.stats()));
    sock.end();
});