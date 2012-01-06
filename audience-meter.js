var options = require('commander');

options
    .version('0.2.0')
    .option('-d --debug', 'Log everything + profiling')
    .option('--notify-delta-ratio <ratio>', 'Minimum delta of number of members to reach before to notify ' +
                                            'listeners based on a fraction of the current number of members (default 0.1)', parseFloat)
    .option('--notify-min-delay <seconds>', 'Minimum delay between notifications (default 2)', parseFloat)
    .option('--notify-max-delay <seconds>', 'Maximum delay to wait before not sending notification ' +
                                            'because of min-delta not reached (default 60)', parseFloat)
    .option('--namespace-clean-delay <seconds>', 'Minimum delay to wait before to clean an empty namespace (default 60)', parseFloat)
    .parse(process.argv);

function logger(severity, message)
{
    if (severity == 'error')
    {
        console.error(message);
    }
    else if (options.debug)
    {
        console.log(message);
    }
}

var sockjsOptions =
{
    sockjs_url: "http://cdn.sockjs.org/sockjs-0.1.min.js",
    jsessionid: false,
    log: logger
};

var audienceOptions =
{
    notify_delta_ratio: options.notifyDeltaRatio || 0.1,
    notify_min_delay: options.notifyMinDelay || 2,
    notify_max_delay: options.notifyMaxDelay || 60,
    namespace_clean_delay: options.namespaceCleanDelay || 60,
    log: logger
};

var url = require('url'),
    fs = require('fs'),
    admin = require('net').createServer(),
    httpd = require('http').createServer(),
    sockjs = require('sockjs').createServer(sockjsOptions),
    audience = require('./audience').createInstance(audienceOptions);

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

sockjs.installHandlers(httpd, {prefix: '[/]audience\/[^/]+'});
sockjs.on('connection', function(client)
{
    try
    {
        var namespaceName = client.pathname.replace(/^\/audience\/|\/.*/g, '');
        if (namespaceName && namespaceName != 'lobby')
        {
            audience.join(client, namespaceName);
        }
    }
    catch (e)
    {
        if (options.debug) console.warn(e);
    }

    client.on('data', function(message)
    {
        try
        {
            audience.subscribe(client, JSON.parse(message));
        }
        catch (e)
        {
            if (options.debug) console.log(e);
        }
    });
});

// Port 1442 used to gather stats on all live namespaces (format: <namespace>:<created>:<members>:<connections>\n)
admin.listen(1442, 'localhost');
admin.on('connection', function(sock)
{
    sock.write(JSON.stringify(audience.stats()));
    sock.end();
});