var http = require('http'),
    url = require('url'),
    io = require('socket.io');

var NAMESPACE_MAX_LEN = 50,
    NAMESPACE_MAX_LISTEN = 20;

var online = new function()
{
    var namespaces = {};

    this.create = function(namespace_name)
    {
        namespace = namespaces[namespace_name] = {};
        namespace.members = [];
        namespace.listeners = [];
        namespace.name = namespace_name;
        return namespace;
    }

    this.clean = function(namespace)
    {
        if (namespace.members.length == 0 && namespace.listeners.length == 0)
        {
            delete namespaces[namespace.name];
            return true;
        }
    }

    this.join = function(client, namespace_name)
    {
        if (namespace_name[0] !== '/')
        {
            // Prefix the namespace to prevent from overwrite of internal Object structure
            namespace_name = '/' + namespace_name;
        }

        if (client.namespace)
        {
            if (client.namespace.name === namespace_name)
            {
                // Client subscribe to its current namespace, nothing to be done
                return;
            }

            this.remove(client);
        }

        var namespace = namespaces[namespace_name];
        if (!namespace)
        {
            namespace = this.create(namespace_name);
        }

        namespace.members.push(client);
        client.namespace = namespace;
        this.notify(namespace);
    }

    this.leave = function(client)
    {
        if (client.namespace)
        {
            var namespace = client.namespace;
            namespace.members.splice(namespace.members.indexOf(client), 1);
            if (!this.clean(namespace))
            {
                this.notify(namespace);
            }
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
            var namespace = namespaces[namespace_names[i]];
            if (!namespace)
            {
                namespace = this.create(namespace_names[i]);
            }
            namespace.listeners.push(client);
            client.listened.push(namespace);
            info[namespace.name] = namespace.members.length;
        }
        client.send(JSON.stringify(info));
    }

    this.unlisten = function(client)
    {
        if (client.listened)
        {
            for (var i in client.listened)
            {
                var namespace = client.listened[i];
                namespace.listeners.splice(namespace.listeners.indexOf(client), 1);
                this.clean(namespace);
            }
            delete client.listened;
        }
    }

    this.remove = function(client)
    {
        this.leave(client);
        this.unlisten(client);
    }

    this.notify = function(namespace)
    {
        var info = {};
        info[namespace.name] = namespace.members.length;
        info = JSON.stringify(info);
        for (var i in namespace.listeners)
        {
            namespace.listeners[i].send(info);
        }
    }

    this.info = function(namespace_name)
    {
        return namespaces[namespace_name] ? namespaces[namespace_name].members.length : 0;
    }

    this.stats = function()
    {
        var stats = {};
        for (var namespace_name in namespaces)
        {
            stats[namespace_name] = namespaces[namespace_name].members.length;
        }
        return stats;
    }
}

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
        res.write('socket.on("connect", function() {socket.send("{\\"join\\": \\""+location.pathname+"\\"}");});\n');
        res.write('socket.on("message", function(count) {document.getElementById("total").innerHTML = count;});\n');
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
                listen = command.listen;
            }
        }
        catch (err)
        {
            client.send(JSON.stringify({err: err}));
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
