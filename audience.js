var http = require('http'),
    url = require('url'),
    io = require('socket.io');

var NAMESPACE_MAX_LEN = 50,
    NAMESPACE_MAX_LISTEN = 20,
    NOTIFY_MIN_INTERVAL = 500;

var online = new function()
{
    var namespaces = {},
        $this = this;

    this.namespace = function(namespace_name, no_auto_create)
    {
        if (namespace_name[0] !== '/')
        {
            // Prefix the namespace to prevent from overwrite of internal Object structure
            namespace_name = '/' + namespace_name;
        }

        var namespace = namespaces[namespace_name];
        if (!namespace && !no_auto_create)
        {
            namespace = namespaces[namespace_name] = {};
            namespace.members = 0;
            namespace.listeners = [];
            namespace.lastNotified = 0;
            namespace.name = namespace_name;
        }
        return namespace;
    }

    this.clean_namespace = function(namespace)
    {
        if (namespace.members == 0 && namespace.listeners.length == 0)
        {
            delete namespaces[namespace.name];
            return true;
        }
    }

    this.join = function(client, namespace_name)
    {
        var namespace = this.namespace(namespace_name);

        if (client.namespace)
        {
            if (client.namespace === namespace)
            {
                // Client subscribe to its current namespace, nothing to be done
                return;
            }

            this.leave(client);
        }

        namespace.members++;
        client.namespace = namespace;
    }

    this.leave = function(client)
    {
        if (client.namespace)
        {
            var namespace = client.namespace;
            namespace.members--;
            this.clean_namespace(namespace);
            delete client.namespace;
        }
    }

    this.listen = function(client, namespace_names)
    {
        this.unlisten(client);
        client.listened = [];
        var info = {};
        for (var i in namespace_names)
        {
            var namespace = this.namespace(namespace_names[i]);
            namespace.listeners.push(client);
            client.listened.push(namespace);
            info[namespace.name] = namespace.members;
        }
        client.send(info);
    }

    this.unlisten = function(client)
    {
        if (client.listened)
        {
            client.listened.forEach(function(namespace)
            {
                namespace.listeners.splice(namespace.listeners.indexOf(client), 1);
                $this.clean_namespace(namespace);
            });
            delete client.listened;
        }
    }

    this.remove = function(client)
    {
        this.leave(client);
        this.unlisten(client);
    }

    this.notify = function()
    {
        var listeners = [];
        for (var namespace_name in namespaces)
        {
            var namespace = namespaces[namespace_name];
            if (namespace.listeners.length === 0 || namespace.lastNotifiedValue === namespace.members)
            {
                continue;
            }
            namespace.listeners.forEach(function(listener)
            {
                if (!listener.bufferNotif) listener.bufferNotif = {};
                listener.bufferNotif[namespace.name] = namespace.members;
            });
            namespace.lastNotifiedValue = namespace.members;
            listeners = listeners.concat(namespace.listeners);
        }

        listeners.forEach(function(listener)
        {
            if (listener.bufferNotif)
            {
                listener.send(listener.bufferNotif);
                delete listener.bufferNotif;
            }
        });
    }

    this.info = function(namespace_name)
    {
        var namespace = this.namespace(namespace_name, false);
        return namespace ? namespace.members : 0;
    }

    this.stats = function()
    {
        var stats = {};
        for (var namespace_name in namespaces)
        {
            var namespace = this.namespace(namespace_name);
            stats[namespace.name] = namespace.members;
        }
        return stats;
    }
}

setInterval(online.notify, NOTIFY_MIN_INTERVAL);

var server = http.createServer(function(req, res)
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
        res.write('Connected users: <span id="total">-</span>\n');
        res.write('<script src="/socket.io/socket.io.js"></script>\n');
        res.write('<script>\n');
        res.write('var socket = new io.Socket(location.host);\n');
        res.write('socket.connect();\n');
        res.write('socket.on("connect", function() {socket.send(JSON.stringify({join: location.pathname, listen: [location.pathname]}));});\n');
        res.write('socket.on("message", function(data) {document.getElementById("total").innerHTML = data[location.pathname];});\n');
        res.write('</script>\n');
        res.end();
    }
});
server.listen(80);

var socket = io.listen(server);
socket.on('connection', function(client)
{
    client.on('message', function(data)
    {
        var join = null, listen = [];
        try
        {
            try
            {
                var command = JSON.parse(data);
            }
            catch(err)
            {
                throw 'Invalid JSON command';
            }
            if (command.join)
            {
                if (typeof command.join != 'string')
                {
                    throw 'Invalid join value: must be a string'
                }
                if (command.join.length > NAMESPACE_MAX_LEN)
                {
                    throw 'Maximum length for namespace is ' + NAMESPACE_MAX_LEN;
                }
                join = command.join;
            }
            if (command.listen)
            {
                if (typeof command.listen != 'object' || typeof command.listen.length != 'number')
                {
                    throw 'Invalid listen value: must be an array';
                }
                if (command.listen.length > NAMESPACE_MAX_LISTEN)
                {
                    throw 'Maximum listenable namespaces is ' + NAMESPACE_MAX_LISTEN;
                }
                for (var i in command.listen)
                {
                    if (command.listen[i].length > NAMESPACE_MAX_LEN)
                    {
                        throw 'Maximum length for namespace is ' + NAMESPACE_MAX_LEN;
                    }
                }
                listen = command.listen;
            }
        }
        catch (err)
        {
            client.send({err: err});
            return;
        }

        if (join)
        {
            online.join(client, join);
        }

        if (listen)
        {
            online.listen(client, listen);
        }
    });
    client.on('disconnect', function()
    {
        online.remove(client);
    });
}); 
