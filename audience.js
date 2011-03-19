var http = require('http'),
    url = require('url'),
    io = require('socket.io');

var MAX_NAMESPACE_LENGTH = 50;

var online = new function()
{
    var namespaces = {};

    this.add = function(client, namespace)
    {
        if (namespace[0] !== '/')
        {
            // Prefix the namespace to prevent from overwrite of internal Object structure
            namespace = '/' + namespace;
        }

        if (client.namespace)
        {
            if (client.namespace.name === namespace)
            {
                // Client subscribe to its current namespace, nothing to be done
                return;
            }

            this.remove(client);
        }

        if (!namespaces[namespace])
        {
            namespaces[namespace] = [client];
            namespaces[namespace].name = namespace;
        }
        else
        {
            namespaces[namespace].push(client);
        }
        client.namespace = namespaces[namespace];
        this.notify(client.namespace);
    }

    this.remove = function(client)
    {
        if (client.namespace)
        {
            client.namespace.splice(client.namespace.indexOf(client), 1);
            if (client.namespace.length == 0)
            {
                delete namespaces[client.namespace.name];
            }
            else
            {
                this.notify(client.namespace);
            }
        }
    }

    this.get = function(namespace_name)
    {
        return namespaces[namespace_name] ? namespaces[namespace_name].length : 0;
    }

    this.notify = function(namespace)
    {
        var total = namespace.length;
        for (var i = 0; i < total; i++)
        {
            namespace[i].send(total);
        }
    }

    this.stats = function()
    {
        var stats = {};
        for (var namespace_name in namespaces)
        {
            stats[namespace_name] = namespaces[namespace_name].length;
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
            res.write(JSON.stringify(online.get(path.substr(0, path.length - 5))));
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
        res.write('socket.on("connect", function() {socket.send(location.pathname);});\n');
        res.write('socket.on("message", function(count) {document.getElementById("total").innerHTML = count;});\n');
        res.write('</script>\n');
        res.end();
    }
});
server.listen(80);

var socket = io.listen(server);
socket.on('connection', function(client)
{
    client.on('message', function(namespace)
    {
        online.add(client, namespace.substr(0, MAX_NAMESPACE_LENGTH));
    });
    client.on('disconnect', function()
    {
        online.remove(client);
    });
}); 
