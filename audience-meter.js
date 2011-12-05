var DEBUG = process.argv.indexOf('-d') > 0,
    CMD_MAX_NAMESPACE_LEN = 50,
    CMD_MAX_NAMESPACE_LISTEN = 20,
    NAMESPACE_CLEAN_DELAY = 60000,
    NOTIFY_INTERVAL = 500;

var url = require('url'),
    fs = require('fs'),
    server = require('http').createServer(serverHandler),
    io = require('socket.io').listen(server, {log: DEBUG ? require('util').log : false}),
    net = require('net');

io.configure(function()
{
    io.enable('browser client minification');
    io.enable('browser client etag');
    io.enable('browser client gzip');
    io.set('log level', 1);
    io.set('transports', ['websocket', 'flashsocket', 'htmlfile', 'xhr-polling', 'jsonp-polling']);
});

server.listen(80);

var online = new function()
{
    var namespaces = {},
        $this = this;

    this.namespace = function(namespace_name, no_auto_create)
    {
        // Prefix namespace in order to prevent from overwriting Object internal properties
        var namespace = namespaces['@' + namespace_name];
        if (!namespace && !no_auto_create)
        {
            namespace = namespaces['@' + namespace_name] = {};
            namespace.created = Math.round(new Date().getTime() / 1000);
            namespace.members = 0;
            namespace.connections = 0;
            namespace.name = namespace_name;
        }
        return namespace;
    };

    this.clean_namespace = function(namespace)
    {
        if (namespace.members === 0)
        {
            namespace.garbageTimer = setTimeout(function()
            {
                delete namespaces['@' + namespace.name];
            }, NAMESPACE_CLEAN_DELAY);
        }
    };

    this.join = function(client, namespace_name)
    {
        var self = this;

        client.get('namespace', function(err, old_namespace_name)
        {
            if (old_namespace_name === namespace_name)
            {
                // Client subscribe to its current namespace, nothing to be done
                return;
            }

            if (old_namespace_name)
            {
                self.leave(client, old_namespace_name, function()
                {
                    self._join(client, namespace_name);
                });
            }
            else
            {
                self._join(client, namespace_name);
            }
        });
    };

    this._join = function(client, namespace_name)
    {
        var namespace = this.namespace(namespace_name);
        if (namespace.garbageTimer)
        {
            clearTimeout(namespace.garbageTimer);
            delete namespace.garbageTimer;
        }
        namespace.members++;
        namespace.connections++;
        client.set('namespace', namespace_name);
    };

    this.leave = function(client, namespace_name, callback)
    {
        var self = this;

        if (!namespace_name)
        {
            client.get('namespace', function(err, ns)
            {
                if (ns) self.leave(client, ns, callback);
            });
        }
        else
        {
            var namespace = this.namespace(namespace_name);
            namespace.members--;
            this.clean_namespace(namespace);
            client.del('namespace', callback);
        }
    };

    this.listen = function(client, namespace_names)
    {
        var info = {};
        namespace_names.forEach(function(namespace_name)
        {
            var namespace = $this.namespace(namespace_name);
            client.volatile.emit('statechange', {name: namespace_name, total: namespace.members});
            client.join(namespace_name);
        });
    };

    this.notify = function()
    {
        for (var namespace_name in namespaces)
        {
            var namespace = namespaces[namespace_name];
            if (namespace.lastNotifiedValue === namespace.members)
            {
                // Only notify if total members changed since the last notice
                continue;
            }
            var info = {};
            namespace.lastNotifiedValue = namespace.members;
            io.sockets.in(namespace.name).volatile.emit('statechange', {name: namespace.name, total: namespace.members});
        }
    };

    this.info = function(namespace_name)
    {
        var namespace = this.namespace(namespace_name, false);
        return namespace ? namespace.members + ':' + namespace.connections : '0:0';
    };

    this.stats = function()
    {
        var stats = {};
        for (var namespace_name in namespaces)
        {
            var namespace = this.namespace(namespace_name.substr(1));
            stats[namespace.name] =
            {
                created: namespace.created,
                members: namespace.members,
                connections: namespace.connections
            };
        }
        return stats;
    };
};

setInterval(online.notify, NOTIFY_INTERVAL);

var demo;
fs.readFile('./demo.html', function (err, data)
{
    if (err) throw err; 
    demo = data.toString();
});


function serverHandler(req, res)
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
            res.write(JSON.stringify(online.stats()));
        }
        else
        {
            res.write(JSON.stringify(online.info(path.substr(0, path.length - 5))));
        }
        if (jsonp) res.write(')');
        res.end();
    }
    else
    {
        res.writeHead(200, {'Content-Type': 'text/html'});
        res.end(demo.replace(/\{hostname\}/g, req.headers.host).replace(/\{pathname\}/g, path));
    }
}

io.sockets.on('connection', function(client)
{
    client.on('join', function(namespace)
    {
        try
        {
            if (typeof namespace != 'string')
            {
                throw 'Invalid join value: must be a string';
            }
            if (namespace.length > CMD_MAX_NAMESPACE_LEN)
            {
                throw 'Maximum length for namespace is ' + CMD_MAX_NAMESPACE_LEN;
            }
        }
        catch (err)
        {
            client.json.emit('error', err);
            return;
        }

        online.join(client, namespace);
        online.listen(client, [namespace]);
    });

    client.on('listen', function(namespaces)
    {
        try
        {
            if (typeof namespaces != 'object' || typeof namespaces.length != 'number')
            {
                throw 'Invalid listen value: must be an array';
            }
            if (namespaces.length > CMD_MAX_NAMESPACE_LISTEN)
            {
                throw 'Maximum listenable namespaces is ' + CMD_MAX_NAMESPACE_LISTEN;
            }
            namespaces.forEach(function(namespace)
            {
                if (namespace.length > CMD_MAX_NAMESPACE_LEN)
                {
                    throw 'Maximum length for namespace is ' + CMD_MAX_NAMESPACE_LEN;
                }
            });
        }
        catch (err)
        {
            client.json.emit('error', err);
            return;
        }

        online.listen(client, namespaces);
    });

    client.on('disconnect', function()
    {
        online.leave(client);
    });
});

// Port 1442 used to gather stats on all live namespaces (format: <namespace>:<created>:<members>:<connections>\n)
net.createServer(function(sock)
{
    var stats = online.stats();
    sock.write(JSON.stringify(stats));
    sock.end();
}).listen(1442, 'localhost');
