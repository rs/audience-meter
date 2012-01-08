var options = require('commander'),
    cluster = require('cluster'),
    http = require('http');

options
    .version('0.3.0')
    .option('-d --debug', 'Log everything')
    .option('-w --workers <num>', 'Number of worker processes to spawn (default to the number of CPUs)', parseInt, require('os').cpus().length)
    .option('--sockjs-url', 'URL to the sockjs client library (default http://cdn.sockjs.org/sockjs-0.1.min.js)', 'http://cdn.sockjs.org/sockjs-0.1.min.js')
    .option('--notify-delta-ratio <ratio>', 'Minimum delta of number of members to reach before to notify ' +
                                            'listeners based on a fraction of the current number of members (default 0.1)', parseFloat, 0.1)
    .option('--notify-min-delay <seconds>', 'Minimum delay between notifications (default 2)', parseFloat, 2)
    .option('--notify-max-delay <seconds>', 'Maximum delay to wait before not sending notification ' +
                                            'because of min-delta not reached (default 60)', parseFloat, 60)
    .option('--namespace-clean-delay <seconds>', 'Minimum delay to wait before to clean an empty namespace (default 60)', parseFloat, 60)
    .option('--demo-port <port>', 'Public port on which to bind the demo server (default 8080, 0 to disable)', parseInt, 8080)
    .option('--stats-port <port>', 'Local port on which to bind the global stats server (default 1442, 0 to disable)', parseInt, 1442)
    .parse(process.argv);

function logger(severity, message)
{
    if (severity == 'error')
    {
        console.error('[%s] [%s] %s', cluster.isMaster ? 'master' : 'child#' + process.pid, severity, message);
    }
    else if (options.debug)
    {
        console.log('[%s] [%s] %s', cluster.isMaster ? 'master' : 'child#' + process.pid, severity, message);
    }
}

var sockjsOptions =
{
    sockjs_url: options.sockjsUrl,
    jsessionid: false,
    log: logger
};

var audienceOptions =
{
    notify_delta_ratio: options.notifyDeltaRatio,
    notify_min_delay: options.notifyMinDelay,
    notify_max_delay: options.notifyMaxDelay,
    namespace_clean_delay: options.namespaceCleanDelay,
    log: logger
};

if (cluster.isMaster)
{
    var url = require('url'),
        fs = require('fs'),
        net = require('net'),
        audience = require('./audience').Audience(audienceOptions);

    if (options.demoPort)
    {
        var demo = http.Server();
        demo.listen(options.demoPort);
        demo.on('request', function(req, res)
        {
            var path = url.parse(req.url, true).pathname;

            fs.readFile('./demo.html', function (err, data)
            {
                res.writeHead(200, {'Content-Type': 'text/html'});
                res.end(data.toString()
                   .replace(/\{hostname\}/g, req.headers.host.split(':')[0])
                   .replace(/\{namespace\}/g, path.replace(/^\/|\/.*/g, '')));
            });
        });
    }

    if (options.statsPort)
    {
        var admin = net.Server();
        admin.listen(options.statsPort, 'localhost');
        admin.on('connection', function(sock)
        {
            sock.write(JSON.stringify(audience.stats()));
            sock.end();
        });
    }

    var workers = [];

    for (var i = 0; i < options.workers; i++)
    {
        var worker = cluster.fork();
        workers.push(worker);

        worker.on('message', function(msg)
        {
            switch (msg.cmd)
            {
                case 'join':
                    audience.join(msg.namespace);
                    break;
                case 'leave':
                    audience.leave(msg.namespace);
                    break;
            }
        });
    }

    audience.on('notify', function(namespace)
    {
        workers.forEach(function(worker)
        {
            worker.send({cmd: 'notify', namespace: namespace.name, total: namespace.members});
        });
    });
}
else
{
    var events = require('events'),
        namespaces = require('./namespace').NamespaceCollection({log: logger}),
        sockjs = require('sockjs').createServer(sockjsOptions);

    process.on('message', function(msg)
    {
        if (msg.cmd == 'notify')
        {
            var namespace = namespaces.get(msg.namespace, false);
            if (namespace) namespace.notify(msg.total);
        }
    });

    sockjs.installHandlers(http.Server().listen(80), {prefix: '.*'});
    sockjs.on('connection', function(client)
    {
        logger('debug', client.pathname);
        var namespaceName = client.pathname.replace(/^\/|\/.*/g, '');
        if (namespaceName && namespaceName != 'lobby')
        {
            namespaces.get(namespaceName).join(client);
            process.send({cmd: 'join', namespace: namespaceName});
            client.on('close', function()
            {
                process.send({cmd: 'leave', namespace: namespaceName});
            });
        }

        client.on('data', function(message)
        {
            var namespaceNames = JSON.parse(message);

            if (!util.isArray(namespaceNames))
            {
                // array required
                return;
            }

            namespaceNames.forEach(function(namespaceName)
            {
                if (typeof namespaceName != 'string')
                {
                    // array of string required
                    return;
                }

                if (namespaceName && namespaceName != 'lobby')
                {
                    namespaces.get(namespaceName).join(client);
                }
            });
        });
    });
}